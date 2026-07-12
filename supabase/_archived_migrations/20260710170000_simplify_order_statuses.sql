alter table public.customer_order disable trigger validate_order_status_transition;
alter table public.customer_order disable trigger record_order_status_history;

alter table public.customer_order
  alter column order_status set default 'pending';

alter table public.customer_order
  drop constraint if exists customer_order_order_status_check,
  drop constraint if exists customer_order_payment_status_check;

alter table public.customer_order
  add constraint customer_order_order_status_check check (
    order_status in ('pending', 'processing', 'closed')
  ) not valid,
  add constraint customer_order_payment_status_check check (
    payment_status in ('unpaid', 'partial', 'paid', 'refunded')
  ) not valid;

alter table public.customer_order_status_history
  drop constraint if exists customer_order_status_history_from_status_check,
  drop constraint if exists customer_order_status_history_to_status_check;

alter table public.customer_order_status_history
  add constraint customer_order_status_history_from_status_check check (
    from_status is null or from_status in ('pending', 'processing', 'closed')
  ) not valid,
  add constraint customer_order_status_history_to_status_check check (
    to_status in ('pending', 'processing', 'closed')
  ) not valid;

update public.customer_order
set order_status = case
  when order_status in ('closed', 'rejected', 'cancelled') then 'closed'
  when order_status in ('approved', 'processing', 'fulfilled') then 'processing'
  when source = 'admin_manual' then 'processing'
  else 'pending'
end,
payment_status = case
  when payment_status = 'void' then 'unpaid'
  else payment_status
end,
updated_at = now()
where order_status in ('draft', 'submitted', 'approved', 'processing', 'fulfilled', 'rejected', 'cancelled', 'closed')
   or payment_status = 'void';

update public.customer_order_status_history
set from_status = case
  when from_status is null then null
  when from_status in ('closed', 'rejected', 'cancelled') then 'closed'
  when from_status in ('approved', 'processing', 'fulfilled') then 'processing'
  else 'pending'
end,
to_status = case
  when to_status in ('closed', 'rejected', 'cancelled') then 'closed'
  when to_status in ('approved', 'processing', 'fulfilled') then 'processing'
  else 'pending'
end;

alter table public.customer_order
  validate constraint customer_order_order_status_check,
  validate constraint customer_order_payment_status_check;

alter table public.customer_order_status_history
  validate constraint customer_order_status_history_from_status_check,
  validate constraint customer_order_status_history_to_status_check;

create or replace function private.derive_payment_status(target_order_id uuid, current_status text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total
  )
  select case
    when current_status = 'refunded' then 'refunded'
    when invoice_total <= 0 then 'paid'
    when payment_total <= 0 then 'unpaid'
    when payment_total < invoice_total then 'partial'
    else 'paid'
  end
  from totals;
$$;

create or replace function private.is_valid_order_status_transition(from_status text, to_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when from_status is null then to_status in ('pending', 'processing', 'closed')
    when from_status = to_status then true
    when from_status = 'pending' then to_status in ('processing', 'closed')
    when from_status = 'processing' then to_status in ('closed')
    when from_status = 'closed' then false
    else false
  end;
$$;

create or replace function private.validate_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.order_status is distinct from new.order_status
     and not private.is_valid_order_status_transition(old.order_status, new.order_status) then
    raise exception 'Invalid order status transition from % to %.', old.order_status, new.order_status;
  end if;

  return new;
end;
$$;

create or replace function public.submit_guest_order(customer_payload jsonb, item_payload jsonb)
returns uuid
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

  insert into public.customer (
    first_name,
    last_name,
    phone_number,
    email,
    address
  )
  values (
    trim(customer_payload ->> 'firstName'),
    trim(customer_payload ->> 'lastName'),
    trim(customer_payload ->> 'phoneNumber'),
    nullif(trim(customer_payload ->> 'email'), ''),
    trim(customer_payload ->> 'address')
  )
  returning id into inserted_customer_id;

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

create or replace function public.submit_agent_order(
  target_customer_id uuid,
  item_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_agent_id uuid;
  inserted_order_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity numeric;
  item_details text;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated agent is required to submit an order.';
  end if;

  select id
  into current_agent_id
  from public.agent_profile
  where user_id = (select auth.uid())
    and status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can submit agent orders.';
  end if;

  if not exists (
    select 1
    from public.customer
    where id = target_customer_id
      and assigned_agent_id = current_agent_id
  ) then
    raise exception 'Selected customer is not assigned to this agent.';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  insert into public.customer_order (
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    submitted_by
  )
  values (
    target_customer_id,
    current_agent_id,
    'agent_submitted',
    'pending',
    'unpaid',
    (select auth.uid())
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
    raise exception 'Agent order payload contains an invalid product id or quantity.';
end;
$$;

update public.customer_order
set admin_read_at = coalesce(admin_read_at, updated_at, created_at)
where admin_read_at is null
  and (
    source = 'admin_manual'
    or order_status <> 'pending'
  );

drop index if exists customer_order_admin_unread_idx;

create index if not exists customer_order_admin_unread_idx
  on public.customer_order (created_at desc)
  where admin_read_at is null
    and source <> 'admin_manual'
    and order_status = 'pending';

alter table public.customer_order enable trigger validate_order_status_transition;
alter table public.customer_order enable trigger record_order_status_history;
