-- Phase 3b: Rewrite write RPCs to use unified order / order_item tables directly

create or replace function public.submit_agent_order(
  target_customer_id uuid,
  item_payload jsonb,
  customer_payload jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_agent_id uuid;
  current_agent_customer_id uuid;
  resolved_customer_id uuid := target_customer_id;
  requested_release_date timestamptz := private.parse_schedule_timestamp(coalesce(customer_payload ->> 'releaseDate', ''), customer_payload ->> 'releaseTime');
  inserted_order_id uuid;
  inserted_agent_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
  is_personal_order boolean := coalesce(customer_payload ->> 'orderFor', '') = 'personal';
  resolved_order_kind text;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to submit an order.';
  end if;

  select
    agent_row.id,
    agent_row.customer_id
  into
    current_agent_id,
    current_agent_customer_id
  from public.agent agent_row
  where agent_row.user_id = (select auth.uid())
    and agent_row.status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can submit agent orders.';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  if resolved_customer_id is null
    and not is_personal_order
    and (
      customer_payload is null
      or (
        jsonb_typeof(customer_payload) = 'object'
        and nullif(trim(coalesce(customer_payload ->> 'firstName', '')), '') is null
        and nullif(trim(coalesce(customer_payload ->> 'lastName', '')), '') is null
        and nullif(trim(coalesce(customer_payload ->> 'phoneNumber', '')), '') is null
        and nullif(trim(coalesce(customer_payload ->> 'address', '')), '') is null
      )
    ) then
    insert into public."order" (
      agent_id,
      order_status,
      release_date,
      submitted_by,
      order_kind,
      source,
      payment_status
    )
    values (
      current_agent_id,
      'pending_order',
      requested_release_date,
      (select auth.uid()),
      'distribution',
      'agent_submitted',
      'unpaid'
    )
    returning id into inserted_agent_order_id;
  else
    if is_personal_order then
      resolved_customer_id := current_agent_customer_id;

      if resolved_customer_id is null then
        insert into public.customer (
          assigned_agent_id,
          created_by,
          profile_id
        )
        select
          current_agent_id,
          (select auth.uid()),
          agent_row.profile_id
        from public.agent agent_row
        where agent_row.id = current_agent_id
        returning id into resolved_customer_id;

        update public.agent
        set customer_id = resolved_customer_id,
            updated_at = now()
        where id = current_agent_id
          and customer_id is null;
      end if;
    elsif resolved_customer_id is null then
      if customer_payload is null or jsonb_typeof(customer_payload) <> 'object' then
        raise exception 'Customer details are required for new agent customers.';
      end if;

      if nullif(trim(customer_payload ->> 'firstName'), '') is null then
        raise exception 'First name is required.';
      end if;

      if nullif(trim(customer_payload ->> 'lastName'), '') is null then
        raise exception 'Last name is required.';
      end if;

      if nullif(trim(customer_payload ->> 'phoneNumber'), '') is null then
        raise exception 'Phone number is required.';
      end if;

      if nullif(trim(customer_payload ->> 'address'), '') is null then
        raise exception 'Address is required.';
      end if;

      resolved_customer_id := private.create_customer_with_profile(
        trim(customer_payload ->> 'firstName'),
        trim(customer_payload ->> 'lastName'),
        trim(customer_payload ->> 'phoneNumber'),
        nullif(trim(coalesce(customer_payload ->> 'email', '')), ''),
        trim(customer_payload ->> 'address'),
        current_agent_id,
        false,
        (select auth.uid())
      );
    elsif not exists (
      select 1
      from public.customer
      where id = resolved_customer_id
        and (
          assigned_agent_id = current_agent_id
          or id = current_agent_customer_id
        )
    ) then
      raise exception 'Selected customer is not assigned to this agent.';
    end if;

    resolved_order_kind := case
      when is_personal_order then 'personal'
      else 'customer'
    end;

    insert into public."order" (
      customer_id,
      agent_id,
      source,
      order_status,
      payment_status,
      release_date,
      submitted_by,
      order_kind
    )
    values (
      resolved_customer_id,
      current_agent_id,
      'agent_submitted',
      'pending',
      'unpaid',
      requested_release_date,
      (select auth.uid()),
      resolved_order_kind
    )
    returning id into inserted_order_id;
  end if;

  for item in select value from jsonb_array_elements(item_payload)
  loop
    item_product_id := nullif(trim(item ->> 'productId'), '')::uuid;
    item_quantity := nullif(trim(item ->> 'quantity'), '')::numeric;
    item_details := nullif(trim(item ->> 'addDetails'), '');

    if item_product_id is null then
      raise exception 'Product id is required for every order item.';
    end if;

    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Order item quantity must be greater than zero.';
    end if;

    if not exists (
      select 1
      from public.product
      where id = item_product_id
        and is_active = true
    ) then
      raise exception 'Product % is not available for agent ordering.', item_product_id;
    end if;

    if inserted_order_id is not null then
      insert into public.order_item (
        order_id,
        product_id,
        partial_quantity,
        final_quantity,
        add_details,
        order_kind,
        unit_price,
        price_type,
        agent_commission_amount
      )
      select
        inserted_order_id,
        item_product_id,
        item_quantity,
        item_quantity,
        item_details,
        resolved_order_kind,
        case
          when customer_row.is_reseller then product_row.reseller_price
          else product_row.default_price
        end,
        case
          when customer_row.is_reseller then 'reseller'::text
          else 'retail'::text
        end,
        round(
          coalesce(
            case product_row.agent_commission_type
              when 'percentage' then
                coalesce(
                  case
                    when customer_row.is_reseller then product_row.reseller_price
                    else product_row.default_price
                  end,
                  0
                ) * product_row.agent_commission_value / 100
              else product_row.agent_commission_value
            end,
            0
          ) * item_quantity,
          2
        )
      from public.product product_row
      cross join public.customer customer_row
      where product_row.id = item_product_id
        and customer_row.id = resolved_customer_id
        and product_row.default_price is not null
        and product_row.reseller_price is not null;

      if not found then
        raise exception 'Product % does not have valid prices for order item pricing.', item_product_id;
      end if;
    else
      insert into public.order_item (
        order_id,
        product_id,
        partial_quantity,
        final_quantity,
        add_details,
        order_kind,
        agent_commission_amount
      )
      values (
        inserted_agent_order_id,
        item_product_id,
        item_quantity,
        item_quantity,
        item_details,
        'distribution',
        coalesce(private.calculate_product_agent_commission(item_product_id, item_quantity, null), 0)
      );
    end if;
  end loop;

  if inserted_order_id is null and inserted_agent_order_id is null then
    raise exception 'At least one valid order item is required.';
  end if;

  return coalesce(inserted_order_id, inserted_agent_order_id);
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
    raise exception 'Agent order payload contains an invalid product id, quantity, or release date.';
end;
$$;

create or replace function public.attach_customer_to_agent_order(
  target_agent_order_id uuid,
  target_customer_id uuid,
  item_payload jsonb,
  customer_payload jsonb default null,
  require_approval boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_agent_id uuid;
  current_agent_customer_id uuid;
  resolved_customer_id uuid := target_customer_id;
  agent_order_agent_id uuid;
  agent_order_status text;
  inserted_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
  existing_item_quantity numeric;
  approved_distributed numeric;
  remaining_quantity numeric;
  quantity_increase numeric;
  order_status_value text;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated user is required to attach a customer order.';
  end if;

  select agent_id, order_status
  into agent_order_agent_id, agent_order_status
  from public."order"
  where id = target_agent_order_id
    and order_kind = 'distribution'
  limit 1;

  if agent_order_agent_id is null then
    raise exception 'Agent order was not found.';
  end if;

  if agent_order_status = 'closed'
     and exists (
       select 1
       from public."order" child_order
       where child_order.parent_order_id = target_agent_order_id
         and child_order.order_kind in ('customer', 'personal')
     )
     and not exists (
       select 1
       from public."order" child_order
       where child_order.parent_order_id = target_agent_order_id
         and child_order.order_kind in ('customer', 'personal')
         and child_order.payment_status is distinct from 'paid'
     ) then
    raise exception 'Completed and paid agent orders cannot accept new customers.';
  end if;

  if (select private.is_admin()) then
    current_agent_id := agent_order_agent_id;
  else
    select
      id,
      customer_id
    into
      current_agent_id,
      current_agent_customer_id
    from public.agent
    where user_id = (select auth.uid())
      and status = 'active'
    limit 1;

    if current_agent_id is null or current_agent_id <> agent_order_agent_id then
      raise exception 'Only the assigned agent can attach customer orders to this agent order.';
    end if;
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  if resolved_customer_id is null then
    if customer_payload is null or jsonb_typeof(customer_payload) <> 'object' then
      raise exception 'Customer details are required for new agent customers.';
    end if;

    if nullif(trim(customer_payload ->> 'firstName'), '') is null then
      raise exception 'First name is required.';
    end if;

    if nullif(trim(customer_payload ->> 'lastName'), '') is null then
      raise exception 'Last name is required.';
    end if;

    if nullif(trim(customer_payload ->> 'phoneNumber'), '') is null then
      raise exception 'Phone number is required.';
    end if;

    if nullif(trim(customer_payload ->> 'address'), '') is null then
      raise exception 'Address is required.';
    end if;

    resolved_customer_id := private.create_customer_with_profile(
      trim(customer_payload ->> 'firstName'),
      trim(customer_payload ->> 'lastName'),
      trim(customer_payload ->> 'phoneNumber'),
      nullif(trim(coalesce(customer_payload ->> 'email', '')), ''),
      trim(customer_payload ->> 'address'),
      current_agent_id,
      false,
      (select auth.uid())
    );
  elsif not (select private.is_admin()) and not exists (
    select 1
    from public.customer
    where id = resolved_customer_id
      and (
        assigned_agent_id = current_agent_id
        or id = current_agent_customer_id
      )
  ) then
    raise exception 'Selected customer is not assigned to this agent.';
  end if;

  order_status_value := case
    when require_approval then 'pending'
    else 'processing'
  end;

  insert into public."order" (
    customer_id,
    agent_id,
    parent_order_id,
    source,
    order_status,
    payment_status,
    release_date,
    submitted_by,
    approved_by,
    approved_at,
    order_kind
  )
  values (
    resolved_customer_id,
    current_agent_id,
    target_agent_order_id,
    case
      when (select private.is_admin()) then 'admin_manual'
      else 'agent_submitted'
    end,
    order_status_value,
    'unpaid',
    private.parse_schedule_timestamp(coalesce(customer_payload ->> 'releaseDate', ''), customer_payload ->> 'releaseTime'),
    (select auth.uid()),
    case
      when require_approval then null
      else (select auth.uid())
    end,
    case
      when require_approval then null
      else now()
    end,
    'customer'
  )
  returning id into inserted_order_id;

  for item in select value from jsonb_array_elements(item_payload)
  loop
    item_product_id := nullif(trim(item ->> 'productId'), '')::uuid;
    item_quantity := nullif(trim(item ->> 'quantity'), '')::numeric;
    item_details := nullif(trim(item ->> 'addDetails'), '');

    if item_product_id is null then
      raise exception 'Product id is required for every order item.';
    end if;

    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Order item quantity must be greater than zero.';
    end if;

    if not exists (
      select 1
      from public.product
      where id = item_product_id
        and is_active = true
    ) then
      raise exception 'Product % is not available for agent ordering.', item_product_id;
    end if;

    select partial_quantity
    into existing_item_quantity
    from public.order_item
    where order_id = target_agent_order_id
      and product_id = item_product_id
      and order_kind = 'distribution'
    limit 1;

    approved_distributed := private.agent_order_approved_distributed_quantity(
      target_agent_order_id,
      item_product_id
    );
    remaining_quantity := greatest(coalesce(existing_item_quantity, 0) - approved_distributed, 0);
    quantity_increase := greatest(item_quantity - remaining_quantity, 0);

    if not require_approval then
      perform private.apply_agent_order_item_quantity_increase(
        target_agent_order_id,
        item_product_id,
        case
          when existing_item_quantity is null then item_quantity
          else quantity_increase
        end,
        item_details
      );
    elsif existing_item_quantity is null then
      insert into public.order_item (
        order_id,
        product_id,
        partial_quantity,
        final_quantity,
        add_details,
        order_kind,
        agent_commission_amount
      )
      values (
        target_agent_order_id,
        item_product_id,
        0,
        0,
        item_details,
        'distribution',
        0
      );
    end if;

    insert into public.order_item (
      order_id,
      product_id,
      partial_quantity,
      final_quantity,
      add_details,
      agent_order_quantity_increase,
      order_kind,
      unit_price,
      price_type,
      agent_commission_amount
    )
    select
      inserted_order_id,
      item_product_id,
      item_quantity,
      item_quantity,
      item_details,
      case
        when require_approval then
          case
            when existing_item_quantity is null then item_quantity
            else quantity_increase
          end
        else 0
      end,
      'customer',
      case
        when customer_row.is_reseller then product_row.reseller_price
        else product_row.default_price
      end,
      case
        when customer_row.is_reseller then 'reseller'::text
        else 'retail'::text
      end,
      round(
        coalesce(
          case product_row.agent_commission_type
            when 'percentage' then
              coalesce(
                case
                  when customer_row.is_reseller then product_row.reseller_price
                  else product_row.default_price
                end,
                0
              ) * product_row.agent_commission_value / 100
            else product_row.agent_commission_value
          end,
          0
        ) * item_quantity,
        2
      )
    from public.product product_row
    cross join public.customer customer_row
    where product_row.id = item_product_id
      and customer_row.id = resolved_customer_id
      and product_row.default_price is not null
      and product_row.reseller_price is not null;

    if not found then
      raise exception 'Product % does not have valid prices for order item pricing.', item_product_id;
    end if;
  end loop;

  if not exists (
    select 1
    from public.order_item
    where order_id = inserted_order_id
      and order_kind in ('customer', 'personal')
  ) then
    raise exception 'At least one valid order item is required.';
  end if;

  if not require_approval then
    perform public.apply_agent_order_customer_approval(inserted_order_id);
  end if;

  return inserted_order_id;
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format then
    raise exception 'Agent order customer payload contains an invalid product id, quantity, or release date.';
end;
$$;

create or replace function public.convert_customer_order_to_agent_distribution_order(
  target_order_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  source_order public."order"%rowtype;
  source_customer public.customer%rowtype;
  target_agent_id uuid;
  inserted_agent_order_id uuid;
  item_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to convert customer orders.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can convert customer orders.';
  end if;

  select *
  into source_order
  from public."order"
  where id = target_order_id
    and order_kind in ('customer', 'personal')
  for update;

  if source_order.id is null then
    raise exception 'Customer order was not found.';
  end if;

  if source_order.converted_at is not null then
    raise exception 'Customer order was already converted to an agent distribution order.';
  end if;

  if source_order.parent_order_id is not null then
    raise exception 'Customer order is already linked to an agent distribution order.';
  end if;

  if source_order.order_status = 'closed' then
    raise exception 'Closed customer orders cannot be converted.';
  end if;

  if source_order.payment_status <> 'unpaid' then
    raise exception 'Only unpaid customer orders can be converted.';
  end if;

  if exists (
    select 1
    from public.payment
    where payment.order_id = source_order.id
  ) then
    raise exception 'Customer orders with payment records cannot be converted.';
  end if;

  if exists (
    select 1
    from public.agent_received_payment
    where agent_received_payment.order_id = source_order.id
  ) then
    raise exception 'Customer orders with agent payment records cannot be converted.';
  end if;

  select *
  into source_customer
  from public.customer
  where id = source_order.customer_id;

  if source_customer.id is null then
    raise exception 'Customer order does not have a valid customer.';
  end if;

  target_agent_id := source_customer.promoted_to_agent_id;

  if target_agent_id is null then
    select agent.id
    into target_agent_id
    from public.agent
    where agent.promoted_from_customer_id = source_customer.id
    order by agent.promoted_from_customer_at desc nulls last, agent.created_at desc
    limit 1;
  end if;

  if target_agent_id is null then
    raise exception 'Customer order does not belong to a promoted customer.';
  end if;

  if not exists (
    select 1
    from public.agent
    where agent.id = target_agent_id
  ) then
    raise exception 'Promoted agent record was not found.';
  end if;

  select count(*)
  into item_count
  from public.order_item
  where order_id = source_order.id
    and order_kind in ('customer', 'personal');

  if item_count = 0 then
    raise exception 'Customer order has no items to convert.';
  end if;

  insert into public."order" (
    agent_id,
    order_status,
    notes,
    submitted_by,
    admin_read_at,
    admin_read_by,
    created_at,
    updated_at,
    order_kind,
    customer_id,
    source,
    payment_status
  )
  values (
    target_agent_id,
    'pending_customers',
    nullif(
      concat_ws(
        E'\n\n',
        source_order.notes,
        'Converted from customer order ' || source_order.id::text
      ),
      ''
    ),
    coalesce(source_order.submitted_by, (select auth.uid())),
    now(),
    (select auth.uid()),
    now(),
    now(),
    'distribution',
    null,
    'agent_submitted',
    'unpaid'
  )
  returning id into inserted_agent_order_id;

  insert into public.order_item (
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    add_details,
    agent_commission_amount,
    created_at,
    updated_at,
    order_kind
  )
  select
    inserted_agent_order_id,
    source_item.product_id,
    source_item.partial_quantity,
    source_item.partial_quantity,
    source_item.add_details,
    source_item.agent_commission_amount,
    now(),
    now(),
    'distribution'
  from public.order_item source_item
  where source_item.order_id = source_order.id
    and source_item.order_kind in ('customer', 'personal');

  update public."order"
  set parent_order_id = inserted_agent_order_id,
      converted_at = now(),
      converted_by = (select auth.uid()),
      admin_read_at = coalesce(admin_read_at, now()),
      admin_read_by = coalesce(admin_read_by, (select auth.uid())),
      updated_at = now()
  where id = source_order.id;

  return inserted_agent_order_id;
end;
$$;

create or replace function public.submit_guest_order(
  customer_payload jsonb,
  item_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_customer_id uuid;
  inserted_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
begin
  if nullif(trim(customer_payload ->> 'firstName'), '') is null then
    raise exception 'First name is required.';
  end if;

  if nullif(trim(customer_payload ->> 'lastName'), '') is null then
    raise exception 'Last name is required.';
  end if;

  if nullif(trim(customer_payload ->> 'phoneNumber'), '') is null then
    raise exception 'Phone number is required.';
  end if;

  if nullif(trim(customer_payload ->> 'address'), '') is null then
    raise exception 'Delivery address is required.';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  inserted_customer_id := private.create_customer_with_profile(
    trim(customer_payload ->> 'firstName'),
    trim(customer_payload ->> 'lastName'),
    trim(customer_payload ->> 'phoneNumber'),
    nullif(trim(customer_payload ->> 'email'), ''),
    trim(customer_payload ->> 'address')
  );

  insert into public."order" (
    customer_id,
    source,
    order_status,
    payment_status,
    order_kind
  )
  values (
    inserted_customer_id,
    'guest_shop',
    'pending',
    'unpaid',
    'customer'
  )
  returning id into inserted_order_id;

  for item in select value from jsonb_array_elements(item_payload)
  loop
    item_product_id := nullif(trim(item ->> 'productId'), '')::uuid;
    item_quantity := nullif(trim(item ->> 'quantity'), '')::numeric;
    item_details := nullif(trim(item ->> 'addDetails'), '');

    if item_product_id is null then
      raise exception 'Product id is required for every order item.';
    end if;

    if item_quantity is null or item_quantity <= 0 then
      raise exception 'Order item quantity must be greater than zero.';
    end if;

    if not exists (
      select 1
      from public.product
      where id = item_product_id
        and is_active = true
    ) then
      raise exception 'Product % is not available for public ordering.', item_product_id;
    end if;

    insert into public.order_item (
      order_id,
      product_id,
      partial_quantity,
      final_quantity,
      add_details,
      order_kind,
      unit_price,
      price_type,
      agent_commission_amount
    )
    select
      inserted_order_id,
      item_product_id,
      item_quantity,
      item_quantity,
      item_details,
      'customer',
      case
        when customer_row.is_reseller then product_row.reseller_price
        else product_row.default_price
      end,
      case
        when customer_row.is_reseller then 'reseller'::text
        else 'retail'::text
      end,
      0
    from public.product product_row
    cross join public.customer customer_row
    where product_row.id = item_product_id
      and customer_row.id = inserted_customer_id
      and product_row.default_price is not null
      and product_row.reseller_price is not null;

    if not found then
      raise exception 'Product % does not have valid prices for order item pricing.', item_product_id;
    end if;
  end loop;

  if not exists (
    select 1
    from public.order_item
    where order_id = inserted_order_id
      and order_kind in ('customer', 'personal')
  ) then
    raise exception 'At least one valid order item is required.';
  end if;

  return inserted_order_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Order payload contains an invalid product id or quantity.';
end;
$$;

create or replace function public.update_agent_order_item_quantity(
  target_agent_order_item_id uuid,
  new_quantity numeric
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  current_item record;
  approved_distributed numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to update agent order quantity.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can update agent order item quantity.';
  end if;

  select
    order_item.id,
    order_item.order_id,
    order_item.product_id,
    order_item.partial_quantity
  into current_item
  from public.order_item
  where order_item.id = target_agent_order_item_id
    and order_item.order_kind = 'distribution'
  limit 1;

  if current_item.id is null then
    raise exception 'Agent order item was not found.';
  end if;

  if private.agent_order_item_is_fully_paid(current_item.order_id) then
    raise exception 'Agent order quantity cannot be edited after all customer orders are fully paid.';
  end if;

  if new_quantity is null or new_quantity <= 0 then
    raise exception 'Agent order item quantity must be greater than zero.';
  end if;

  approved_distributed := private.agent_order_approved_distributed_quantity(
    current_item.order_id,
    current_item.product_id
  );

  if new_quantity < approved_distributed then
    raise exception 'Cannot set quantity below distributed customer allocations.';
  end if;

  update public.order_item
  set partial_quantity = new_quantity,
      final_quantity = new_quantity,
      updated_at = now()
  where id = current_item.id;

  return current_item.id;
end;
$$;

create or replace function public.apply_agent_order_customer_approval(
  target_customer_order_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  current_order record;
  item record;
begin
  select
    parent_order.id,
    parent_order.parent_order_id,
    parent_order.order_status
  into current_order
  from public."order" parent_order
  where parent_order.id = target_customer_order_id
    and parent_order.order_kind in ('customer', 'personal')
  limit 1;

  if current_order.id is null then
    raise exception 'Customer order was not found.';
  end if;

  if current_order.parent_order_id is null then
    return current_order.id;
  end if;

  if current_order.order_status <> 'processing' then
    return current_order.id;
  end if;

  for item in
    select
      order_item.product_id,
      order_item.agent_order_quantity_increase,
      order_item.add_details
    from public.order_item
    where order_item.order_id = current_order.id
      and order_item.order_kind in ('customer', 'personal')
      and order_item.agent_order_quantity_increase > 0
  loop
    perform private.apply_agent_order_item_quantity_increase(
      current_order.parent_order_id,
      item.product_id,
      item.agent_order_quantity_increase,
      item.add_details
    );
  end loop;

  update public.order_item
  set agent_order_quantity_increase = 0
  where order_id = current_order.id
    and order_kind in ('customer', 'personal')
    and agent_order_quantity_increase > 0;

  return current_order.id;
end;
$$;

create or replace function private.refresh_agent_order_status(target_agent_order_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public."order"
  set order_status = 'processing',
      sale_date = null,
      updated_at = now()
  where id = target_agent_order_id
    and order_kind = 'distribution'
    and order_status = 'pending_customers'
    and exists (
      select 1
      from public."order" child_order
      where child_order.parent_order_id = target_agent_order_id
        and child_order.order_kind in ('customer', 'personal')
    );

  update public."order"
  set order_status = 'closed',
      sale_date = coalesce(sale_date, now()),
      updated_at = now()
  where id = target_agent_order_id
    and order_kind = 'distribution'
    and order_status is distinct from 'closed'
    and exists (
      select 1
      from public."order" child_order
      where child_order.parent_order_id = target_agent_order_id
        and child_order.order_kind in ('customer', 'personal')
    )
    and not exists (
      select 1
      from public."order" child_order
      where child_order.parent_order_id = target_agent_order_id
        and child_order.order_kind in ('customer', 'personal')
        and child_order.payment_status is distinct from 'paid'
    );
end;
$$;

create or replace function private.block_pending_agent_order_customer_link() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_order_id is not null
    and exists (
      select 1
      from public."order" parent_order
      where parent_order.id = new.parent_order_id
        and parent_order.order_kind = 'distribution'
        and parent_order.order_status = 'pending_order'
    ) then
    raise exception 'Agent order must be approved before customer orders can be attached.';
  end if;

  return new;
end;
$$;

create or replace function private.sync_agent_order_status_from_customer_link() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_order_id is not null
    and new.converted_at is null then
    update public."order"
    set order_status = 'pending_order',
        updated_at = now()
    where id = new.parent_order_id
      and order_kind = 'distribution'
      and order_status = 'pending_customers';
  end if;

  return new;
end;
$$;

create or replace function private.refresh_agent_order_after_customer_order_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE')
    and old.parent_order_id is not null
    and old.converted_at is null then
    perform private.refresh_agent_order_status(old.parent_order_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and new.parent_order_id is not null
    and new.converted_at is null then
    perform private.refresh_agent_order_status(new.parent_order_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function private.apply_agent_order_customer_approval_on_status_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.order_status = 'pending'
     and new.order_status = 'processing'
     and new.parent_order_id is not null then
    perform public.apply_agent_order_customer_approval(new.id);
  end if;

  return new;
end;
$$;

create or replace function private.apply_agent_order_item_quantity_increase(
  target_agent_order_id uuid,
  target_product_id uuid,
  quantity_increase numeric,
  item_details text
) returns void
  language plpgsql
  set search_path = ''
  as $$
declare
  existing_item_id uuid;
begin
  if quantity_increase is null or quantity_increase <= 0 then
    return;
  end if;

  select id
  into existing_item_id
  from public.order_item
  where order_id = target_agent_order_id
    and product_id = target_product_id
    and order_kind = 'distribution'
  limit 1;

  if existing_item_id is null then
    insert into public.order_item (
      order_id,
      product_id,
      partial_quantity,
      final_quantity,
      add_details,
      order_kind,
      agent_commission_amount
    )
    values (
      target_agent_order_id,
      target_product_id,
      quantity_increase,
      quantity_increase,
      item_details,
      'distribution',
      coalesce(private.calculate_product_agent_commission(target_product_id, quantity_increase, null), 0)
    );
    return;
  end if;

  update public.order_item
  set partial_quantity = partial_quantity + quantity_increase,
      final_quantity = final_quantity + quantity_increase,
      updated_at = now()
  where id = existing_item_id;
end;
$$;

create or replace function private.close_paid_customer_order(target_order_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public."order"
  set order_status = 'closed',
      sale_date = coalesce(sale_date, now()),
      updated_at = now()
  where id = target_order_id
    and order_kind in ('customer', 'personal')
    and payment_status = 'paid'
    and order_status is distinct from 'closed'
    and exists (
      select 1
      from public.invoice
      where invoice.order_id = target_order_id
    );
end;
$$;

alter function public.submit_agent_order(uuid, jsonb, jsonb) owner to postgres;
alter function public.attach_customer_to_agent_order(uuid, uuid, jsonb, jsonb, boolean) owner to postgres;
alter function public.convert_customer_order_to_agent_distribution_order(uuid) owner to postgres;
alter function public.submit_guest_order(jsonb, jsonb) owner to postgres;
alter function public.update_agent_order_item_quantity(uuid, numeric) owner to postgres;
alter function public.apply_agent_order_customer_approval(uuid) owner to postgres;
alter function private.refresh_agent_order_status(uuid) owner to postgres;
alter function private.block_pending_agent_order_customer_link() owner to postgres;
alter function private.sync_agent_order_status_from_customer_link() owner to postgres;
alter function private.refresh_agent_order_after_customer_order_change() owner to postgres;
alter function private.apply_agent_order_customer_approval_on_status_change() owner to postgres;
alter function private.apply_agent_order_item_quantity_increase(uuid, uuid, numeric, text) owner to postgres;
alter function private.close_paid_customer_order(uuid) owner to postgres;

-- Relocate child-order triggers from compat view to unified order table
drop trigger if exists block_pending_agent_order_customer_link on public."order";
drop trigger if exists sync_agent_order_status_from_customer_link on public."order";
drop trigger if exists refresh_agent_order_after_customer_order_change on public."order";
drop trigger if exists apply_agent_order_customer_approval_on_status_change on public."order";
drop trigger if exists block_pending_agent_order_customer_link on public.customer_order;
drop trigger if exists sync_agent_order_status_from_customer_link on public.customer_order;
drop trigger if exists refresh_agent_order_after_customer_order_change on public.customer_order;
drop trigger if exists apply_agent_order_customer_approval_on_status_change on public.customer_order;

create trigger block_pending_agent_order_customer_link
  before insert or update of parent_order_id on public."order"
  for each row
  execute function private.block_pending_agent_order_customer_link();

create trigger sync_agent_order_status_from_customer_link
  after insert or update of parent_order_id on public."order"
  for each row
  execute function private.sync_agent_order_status_from_customer_link();

create trigger refresh_agent_order_after_customer_order_change
  after insert or delete or update of parent_order_id, payment_status on public."order"
  for each row
  execute function private.refresh_agent_order_after_customer_order_change();

create trigger apply_agent_order_customer_approval_on_status_change
  after update of order_status on public."order"
  for each row
  execute function private.apply_agent_order_customer_approval_on_status_change();
