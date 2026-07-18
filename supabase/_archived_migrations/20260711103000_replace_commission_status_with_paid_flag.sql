alter table public.customer_order_item
add column if not exists agent_commission_paid boolean not null default false;

update public.customer_order_item
set agent_commission_paid = (agent_commission_status = 'paid')
where true;

drop trigger if exists refresh_order_after_item_change on public.customer_order_item;

drop index if exists public.customer_order_item_commission_status_idx;

alter table public.customer_order_item
drop constraint if exists customer_order_item_commission_status_check;

alter table public.customer_order_item
drop constraint if exists customer_order_item_commission_set_check;

alter table public.customer_order_item
add constraint customer_order_item_commission_set_check check (
  (
    agent_commission_amount = 0
    and agent_commission_paid = false
    and agent_commission_set_by is null
    and agent_commission_set_at is null
  )
  or agent_commission_amount > 0
);

alter table public.customer_order_item
drop column if exists agent_commission_status;

create index if not exists customer_order_item_commission_paid_idx
on public.customer_order_item (agent_commission_paid);

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
    and agent_commission_amount > 0;
$$;

create trigger refresh_order_after_item_change
after insert or update of final_quantity, partial_quantity, product_id, unit_price, price_type, agent_commission_amount or delete
on public.customer_order_item
for each row
execute function private.refresh_order_after_item_change();
