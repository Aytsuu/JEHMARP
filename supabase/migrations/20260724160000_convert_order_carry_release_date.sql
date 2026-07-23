-- Carry release_date from source customer order when converting to distribution order

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
    payment_status,
    release_date
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
    'unpaid',
    source_order.release_date
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

alter function public.convert_customer_order_to_agent_distribution_order(uuid) owner to postgres;
