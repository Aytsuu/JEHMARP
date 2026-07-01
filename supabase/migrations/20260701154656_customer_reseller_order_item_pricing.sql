alter table public.customer
  add column if not exists is_reseller boolean not null default false;

alter table public.customer_order_item
  add column if not exists unit_price numeric(12, 2),
  add column if not exists price_type text;

update public.customer_order_item
set
  unit_price = product.default_price,
  price_type = 'retail'
from public.product
where product.id = customer_order_item.product_id
  and (
    customer_order_item.unit_price is null
    or customer_order_item.price_type is null
  );

alter table public.customer_order_item
  alter column unit_price set not null,
  alter column price_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_order_item_unit_price_check'
      and conrelid = 'public.customer_order_item'::regclass
  ) then
    alter table public.customer_order_item
      add constraint customer_order_item_unit_price_check check (unit_price >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_order_item_price_type_check'
      and conrelid = 'public.customer_order_item'::regclass
  ) then
    alter table public.customer_order_item
      add constraint customer_order_item_price_type_check check (price_type in ('retail', 'reseller'));
  end if;
end $$;

create or replace function public.compute_order_total(target_order_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select round(
    greatest(
      coalesce(sum(customer_order_item.partial_quantity * customer_order_item.unit_price), 0)
      + customer_order.delivery_fee
      - customer_order.discount_amount,
      0
    ),
    2
  )
  from public.customer_order
  left join public.customer_order_item
    on customer_order_item.order_id = customer_order.id
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
      coalesce(sum(customer_order_item.final_quantity * customer_order_item.unit_price), 0)
      + customer_order.delivery_fee
      - customer_order.discount_amount,
      0
    ),
    2
  )
  from public.customer_order
  left join public.customer_order_item
    on customer_order_item.order_id = customer_order.id
  where customer_order.id = target_order_id
  group by customer_order.id, customer_order.delivery_fee, customer_order.discount_amount;
$$;

create or replace function private.sync_order_item_price_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_customer_is_reseller boolean;
  retail_price numeric;
  reseller_price_value numeric;
begin
  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id then
    select customer.is_reseller
    into order_customer_is_reseller
    from public.customer_order
    join public.customer
      on customer.id = customer_order.customer_id
    where customer_order.id = new.order_id;

    if order_customer_is_reseller is null then
      raise exception 'Order % does not have a valid customer for pricing.', new.order_id;
    end if;

    select product.default_price, product.reseller_price
    into retail_price, reseller_price_value
    from public.product
    where product.id = new.product_id;

    if retail_price is null or reseller_price_value is null then
      raise exception 'Product % does not have valid prices for order item pricing.', new.product_id;
    end if;

    new.price_type := case
      when order_customer_is_reseller then 'reseller'
      else 'retail'
    end;
    new.unit_price := case
      when order_customer_is_reseller then reseller_price_value
      else retail_price
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_order_item_price_snapshot on public.customer_order_item;
create trigger sync_order_item_price_snapshot
before insert or update of product_id on public.customer_order_item
for each row
execute function private.sync_order_item_price_snapshot();

drop trigger if exists refresh_order_after_item_change on public.customer_order_item;
create trigger refresh_order_after_item_change
after insert or update of final_quantity, partial_quantity, product_id, unit_price, price_type, agent_commission_amount, agent_commission_status or delete
on public.customer_order_item
for each row
execute function private.refresh_order_after_item_change();

revoke all on function private.sync_order_item_price_snapshot() from public;
grant execute on function private.sync_order_item_price_snapshot() to service_role;

comment on column public.customer.is_reseller is
  'When true, new order item price snapshots use product.reseller_price instead of product.default_price.';

comment on column public.customer_order_item.unit_price is
  'Price snapshot used for order and invoice totals. Set from product default or reseller price when the item is created.';

comment on column public.customer_order_item.price_type is
  'Price source for the unit_price snapshot: retail or reseller.';
