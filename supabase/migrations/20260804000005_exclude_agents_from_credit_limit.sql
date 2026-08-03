-- Agent identity customers are not subject to retail credit limits.

create or replace function private.customer_is_agent_identity(target_customer_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.agent
    where agent.customer_id = target_customer_id
       or agent.promoted_from_customer_id = target_customer_id
  );
$$;

create or replace function private.compute_customer_credit_balance(target_customer_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.customer_is_agent_identity(target_customer_id) then 0::numeric
    else coalesce((
      select round(coalesce(sum(public.compute_payment_balance(order_row.id)), 0), 2)
      from public."order" order_row
      where order_row.customer_id = target_customer_id
        and order_row.order_kind in ('customer', 'personal')
        and order_row.order_status <> 'closed'
        and order_row.payment_status in ('unpaid', 'partial')
        and order_row.converted_at is null
    ), 0)
  end;
$$;

create or replace function private.refresh_customer_credit_limit_status(target_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_balance numeric;
begin
  if target_customer_id is null then
    return;
  end if;

  if private.customer_is_agent_identity(target_customer_id) then
    update public.customer
    set
      credit_limit_exceeded = false,
      updated_at = now()
    where id = target_customer_id
      and credit_limit_exceeded is distinct from false;

    return;
  end if;

  select private.compute_customer_credit_balance(target_customer_id)
  into current_balance;

  update public.customer
  set
    credit_limit_exceeded = coalesce(current_balance, 0) > 0
      and coalesce(current_balance, 0) >= credit_limit,
    updated_at = now()
  where id = target_customer_id
    and credit_limit_exceeded is distinct from (
      coalesce(current_balance, 0) > 0
      and coalesce(current_balance, 0) >= credit_limit
    );
end;
$$;

alter function private.customer_is_agent_identity(uuid) owner to postgres;
alter function private.compute_customer_credit_balance(uuid) owner to postgres;
alter function private.refresh_customer_credit_limit_status(uuid) owner to postgres;

revoke all on function private.customer_is_agent_identity(uuid) from public;
grant execute on function private.customer_is_agent_identity(uuid) to service_role;
