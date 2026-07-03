create or replace function private.record_payment_insert()
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
  return new;
end;
$$;

drop table if exists public.customer_order_update;
