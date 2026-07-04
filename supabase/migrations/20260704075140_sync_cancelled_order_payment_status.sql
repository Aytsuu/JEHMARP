create or replace function private.derive_payment_status(target_order_id uuid, current_status text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with order_totals as (
    select
      customer_order.order_status,
      coalesce(public.compute_invoice_total(target_order_id), 0) as invoice_total,
      coalesce(public.compute_payment_total(target_order_id), 0) as payment_total
    from public.customer_order
    where customer_order.id = target_order_id
  )
  select case
    when order_status in ('cancelled', 'rejected') and payment_total > 0 then 'refunded'
    when order_status in ('cancelled', 'rejected') then 'void'
    when current_status in ('refunded', 'void') then current_status
    when invoice_total <= 0 then 'paid'
    when payment_total <= 0 then 'unpaid'
    when payment_total < invoice_total then 'partial'
    else 'paid'
  end
  from order_totals;
$$;

create or replace function private.refresh_order_after_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.order_status is distinct from new.order_status then
    perform private.refresh_order_financial_status(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists refresh_order_after_order_status_change on public.customer_order;
create trigger refresh_order_after_order_status_change
after update of order_status on public.customer_order
for each row
execute function private.refresh_order_after_order_status_change();

do $$
declare
  order_record record;
begin
  for order_record in
    select id
    from public.customer_order
    where order_status in ('cancelled', 'rejected')
  loop
    perform private.refresh_order_financial_status(order_record.id);
  end loop;
end $$;

revoke all on function private.derive_payment_status(uuid, text) from public;
revoke all on function private.refresh_order_after_order_status_change() from public;
grant execute on function private.derive_payment_status(uuid, text) to service_role;
grant execute on function private.refresh_order_after_order_status_change() to service_role;
