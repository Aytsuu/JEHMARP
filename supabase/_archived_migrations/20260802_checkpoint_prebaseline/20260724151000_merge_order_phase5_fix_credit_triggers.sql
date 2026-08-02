-- Phase 5b: Fix remaining trigger helpers after compat view removal

create or replace function private.refresh_customer_credit_after_order_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  target_customer_id uuid;
begin
  target_order_id := coalesce(new.order_id, old.order_id);

  select order_row.customer_id
  into target_customer_id
  from public."order" order_row
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal');

  perform private.refresh_customer_credit_limit_status(target_customer_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function private.refresh_customer_credit_after_payment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  target_customer_id uuid;
begin
  target_order_id := coalesce(new.order_id, old.order_id);

  select order_row.customer_id
  into target_customer_id
  from public."order" order_row
  where order_row.id = target_order_id
    and order_row.order_kind in ('customer', 'personal');

  perform private.refresh_customer_credit_limit_status(target_customer_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function private.close_paid_customer_order_after_payment_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_kind in ('customer', 'personal')
    and new.payment_status = 'paid'
    and old.payment_status is distinct from new.payment_status then
    perform private.close_paid_customer_order(new.id);
  end if;

  return new;
end;
$$;

drop function if exists private.customer_order_view_insert();
drop function if exists private.customer_order_view_update();
drop function if exists private.customer_order_view_delete();
drop function if exists private.customer_order_item_view_insert();
drop function if exists private.customer_order_item_view_update();
drop function if exists private.customer_order_item_view_delete();
drop function if exists private.agent_order_view_insert();
drop function if exists private.agent_order_view_update();
drop function if exists private.agent_order_view_delete();
drop function if exists private.agent_order_item_view_insert();
drop function if exists private.agent_order_item_view_update();
drop function if exists private.agent_order_item_view_delete();
