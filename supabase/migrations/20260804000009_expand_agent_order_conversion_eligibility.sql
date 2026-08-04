-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20260804000009_expand_agent_order_conversion_eligibility.sql

create or replace function public.convert_personal_order_to_distribution_order(target_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_agent_id uuid;
  current_agent_customer_id uuid;
  source_order public."order"%rowtype;
  item_count integer;
  conversion_timestamp timestamptz := now();
  acting_user_id uuid := (select auth.uid());
begin
  if acting_user_id is null then
    raise exception 'An authenticated agent is required to convert agent orders.';
  end if;

  select
    agent_row.id,
    agent_row.customer_id
  into
    current_agent_id,
    current_agent_customer_id
  from public.agent agent_row
  where agent_row.user_id = acting_user_id
    and agent_row.status = 'active'
  limit 1;

  if current_agent_id is null then
    raise exception 'Only active agents can convert agent orders.';
  end if;

  select *
  into source_order
  from public."order"
  where id = target_order_id
    and order_kind in ('customer', 'personal')
    and (
      agent_id = current_agent_id
      or (
        order_kind = 'customer'
        and current_agent_customer_id is not null
        and customer_id = current_agent_customer_id
      )
    )
  for update;

  if source_order.id is null then
    if exists (
      select 1
      from public."order"
      where id = target_order_id
        and order_kind = 'distribution'
        and agent_id = current_agent_id
    ) then
      raise exception 'Agent order was already converted to a distribution order.';
    end if;

    raise exception 'Agent order was not found.';
  end if;

  if source_order.converted_at is not null then
    raise exception 'Agent order was already converted to a distribution order.';
  end if;

  if source_order.parent_order_id is not null then
    raise exception 'Agent order is already linked to a distribution order.';
  end if;

  if source_order.order_status = 'closed' then
    raise exception 'Closed agent orders cannot be converted.';
  end if;

  if exists (
    select 1
    from public.payment
    where payment.order_id = source_order.id
  ) then
    raise exception 'Agent orders with payment records cannot be converted.';
  end if;

  if exists (
    select 1
    from public.agent_received_payment
    where agent_received_payment.order_id = source_order.id
  ) then
    raise exception 'Agent orders with agent payment records cannot be converted.';
  end if;

  select count(*)
  into item_count
  from public.order_item
  where order_id = source_order.id
    and order_kind in ('customer', 'personal');

  if item_count = 0 then
    raise exception 'Agent order has no items to convert.';
  end if;

  update public."order"
  set order_kind = 'distribution',
      agent_id = current_agent_id,
      customer_id = null,
      order_status = 'pending_customers',
      source = 'agent_submitted',
      notes = nullif(
        concat_ws(
          E'\n\n',
          source_order.notes,
          'Converted from agent order ' || source_order.id::text
        ),
        ''
      ),
      submitted_by = coalesce(source_order.submitted_by, acting_user_id),
      approved_by = coalesce(source_order.approved_by, acting_user_id),
      approved_at = coalesce(source_order.approved_at, conversion_timestamp),
      admin_read_at = coalesce(source_order.admin_read_at, conversion_timestamp),
      admin_read_by = coalesce(source_order.admin_read_by, acting_user_id),
      parent_order_id = null,
      converted_at = conversion_timestamp,
      converted_by = acting_user_id,
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

comment on function public.convert_personal_order_to_distribution_order(uuid) is
  'Agent-only in-place conversion of an eligible standalone customer or personal agent order into a distribution order. Orders with payment records are blocked.';

alter function public.convert_personal_order_to_distribution_order(uuid) owner to postgres;

revoke all on function public.convert_personal_order_to_distribution_order(uuid) from public;
grant execute on function public.convert_personal_order_to_distribution_order(uuid) to service_role;
grant execute on function public.convert_personal_order_to_distribution_order(uuid) to authenticated;
