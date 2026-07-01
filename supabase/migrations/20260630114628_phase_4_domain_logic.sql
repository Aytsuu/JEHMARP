create schema if not exists private;
create or replace function public.compute_order_total(target_order_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select round(
    greatest(
      coalesce(sum(customer_order_item.partial_quantity * product.default_price), 0)
      + customer_order.delivery_fee
      - customer_order.discount_amount,
      0
    ),
    2
  )
  from public.customer_order
  left join public.customer_order_item
    on customer_order_item.order_id = customer_order.id
  left join public.product
    on product.id = customer_order_item.product_id
  where customer_order.id = target_order_id
  group by customer_order.id, customer_order.delivery_fee, customer_order.discount_amount;
$$;
create or replace function public.compute_invoice_total(target_order_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select round(
    greatest(
      coalesce(sum(customer_order_item.final_quantity * product.default_price), 0)
      + customer_order.delivery_fee
      - customer_order.discount_amount,
      0
    ),
    2
  )
  from public.customer_order
  left join public.customer_order_item
    on customer_order_item.order_id = customer_order.id
  left join public.product
    on product.id = customer_order_item.product_id
  where customer_order.id = target_order_id
  group by customer_order.id, customer_order.delivery_fee, customer_order.discount_amount;
$$;
create or replace function public.compute_payment_total(target_order_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select round(coalesce(sum(payment.amount), 0), 2)
  from public.payment
  where payment.order_id = target_order_id;
$$;
create or replace function public.compute_payment_balance(target_order_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select round(
    greatest(
      coalesce(public.compute_invoice_total(target_order_id), 0)
      - coalesce(public.compute_payment_total(target_order_id), 0),
      0
    ),
    2
  );
$$;
create or replace function public.compute_expected_commission(target_order_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select round(coalesce(sum(agent_commission_amount), 0), 2)
  from public.customer_order_item
  where order_id = target_order_id
    and agent_commission_status in ('set', 'paid');
$$;
create or replace function public.compute_earned_commission(target_order_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  with totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total,
      coalesce(public.compute_expected_commission(target_order_id), 0) as expected_commission
  )
  select case
    when invoice_total <= 0 then 0::numeric
    else round(expected_commission * least(payment_total / invoice_total, 1), 2)
  end
  from totals;
$$;
create or replace function public.deactivate_product(target_product_id uuid)
returns public.product
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_product public.product;
begin
  update public.product
  set is_active = false,
      updated_at = now()
  where id = target_product_id
  returning * into updated_product;

  if updated_product.id is null then
    raise exception 'Product % was not found or cannot be deactivated by the current role.', target_product_id;
  end if;

  return updated_product;
end;
$$;
revoke all on function public.compute_order_total(uuid) from public;
revoke all on function public.compute_invoice_total(uuid) from public;
revoke all on function public.compute_payment_total(uuid) from public;
revoke all on function public.compute_payment_balance(uuid) from public;
revoke all on function public.compute_expected_commission(uuid) from public;
revoke all on function public.compute_earned_commission(uuid) from public;
revoke all on function public.deactivate_product(uuid) from public;
grant execute on function public.compute_order_total(uuid) to authenticated, service_role;
grant execute on function public.compute_invoice_total(uuid) to authenticated, service_role;
grant execute on function public.compute_payment_total(uuid) to authenticated, service_role;
grant execute on function public.compute_payment_balance(uuid) to authenticated, service_role;
grant execute on function public.compute_expected_commission(uuid) to authenticated, service_role;
grant execute on function public.compute_earned_commission(uuid) to authenticated, service_role;
grant execute on function public.deactivate_product(uuid) to authenticated, service_role;
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
    when current_status in ('refunded', 'void') then current_status
    when invoice_total <= 0 then 'paid'
    when payment_total <= 0 then 'unpaid'
    when payment_total < invoice_total then 'partial'
    else 'paid'
  end
  from totals;
$$;
create or replace function private.derive_invoice_status(target_order_id uuid, current_status text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with invoice_row as (
    select invoice.status, invoice.due_at
    from public.invoice
    where invoice.order_id = target_order_id
    limit 1
  ),
  totals as (
    select
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total,
      invoice_row.due_at
    from invoice_row
  )
  select case
    when current_status = 'void' then 'void'
    when invoice_total <= 0 then 'paid'
    when payment_total >= invoice_total then 'paid'
    when payment_total > 0 then
      case
        when due_at is not null and due_at < now() then 'overdue'
        else 'partially_paid'
      end
    when current_status = 'draft' then 'draft'
    when due_at is not null and due_at < now() then 'overdue'
    else 'issued'
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
    when from_status is null then to_status in ('draft', 'submitted', 'approved', 'processing', 'fulfilled', 'rejected', 'cancelled', 'closed')
    when from_status = to_status then true
    when from_status = 'draft' then to_status in ('submitted', 'cancelled')
    when from_status = 'submitted' then to_status in ('approved', 'rejected', 'cancelled')
    when from_status = 'approved' then to_status in ('processing', 'fulfilled', 'cancelled', 'closed')
    when from_status = 'processing' then to_status in ('fulfilled', 'cancelled', 'closed')
    when from_status = 'fulfilled' then to_status in ('closed')
    when from_status in ('rejected', 'cancelled', 'closed') then false
    else false
  end;
$$;
create or replace function private.is_valid_invoice_status_transition(from_status text, to_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when from_status is null then to_status in ('draft', 'issued', 'partially_paid', 'paid', 'void', 'overdue')
    when from_status = to_status then true
    when from_status = 'void' then false
    when to_status = 'void' then true
    when from_status = 'draft' then to_status in ('issued', 'partially_paid', 'paid', 'overdue')
    when from_status = 'issued' then to_status in ('partially_paid', 'paid', 'overdue')
    when from_status = 'partially_paid' then to_status in ('issued', 'paid', 'overdue')
    when from_status = 'paid' then to_status in ('partially_paid', 'overdue')
    when from_status = 'overdue' then to_status in ('issued', 'partially_paid', 'paid')
    else false
  end;
$$;
create or replace function private.refresh_order_financial_status(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_payment_status text;
  next_invoice_status text;
  current_invoice_status text;
begin
  select private.derive_payment_status(target_order_id, customer_order.payment_status)
  into next_payment_status
  from public.customer_order
  where customer_order.id = target_order_id;

  if next_payment_status is not null then
    update public.customer_order
    set payment_status = next_payment_status,
        updated_at = now()
    where id = target_order_id
      and payment_status is distinct from next_payment_status;
  end if;

  select invoice.status
  into current_invoice_status
  from public.invoice
  where invoice.order_id = target_order_id
  limit 1;

  if current_invoice_status is not null then
    next_invoice_status := private.derive_invoice_status(target_order_id, current_invoice_status);

    update public.invoice
    set status = next_invoice_status,
        updated_at = now()
    where order_id = target_order_id
      and status is distinct from next_invoice_status;
  end if;
end;
$$;
create or replace function private.sync_order_item_final_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.partial_quantity is distinct from old.partial_quantity then
    new.final_quantity := new.partial_quantity;
  end if;

  return new;
end;
$$;
create or replace function private.refresh_order_after_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.refresh_order_financial_status(new.order_id);
    return new;
  end if;

  perform private.refresh_order_financial_status(old.order_id);
  return old;
end;
$$;
create or replace function private.refresh_order_after_adjustment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_order_financial_status(new.id);
  return new;
end;
$$;
create or replace function private.block_payment_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Payment records are append-only. Create a new compensating workflow record instead of updating or deleting an existing payment.';
end;
$$;
create or replace function private.record_payment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_order_financial_status(new.order_id);

  insert into public.customer_order_update (
    order_id,
    update_type,
    title,
    details,
    created_by
  )
  values (
    new.order_id,
    'payment',
    'Payment recorded',
    'Payment of ' || new.amount::text || ' recorded by ' || new.payment_method || coalesce(' with reference ' || new.reference_number, '') || '.',
    auth.uid()
  );

  return new;
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

  if old.order_status is distinct from new.order_status
     and new.order_status = 'approved'
     and new.approved_at is null then
    new.approved_at := now();
  end if;

  return new;
end;
$$;
create or replace function private.record_order_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
begin
  if tg_op = 'INSERT' then
    previous_status := null;
  elsif old.order_status is not distinct from new.order_status then
    return new;
  else
    previous_status := old.order_status;
  end if;

  insert into public.customer_order_status_history (
    order_id,
    from_status,
    to_status,
    changed_by,
    notes
  )
  values (
    new.id,
    previous_status,
    new.order_status,
    auth.uid(),
    case
      when previous_status is null then 'Order created with status ' || new.order_status || '.'
      else 'Order status changed from ' || previous_status || ' to ' || new.order_status || '.'
    end
  );

  insert into public.customer_order_update (
    order_id,
    update_type,
    title,
    details,
    created_by
  )
  values (
    new.id,
    'order_status',
    'Order status changed',
    case
      when previous_status is null then 'Order created with status ' || new.order_status || '.'
      else 'Order status changed from ' || previous_status || ' to ' || new.order_status || '.'
    end,
    auth.uid()
  );

  return new;
end;
$$;
create or replace function private.validate_invoice_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     and not private.is_valid_invoice_status_transition(old.status, new.status) then
    raise exception 'Invalid invoice status transition from % to %.', old.status, new.status;
  end if;

  return new;
end;
$$;
create or replace function private.record_invoice_status_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  insert into public.customer_order_update (
    order_id,
    update_type,
    title,
    details,
    created_by
  )
  values (
    new.order_id,
    'invoice_status',
    'Invoice status changed',
    'Invoice status changed from ' || old.status || ' to ' || new.status || '.',
    auth.uid()
  );

  return new;
end;
$$;
create or replace function private.refresh_order_after_invoice_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_order_financial_status(new.order_id);
  return new;
end;
$$;
create or replace function private.block_referenced_product_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.customer_order_item
    where product_id = old.id
  ) then
    raise exception 'Products referenced by order items cannot be deleted. Deactivate the product instead.';
  end if;

  return old;
end;
$$;
drop trigger if exists sync_order_item_final_quantity on public.customer_order_item;
create trigger sync_order_item_final_quantity
before insert or update of partial_quantity on public.customer_order_item
for each row
execute function private.sync_order_item_final_quantity();
drop trigger if exists refresh_order_after_item_change on public.customer_order_item;
create trigger refresh_order_after_item_change
after insert or update of final_quantity, partial_quantity, product_id, agent_commission_amount, agent_commission_status or delete
on public.customer_order_item
for each row
execute function private.refresh_order_after_item_change();
drop trigger if exists refresh_order_after_adjustment_change on public.customer_order;
create trigger refresh_order_after_adjustment_change
after update of discount_amount, delivery_fee on public.customer_order
for each row
execute function private.refresh_order_after_adjustment_change();
drop trigger if exists block_payment_mutation on public.payment;
create trigger block_payment_mutation
before update or delete on public.payment
for each row
execute function private.block_payment_mutation();
drop trigger if exists record_payment_insert on public.payment;
create trigger record_payment_insert
after insert on public.payment
for each row
execute function private.record_payment_insert();
drop trigger if exists validate_order_status_transition on public.customer_order;
create trigger validate_order_status_transition
before update of order_status on public.customer_order
for each row
execute function private.validate_order_status_transition();
drop trigger if exists record_order_status_history on public.customer_order;
create trigger record_order_status_history
after insert or update of order_status on public.customer_order
for each row
execute function private.record_order_status_history();
drop trigger if exists validate_invoice_status_transition on public.invoice;
create trigger validate_invoice_status_transition
before update of status on public.invoice
for each row
execute function private.validate_invoice_status_transition();
drop trigger if exists record_invoice_status_update on public.invoice;
create trigger record_invoice_status_update
after update of status on public.invoice
for each row
execute function private.record_invoice_status_update();
drop trigger if exists refresh_order_after_invoice_insert on public.invoice;
create trigger refresh_order_after_invoice_insert
after insert on public.invoice
for each row
execute function private.refresh_order_after_invoice_insert();
drop trigger if exists block_referenced_product_delete on public.product;
create trigger block_referenced_product_delete
before delete on public.product
for each row
execute function private.block_referenced_product_delete();
revoke all on function private.derive_payment_status(uuid, text) from public;
revoke all on function private.derive_invoice_status(uuid, text) from public;
revoke all on function private.is_valid_order_status_transition(text, text) from public;
revoke all on function private.is_valid_invoice_status_transition(text, text) from public;
revoke all on function private.refresh_order_financial_status(uuid) from public;
revoke all on function private.sync_order_item_final_quantity() from public;
revoke all on function private.refresh_order_after_item_change() from public;
revoke all on function private.refresh_order_after_adjustment_change() from public;
revoke all on function private.block_payment_mutation() from public;
revoke all on function private.record_payment_insert() from public;
revoke all on function private.validate_order_status_transition() from public;
revoke all on function private.record_order_status_history() from public;
revoke all on function private.validate_invoice_status_transition() from public;
revoke all on function private.record_invoice_status_update() from public;
revoke all on function private.refresh_order_after_invoice_insert() from public;
revoke all on function private.block_referenced_product_delete() from public;
grant execute on function private.derive_payment_status(uuid, text) to service_role;
grant execute on function private.derive_invoice_status(uuid, text) to service_role;
grant execute on function private.is_valid_order_status_transition(text, text) to service_role;
grant execute on function private.is_valid_invoice_status_transition(text, text) to service_role;
grant execute on function private.refresh_order_financial_status(uuid) to service_role;
