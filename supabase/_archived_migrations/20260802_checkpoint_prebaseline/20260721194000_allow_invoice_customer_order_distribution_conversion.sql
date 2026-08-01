create or replace function public.convert_customer_order_to_agent_distribution_order(
  target_order_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  source_order public.customer_order%rowtype;
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
  from public.customer_order
  where id = target_order_id
  for update;

  if source_order.id is null then
    raise exception 'Customer order was not found.';
  end if;

  if source_order.converted_to_agent_order_id is not null then
    raise exception 'Customer order was already converted to an agent distribution order.';
  end if;

  if source_order.agent_order_id is not null then
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
  from public.customer_order_item
  where order_id = source_order.id;

  if item_count = 0 then
    raise exception 'Customer order has no items to convert.';
  end if;

  insert into public.agent_order (
    agent_id,
    order_status,
    notes,
    submitted_by,
    admin_read_at,
    admin_read_by,
    created_at,
    updated_at
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
    now()
  )
  returning id into inserted_agent_order_id;

  insert into public.agent_order_item (
    agent_order_id,
    product_id,
    quantity,
    add_details,
    agent_commission_amount,
    created_at,
    updated_at
  )
  select
    inserted_agent_order_id,
    customer_order_item.product_id,
    customer_order_item.partial_quantity,
    customer_order_item.add_details,
    customer_order_item.agent_commission_amount,
    now(),
    now()
  from public.customer_order_item
  where customer_order_item.order_id = source_order.id;

  update public.customer_order
  set converted_to_agent_order_id = inserted_agent_order_id,
      converted_to_agent_order_at = now(),
      converted_to_agent_order_by = (select auth.uid()),
      admin_read_at = coalesce(admin_read_at, now()),
      admin_read_by = coalesce(admin_read_by, (select auth.uid())),
      updated_at = now()
  where id = source_order.id;

  return inserted_agent_order_id;
end;
$$;

alter function public.convert_customer_order_to_agent_distribution_order(uuid) owner to postgres;

revoke all on function public.convert_customer_order_to_agent_distribution_order(uuid) from public;
revoke execute on function public.convert_customer_order_to_agent_distribution_order(uuid) from anon;
revoke execute on function public.convert_customer_order_to_agent_distribution_order(uuid) from authenticated;
grant execute on function public.convert_customer_order_to_agent_distribution_order(uuid) to authenticated;
grant execute on function public.convert_customer_order_to_agent_distribution_order(uuid) to service_role;

comment on function public.convert_customer_order_to_agent_distribution_order(uuid) is
  'Admin-only conversion of an eligible promoted customer order into a new agent distribution order. Invoice-only orders are allowed; orders with payment records are blocked.';
