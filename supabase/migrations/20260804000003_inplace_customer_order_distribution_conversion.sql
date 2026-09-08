-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20260804000003_inplace_customer_order_distribution_conversion.sql

-- Convert promoted customer orders in place instead of inserting a duplicate distribution row.

create or replace function private.is_valid_distribution_order_status_transition(
  from_status text,
  to_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when from_status is null then to_status in ('pending_customers', 'pending_order', 'processing', 'closed')
    when from_status = to_status then true
    when from_status = 'pending' then to_status in ('pending_customers')
    when from_status = 'pending_customers' then to_status in ('pending_order', 'processing', 'closed')
    when from_status = 'pending_order' then to_status in ('processing', 'closed')
    when from_status = 'processing' then to_status in ('closed', 'pending_customers')
    when from_status = 'closed' then false
    else false
  end;
$$;

create or replace function public.convert_customer_order_to_agent_distribution_order(target_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_order public."order"%rowtype;
  source_customer public.customer%rowtype;
  target_agent_id uuid;
  item_count integer;
  conversion_timestamp timestamptz := now();
  acting_admin_id uuid := (select auth.uid());
begin
  if acting_admin_id is null then
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
    if exists (
      select 1
      from public."order"
      where id = target_order_id
        and order_kind = 'distribution'
    ) then
      raise exception 'Customer order was already converted to an agent distribution order.';
    end if;

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

  update public."order"
  set order_kind = 'distribution',
      agent_id = target_agent_id,
      customer_id = null,
      order_status = 'pending_customers',
      source = 'agent_submitted',
      notes = nullif(
        concat_ws(
          E'\n\n',
          source_order.notes,
          'Converted from customer order ' || source_order.id::text
        ),
        ''
      ),
      submitted_by = coalesce(source_order.submitted_by, acting_admin_id),
      approved_by = acting_admin_id,
      approved_at = coalesce(source_order.approved_at, conversion_timestamp),
      admin_read_at = coalesce(source_order.admin_read_at, conversion_timestamp),
      admin_read_by = coalesce(source_order.admin_read_by, acting_admin_id),
      parent_order_id = null,
      converted_at = conversion_timestamp,
      converted_by = acting_admin_id,
      updated_at = conversion_timestamp
  where id = source_order.id;

  update public.order_item
  set order_kind = 'distribution',
      unit_price = null,
      price_type = null,
      final_quantity = partial_quantity,
      updated_at = conversion_timestamp
  where order_id = source_order.id
    and order_kind in ('customer', 'personal');

  return source_order.id;
end;
$$;

comment on function public.convert_customer_order_to_agent_distribution_order(uuid) is
  'Admin-only in-place conversion of an eligible promoted customer order into an agent distribution order. Invoice-only orders are allowed; orders with payment records are blocked.';

alter function public.convert_customer_order_to_agent_distribution_order(uuid) owner to postgres;

revoke all on function public.convert_customer_order_to_agent_distribution_order(uuid) from public;
grant execute on function public.convert_customer_order_to_agent_distribution_order(uuid) to service_role;
grant execute on function public.convert_customer_order_to_agent_distribution_order(uuid) to authenticated;
