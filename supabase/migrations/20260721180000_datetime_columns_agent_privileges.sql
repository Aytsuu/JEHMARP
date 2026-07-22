-- Store schedule/payment dates with time and apply agent commissions on personal orders.

create or replace function private.parse_schedule_timestamp(
  schedule_date text,
  schedule_time text default null
) returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_date text := nullif(trim(schedule_date), '');
  normalized_time text := coalesce(nullif(trim(schedule_time), ''), '00:00');
begin
  if normalized_date is null then
    return null;
  end if;

  if position('T' in normalized_date) > 0 then
    return normalized_date::timestamptz;
  end if;

  return (normalized_date || 'T' || normalized_time || ':00')::timestamp at time zone 'Asia/Manila';
end;
$$;

alter table public.customer_order
  alter column release_date type timestamptz
  using case
    when release_date is null then null
    else (release_date::text || ' 00:00:00')::timestamp at time zone 'Asia/Manila'
  end;

alter table public.agent_order
  alter column release_date type timestamptz
  using case
    when release_date is null then null
    else (release_date::text || ' 00:00:00')::timestamp at time zone 'Asia/Manila'
  end;

alter table public.payment
  alter column payment_date type timestamptz
  using (payment_date::text || ' 00:00:00')::timestamp at time zone 'Asia/Manila';

alter table public.payment
  alter column payment_date set default now();

alter table public.agent_received_payment
  alter column payment_date type timestamptz
  using (payment_date::text || ' 00:00:00')::timestamp at time zone 'Asia/Manila';

alter table public.agent_received_payment
  alter column payment_date set default now();

create or replace function private.sync_order_item_price_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_customer_is_reseller boolean;
  order_agent_id uuid;
  retail_price numeric;
  reseller_price_value numeric;
  product_agent_commission_type text;
  product_agent_commission_value numeric;
  commission_unit_price numeric;
  should_apply_agent_commission boolean := false;
begin
  select
    customer.is_reseller,
    customer_order.agent_id
  into
    order_customer_is_reseller,
    order_agent_id
  from public.customer_order
  join public.customer
    on customer.id = customer_order.customer_id
  where customer_order.id = new.order_id;

  if order_customer_is_reseller is null then
    raise exception 'Order % does not have a valid customer for pricing.', new.order_id;
  end if;

  should_apply_agent_commission := order_agent_id is not null;

  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id then
    select
      product.default_price,
      product.reseller_price,
      product.agent_commission_type,
      product.agent_commission_value
    into
      retail_price,
      reseller_price_value,
      product_agent_commission_type,
      product_agent_commission_value
    from public.product
    where product.id = new.product_id;

    if retail_price is null or reseller_price_value is null then
      raise exception 'Product % does not have valid prices for order item pricing.', new.product_id;
    end if;

    new.price_type := case
      when order_customer_is_reseller then 'reseller'
      else 'retail'
    end;
    new.unit_price := case
      when order_customer_is_reseller then reseller_price_value
      else retail_price
    end;
  end if;

  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id
     or new.partial_quantity is distinct from old.partial_quantity then
    if new.agent_commission_amount = 0
       and new.agent_commission_paid = false
       and new.agent_commission_set_by is null
       and new.agent_commission_set_at is null
       and should_apply_agent_commission then
      if product_agent_commission_type is null or product_agent_commission_value is null then
        select product.agent_commission_type, product.agent_commission_value
        into product_agent_commission_type, product_agent_commission_value
        from public.product
        where product.id = new.product_id;
      end if;

      commission_unit_price := case product_agent_commission_type
        when 'percentage' then coalesce(new.unit_price, 0) * product_agent_commission_value / 100
        else product_agent_commission_value
      end;

      new.agent_commission_amount := round(coalesce(commission_unit_price, 0) * new.partial_quantity, 2);
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.list_admin_agent_rows(
  search_query text default null,
  status_filter text default null,
  page_number integer default 1,
  page_size integer default 10
) returns table(records jsonb, total_rows bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      nullif(status_filter, '') as status_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  base_rows as (
    select
      agent_row.id,
      agent_row.user_id,
      agent_row.customer_id,
      agent_row.employee_id,
      agent_person.first_name,
      agent_person.last_name,
      agent_person.display_name,
      agent_row.status,
      coalesce(auth_users.email, agent_person.email) as email,
      agent_person.phone_number as contact,
      agent_row.created_at,
      agent_row.updated_at,
      lower(concat_ws(
        ' ',
        agent_row.id::text,
        agent_row.employee_id,
        agent_person.first_name,
        agent_person.last_name,
        agent_person.display_name,
        coalesce(auth_users.email, agent_person.email),
        agent_person.phone_number,
        agent_row.status
      )) as search_text
    from public.agent agent_row
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id
    left join auth.users auth_users
      on auth_users.id = agent_row.user_id
  ),
  filtered as (
    select base_rows.*
    from base_rows
    cross join normalized
    where (normalized.search_value is null or base_rows.search_text like '%' || normalized.search_value || '%')
      and (normalized.status_value is null or base_rows.status = normalized.status_value)
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.last_name asc, counted.first_name asc, counted.id asc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'search_text' - 'total_rows' order by paged.last_name asc, paged.first_name asc, paged.id asc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

drop function if exists public.submit_agent_received_payment(uuid, numeric, text, text, date, text, text);
drop function if exists public.submit_agent_received_payment_distribution(uuid[], numeric, text, text, date, text, text);
drop function if exists public.apply_customer_payment_distribution(uuid, numeric, text, text, date, uuid, text, text);
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
    insert into public.agent_order (
      agent_id,
      order_status,
      release_date,
      submitted_by
    )
    values (
      current_agent_id,
      'pending_customers',
      requested_release_date,
      (select auth.uid())
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

    insert into public.customer_order (
      customer_id,
      agent_id,
      source,
      order_status,
      payment_status,
      release_date,
      submitted_by
    )
    values (
      resolved_customer_id,
      current_agent_id,
      'agent_submitted',
      'pending',
      'unpaid',
      requested_release_date,
      (select auth.uid())
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
      insert into public.customer_order_item (
        order_id,
        product_id,
        partial_quantity,
        final_quantity,
        add_details
      )
      values (
        inserted_order_id,
        item_product_id,
        item_quantity,
        item_quantity,
        item_details
      );
    else
      insert into public.agent_order_item (
        agent_order_id,
        product_id,
        quantity,
        add_details
      )
      values (
        inserted_agent_order_id,
        item_product_id,
        item_quantity,
        item_details
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
  from public.agent_order
  where id = target_agent_order_id
  limit 1;

  if agent_order_agent_id is null then
    raise exception 'Agent order was not found.';
  end if;

  if agent_order_status = 'closed'
     and exists (
       select 1
       from public.customer_order
       where customer_order.agent_order_id = target_agent_order_id
     )
     and not exists (
       select 1
       from public.customer_order
       where customer_order.agent_order_id = target_agent_order_id
         and customer_order.payment_status is distinct from 'paid'
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

  insert into public.customer_order (
    customer_id,
    agent_id,
    agent_order_id,
    source,
    order_status,
    payment_status,
    release_date,
    submitted_by,
    approved_by,
    approved_at
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
    end
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

    select quantity
    into existing_item_quantity
    from public.agent_order_item
    where agent_order_id = target_agent_order_id
      and product_id = item_product_id
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
      insert into public.agent_order_item (
        agent_order_id,
        product_id,
        quantity,
        add_details
      )
      values (
        target_agent_order_id,
        item_product_id,
        0,
        item_details
      );
    end if;

    insert into public.customer_order_item (
      order_id,
      product_id,
      partial_quantity,
      final_quantity,
      add_details,
      agent_order_quantity_increase
    )
    values (
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
      end
    );
  end loop;

  if not exists (
    select 1
    from public.customer_order_item
    where order_id = inserted_order_id
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
create or replace function "public"."apply_customer_payment_distribution"(
  "target_customer_id" "uuid",
  "payment_amount" numeric,
  "payment_method_value" "text",
  "payment_terms_value" "text",
  "payment_date_value" timestamptz,
  "recorded_by_value" "uuid",
  "reference_number_value" "text" default null::"text",
  "notes_value" "text" default null::"text"
) returns "jsonb"
language "plpgsql"
security definer
set "search_path" to ''
as $$
declare
  remaining_amount numeric;
  total_balance numeric;
  order_row record;
  applied_amount numeric;
  distributions jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated admin is required to distribute payment.';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Only admins can distribute customer payments.';
  end if;

  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if payment_method_value not in ('Cash', 'Check') then
    raise exception 'Payment method is not supported.';
  end if;

  if payment_terms_value not in ('Cash on Delivery (COD)', 'Bank Transfer', 'Gcash') then
    raise exception 'Payment terms is not supported.';
  end if;

  if payment_date_value is null then
    raise exception 'Payment date is required.';
  end if;

  select coalesce(sum(public.compute_payment_balance(customer_order.id)), 0)
  into total_balance
  from public.customer_order
  where customer_order.customer_id = target_customer_id
    and customer_order.order_status <> 'closed'
    and customer_order.payment_status in ('unpaid', 'partial');

  remaining_amount := round(payment_amount, 2);
  total_balance := round(total_balance, 2);

  if remaining_amount > total_balance then
    raise exception 'Payment amount exceeds the customer pending balance of %.', total_balance;
  end if;

  for order_row in
    select
      customer_order.id,
      public.compute_payment_balance(customer_order.id) as balance
    from public.customer_order
    where customer_order.customer_id = target_customer_id
      and customer_order.order_status <> 'closed'
      and customer_order.payment_status in ('unpaid', 'partial')
    order by customer_order.created_at asc, customer_order.id asc
    for update of customer_order
  loop
    exit when remaining_amount <= 0;
    continue when order_row.balance <= 0;

    applied_amount := least(remaining_amount, round(order_row.balance, 2));

    insert into public.payment (
      order_id,
      amount,
      payment_method,
      payment_terms,
      payment_date,
      recorded_by,
      reference_number,
      notes
    )
    values (
      order_row.id,
      applied_amount,
      payment_method_value,
      payment_terms_value,
      payment_date_value,
      recorded_by_value,
      nullif(reference_number_value, ''),
      nullif(notes_value, '')
    );

    distributions := distributions || jsonb_build_object(
      'order_id', order_row.id,
      'amount', applied_amount
    );

    remaining_amount := round(remaining_amount - applied_amount, 2);
  end loop;

  return jsonb_build_object(
    'applied_total', payment_amount,
    'distributions', distributions
  );
end;
$$;
create or replace function "public"."submit_agent_received_payment"(
  "target_order_id" uuid,
  "payment_amount" numeric,
  "payment_method_value" text,
  "payment_terms_value" text,
  "payment_date_value" timestamptz,
  "reference_number_value" text default null,
  "notes_value" text default null
) returns uuid
language "plpgsql"
security definer
set "search_path" to ''
as $$
declare
  current_agent_id uuid;
  inserted_payment_id uuid;
  invoice_exists boolean;
  base_balance numeric;
  pending_total numeric;
  remaining_recordable_balance numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to record received payment.';
  end if;

  select id
  into current_agent_id
  from public.agent as agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can record received payment.';
  end if;

  if not (select private.agent_can_access_order(target_order_id)) then
    raise exception 'This order is not assigned to the current agent.';
  end if;

  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if payment_method_value not in ('Cash', 'Check') then
    raise exception 'Payment method is not supported.';
  end if;

  if payment_terms_value not in ('Cash on Delivery (COD)', 'Bank Transfer', 'Gcash') then
    raise exception 'Payment terms is not supported.';
  end if;

  if payment_date_value is null then
    raise exception 'Payment date is required.';
  end if;

  select exists (
    select 1
    from public.invoice
    where invoice.order_id = target_order_id
  )
  into invoice_exists;

  base_balance := case
    when invoice_exists then coalesce(public.compute_payment_balance(target_order_id), 0)
    else greatest(
      coalesce(public.compute_order_total(target_order_id), 0)
      - coalesce(public.compute_payment_total(target_order_id), 0),
      0
    )
  end;

  select coalesce(sum(amount), 0)
  into pending_total
  from public.agent_received_payment
  where order_id = target_order_id
    and status = 'pending_admin_confirmation';

  remaining_recordable_balance := greatest(base_balance - pending_total, 0);

  if round(payment_amount, 2) > round(remaining_recordable_balance, 2) then
    raise exception 'Payment amount exceeds the remaining order balance.';
  end if;

  insert into public.agent_received_payment (
    order_id,
    agent_id,
    amount,
    payment_method,
    payment_terms,
    payment_date,
    reference_number,
    notes,
    received_by
  )
  values (
    target_order_id,
    current_agent_id,
    round(payment_amount, 2),
    payment_method_value,
    payment_terms_value,
    payment_date_value,
    nullif(trim(reference_number_value), ''),
    nullif(trim(notes_value), ''),
    (select auth.uid())
  )
  returning id into inserted_payment_id;

  return inserted_payment_id;
end;
$$;
create or replace function "public"."submit_agent_received_payment_distribution"(
  "target_order_ids" uuid[],
  "payment_amount" numeric,
  "payment_method_value" text,
  "payment_terms_value" text,
  "payment_date_value" timestamptz,
  "reference_number_value" text default null,
  "notes_value" text default null
) returns uuid[]
language "plpgsql"
security definer
set "search_path" to ''
as $$
declare
  current_agent_id uuid;
  remaining_amount numeric;
  order_record record;
  invoice_exists boolean;
  base_balance numeric;
  pending_total numeric;
  recordable_balance numeric;
  amount_to_record numeric;
  inserted_payment_id uuid;
  inserted_payment_ids uuid[] := array[]::uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to distribute received payment.';
  end if;

  select id
  into current_agent_id
  from public.agent as agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can distribute received payment.';
  end if;

  if target_order_ids is null or cardinality(target_order_ids) = 0 then
    raise exception 'At least one customer order is required.';
  end if;

  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if payment_method_value not in ('Cash', 'Check') then
    raise exception 'Payment method is not supported.';
  end if;

  if payment_terms_value not in ('Cash on Delivery (COD)', 'Bank Transfer', 'Gcash') then
    raise exception 'Payment terms is not supported.';
  end if;

  if payment_date_value is null then
    raise exception 'Payment date is required.';
  end if;

  remaining_amount := round(payment_amount, 2);

  for order_record in
    with unique_selected_orders as (
      select distinct on (selected_order_id)
        selected_order_id as order_id,
        ordinal_position
      from unnest(target_order_ids) with ordinality as selected(selected_order_id, ordinal_position)
      where selected_order_id is not null
      order by selected_order_id, ordinal_position
    )
    select order_id, ordinal_position
    from unique_selected_orders
    order by ordinal_position
  loop
    exit when remaining_amount <= 0;

    if not (select private.agent_can_access_order(order_record.order_id)) then
      raise exception 'One or more selected orders are not assigned to the current agent.';
    end if;

    select exists (
      select 1
      from public.invoice
      where invoice.order_id = order_record.order_id
    )
    into invoice_exists;

    base_balance := case
      when invoice_exists then coalesce(public.compute_payment_balance(order_record.order_id), 0)
      else greatest(
        coalesce(public.compute_order_total(order_record.order_id), 0)
        - coalesce(public.compute_payment_total(order_record.order_id), 0),
        0
      )
    end;

    select coalesce(sum(amount), 0)
    into pending_total
    from public.agent_received_payment
    where order_id = order_record.order_id
      and status = 'pending_admin_confirmation';

    recordable_balance := round(greatest(base_balance - pending_total, 0), 2);

    if recordable_balance <= 0 then
      continue;
    end if;

    amount_to_record := least(remaining_amount, recordable_balance);

    insert into public.agent_received_payment (
      order_id,
      agent_id,
      amount,
      payment_method,
      payment_terms,
      payment_date,
      reference_number,
      notes,
      received_by
    )
    values (
      order_record.order_id,
      current_agent_id,
      amount_to_record,
      payment_method_value,
      payment_terms_value,
      payment_date_value,
      nullif(trim(reference_number_value), ''),
      nullif(trim(notes_value), ''),
      (select auth.uid())
    )
    returning id into inserted_payment_id;

    inserted_payment_ids := array_append(inserted_payment_ids, inserted_payment_id);
    remaining_amount := round(remaining_amount - amount_to_record, 2);
  end loop;

  if remaining_amount > 0 then
    raise exception 'Payment amount exceeds selected order balances.';
  end if;

  if cardinality(inserted_payment_ids) = 0 then
    raise exception 'Selected customer orders do not have remaining balances.';
  end if;

  return inserted_payment_ids;
end;
$$;
