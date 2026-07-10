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
    when from_status = 'closed' then to_status = 'processing'
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
  if old.order_status is distinct from new.order_status then
    if old.order_status = 'closed'
       and new.order_status = 'processing'
       and old.payment_status = 'paid' then
      raise exception 'Paid closed orders cannot be reopened.';
    end if;

    if not private.is_valid_order_status_transition(old.order_status, new.order_status) then
      raise exception 'Invalid order status transition from % to %.', old.order_status, new.order_status;
    end if;
  end if;

  return new;
end;
$$;
