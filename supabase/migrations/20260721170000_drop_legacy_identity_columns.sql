-- migration-safety: destructive-reviewed
-- Phase 4: drop legacy identity columns from customer/agent; profile is sole SSOT (local only).

create or replace function private.create_customer_with_profile(
  p_first_name text,
  p_last_name text,
  p_phone_number text,
  p_email text default null,
  p_address text default null,
  p_assigned_agent_id uuid default null,
  p_is_reseller boolean default false,
  p_created_by uuid default null,
  p_profile_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := p_profile_id;
  v_customer_id uuid;
begin
  if v_profile_id is null then
    insert into public.profile (
      first_name,
      last_name,
      display_name,
      email,
      phone_number,
      address
    )
    values (
      p_first_name,
      p_last_name,
      trim(concat_ws(' ', p_first_name, p_last_name)),
      nullif(trim(coalesce(p_email, '')), ''),
      p_phone_number,
      p_address
    )
    returning id into v_profile_id;
  end if;

  insert into public.customer (
    profile_id,
    assigned_agent_id,
    is_reseller,
    created_by
  )
  values (
    v_profile_id,
    p_assigned_agent_id,
    coalesce(p_is_reseller, false),
    p_created_by
  )
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;

alter function private.create_customer_with_profile(
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  uuid,
  uuid
) owner to postgres;

revoke all on function private.create_customer_with_profile(
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  uuid,
  uuid
) from public;

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

  insert into public.customer_order (
    customer_id,
    source,
    order_status,
    payment_status
  )
  values (
    inserted_customer_id,
    'guest_shop',
    'pending',
    'unpaid'
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
  end loop;

  if not exists (
    select 1
    from public.customer_order_item
    where order_id = inserted_order_id
  ) then
    raise exception 'At least one valid order item is required.';
  end if;

  return inserted_order_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Order payload contains an invalid product id or quantity.';
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
    nullif(trim(coalesce(customer_payload ->> 'releaseDate', '')), '')::date,
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
  requested_release_date date := nullif(trim(coalesce(customer_payload ->> 'releaseDate', '')), '')::date;
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

create or replace function public.list_admin_activity_rows(
  search_query text default null,
  page_number integer default 1,
  page_size integer default 10
) returns table(records jsonb, total_rows bigint)
language sql
stable
set search_path = ''
as $$
  with normalized as (
    select
      nullif(lower(trim(search_query)), '') as search_value,
      greatest(page_number, 1) as safe_page_number,
      least(greatest(page_size, 1), 100) as safe_page_size
  ),
  unified as (
    select
      'order-created:' || customer_order.id::text as id,
      'order'::text as category,
      'Created order'::text as title,
      'Order ' || left(customer_order.id::text, 8) || ' for ' || concat_ws(' ', customer_person.first_name, customer_person.last_name) as detail,
      customer_order.created_at as occurred_at
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    join public.profile customer_person
      on customer_person.id = customer.profile_id

    union all

    select
      'order-updated:' || customer_order.id::text,
      'order',
      'Updated order',
      'Order ' || left(customer_order.id::text, 8) || ' is ' || customer_order.order_status || ' with payment ' || customer_order.payment_status,
      customer_order.updated_at
    from public.customer_order
    where customer_order.updated_at > customer_order.created_at

    union all

    select
      'agent-order-created:' || agent_order.id::text,
      'order',
      'Created agent order',
      'Agent order ' || left(agent_order.id::text, 8) || ' for ' || coalesce(agent_person.display_name, 'Agent'),
      agent_order.created_at
    from public.agent_order
    join public.agent agent_row
      on agent_row.id = agent_order.agent_id
    join public.profile agent_person
      on agent_person.id = agent_row.profile_id

    union all

    select
      'order-status:' || customer_order_status_history.id::text,
      'order',
      'Updated order status',
      'Order ' || left(customer_order_status_history.order_id::text, 8) || ' moved from ' || coalesce(customer_order_status_history.from_status, 'new') || ' to ' || customer_order_status_history.to_status,
      customer_order_status_history.changed_at
    from public.customer_order_status_history

    union all

    select
      'customer-created:' || customer.id::text,
      'customer',
      'Added new customer',
      concat_ws(' ', customer_person.first_name, customer_person.last_name) || case when customer.is_reseller then ' - reseller' else '' end,
      customer.created_at
    from public.customer
    join public.profile customer_person
      on customer_person.id = customer.profile_id

    union all

    select
      'product-created:' || product.id::text,
      'product',
      'Added product',
      product.name || ' - ' || product.category,
      product.created_at
    from public.product

    union all

    select
      'product-updated:' || product.id::text,
      'product',
      'Updated product',
      product.name || ' is ' || case when product.is_active then 'active' else 'inactive' end || ' and ' || product.stock_status,
      product.updated_at
    from public.product
    where product.updated_at > product.created_at

    union all

    select
      'invoice-created:' || invoice.id::text,
      'invoice',
      'Created invoice',
      invoice.invoice_number || ' for order ' || left(invoice.order_id::text, 8),
      invoice.created_at
    from public.invoice

    union all

    select
      'invoice-updated:' || invoice.id::text,
      'invoice',
      'Updated invoice',
      invoice.invoice_number || ' is ' || invoice.status,
      invoice.updated_at
    from public.invoice
    where invoice.updated_at > invoice.created_at

    union all

    select
      'page-created:' || page.id::text,
      'content',
      'Created content page',
      page.title || ' (' || page.status || ')',
      page.created_at
    from public.page

    union all

    select
      'page-updated:' || page.id::text,
      'content',
      'Updated content page',
      page.title || ' is ' || page.status,
      page.updated_at
    from public.page
    where page.updated_at > page.created_at
  ),
  filtered as (
    select unified.*
    from unified
    cross join normalized
    where normalized.search_value is null
      or lower(unified.title || ' ' || unified.detail) like '%' || normalized.search_value || '%'
  ),
  counted as (
    select filtered.*, count(*) over () as total_rows
    from filtered
  ),
  paged as (
    select counted.*
    from counted
    cross join normalized
    order by counted.occurred_at desc, counted.id desc
    limit (select safe_page_size from normalized)
    offset (select (safe_page_number - 1) * safe_page_size from normalized)
  )
  select
    coalesce(
      jsonb_agg(to_jsonb(paged) - 'total_rows' order by paged.occurred_at desc, paged.id desc),
      '[]'::jsonb
    ) as records,
    coalesce(max(paged.total_rows), (select count(*) from filtered), 0)::bigint as total_rows
  from paged;
$$;

drop trigger if exists a_sync_customer_profile_identity on public.customer;
drop trigger if exists z_enforce_customer_unique_contact on public.customer;
drop trigger if exists sync_customer_profile_identity on public.customer;
drop trigger if exists enforce_customer_unique_contact on public.customer;
drop trigger if exists sync_agent_profile_identity on public.agent;

drop function if exists private.sync_customer_profile_identity();
drop function if exists private.sync_agent_profile_identity();
drop function if exists private.enforce_customer_unique_contact();

drop index if exists public.customer_phone_number_lookup_idx;
drop index if exists public.customer_email_lower_lookup_idx;
drop index if exists public.agent_contact_idx;
drop index if exists public.agent_name_idx;

alter table public.agent drop constraint if exists agent_contact_key;

alter table public.customer
  drop column if exists first_name,
  drop column if exists last_name,
  drop column if exists phone_number,
  drop column if exists email,
  drop column if exists address;

alter table public.agent
  drop column if exists first_name,
  drop column if exists last_name,
  drop column if exists display_name,
  drop column if exists contact;
