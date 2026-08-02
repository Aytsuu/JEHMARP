-- migration-safety: destructive-reviewed
-- Phase 2: Fold agent_order into unified order table

-- Distribution orders use pending_customers/pending_order statuses in history rows.
alter table public.order_status_history
  drop constraint if exists customer_order_status_history_from_status_check;

alter table public.order_status_history
  drop constraint if exists customer_order_status_history_to_status_check;

alter table public.order_status_history
  drop constraint if exists order_status_history_from_status_check;

alter table public.order_status_history
  drop constraint if exists order_status_history_to_status_check;

alter table public.order_status_history
  add constraint order_status_history_from_status_check
  check (
    from_status is null
    or from_status = any (
      array[
        'pending'::text,
        'processing'::text,
        'closed'::text,
        'pending_customers'::text,
        'pending_order'::text
      ]
    )
  );

alter table public.order_status_history
  add constraint order_status_history_to_status_check
  check (
    to_status = any (
      array[
        'pending'::text,
        'processing'::text,
        'closed'::text,
        'pending_customers'::text,
        'pending_order'::text
      ]
    )
  );

insert into public."order" (
  id,
  agent_id,
  order_status,
  notes,
  submitted_by,
  admin_read_at,
  admin_read_by,
  created_at,
  updated_at,
  release_date,
  sale_date,
  order_kind,
  customer_id,
  source,
  payment_status
)
select
  agent_order_row.id,
  agent_order_row.agent_id,
  agent_order_row.order_status,
  agent_order_row.notes,
  agent_order_row.submitted_by,
  agent_order_row.admin_read_at,
  agent_order_row.admin_read_by,
  agent_order_row.created_at,
  agent_order_row.updated_at,
  agent_order_row.release_date,
  agent_order_row.sale_date,
  'distribution',
  null,
  'agent_submitted',
  'unpaid'
from public.agent_order agent_order_row;

-- Distribution items omit unit_price/price_type; skip customer pricing for them.
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
  if new.order_kind = 'distribution' then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.product_id is distinct from old.product_id then
    select customer.is_reseller
    into order_customer_is_reseller
    from public."order" order_row
    join public.customer
      on customer.id = order_row.customer_id
    where order_row.id = new.order_id
      and order_row.order_kind in ('customer', 'personal');

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

    if order_customer_is_reseller then
      new.unit_price := reseller_price_value;
      new.price_type := 'reseller';
    else
      new.unit_price := retail_price;
      new.price_type := 'retail';
    end if;
  end if;

  return new;
end;
$$;

alter function private.sync_order_item_price_snapshot() owner to postgres;

insert into public.order_item (
  id,
  order_id,
  product_id,
  partial_quantity,
  final_quantity,
  add_details,
  created_at,
  updated_at,
  agent_commission_amount,
  agent_commission_set_by,
  agent_commission_set_at,
  unit_price,
  price_type,
  agent_commission_paid,
  agent_order_quantity_increase,
  order_kind
)
select
  agent_order_item_row.id,
  agent_order_item_row.agent_order_id,
  agent_order_item_row.product_id,
  agent_order_item_row.quantity,
  agent_order_item_row.quantity,
  agent_order_item_row.add_details,
  agent_order_item_row.created_at,
  agent_order_item_row.updated_at,
  agent_order_item_row.agent_commission_amount,
  agent_order_item_row.agent_commission_updated_by,
  agent_order_item_row.agent_commission_updated_at,
  null,
  null,
  false,
  0,
  'distribution'
from public.agent_order_item agent_order_item_row;

update public."order" child_order
set parent_order_id = child_order.agent_order_id
where child_order.agent_order_id is not null
  and child_order.order_kind in ('customer', 'personal');

update public."order" child_order
set
  parent_order_id = coalesce(child_order.parent_order_id, child_order.converted_to_agent_order_id),
  converted_at = coalesce(child_order.converted_at, child_order.converted_to_agent_order_at),
  converted_by = coalesce(child_order.converted_by, child_order.converted_to_agent_order_by)
where child_order.converted_to_agent_order_id is not null;

alter table public."order"
  drop constraint if exists customer_order_agent_order_id_fkey;

alter table public."order"
  drop constraint if exists customer_order_converted_to_agent_order_id_fkey;

alter table public."order"
  add constraint order_parent_order_id_fkey
  foreign key (parent_order_id)
  references public."order"(id)
  on delete restrict;

drop trigger if exists sync_agent_order_sale_date on public.agent_order;

create or replace function private.sync_order_sale_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_kind = 'distribution' then
    if new.order_status = 'closed' then
      new.sale_date := coalesce(new.sale_date, now());
    else
      new.sale_date := null;
    end if;
  elsif new.order_kind in ('customer', 'personal') then
    if new.order_status = 'closed' and new.payment_status = 'paid' then
      new.sale_date := coalesce(new.sale_date, now());
    else
      new.sale_date := null;
    end if;
  end if;

  return new;
end;
$$;

alter function private.sync_order_sale_date() owner to postgres;

drop trigger if exists sync_customer_order_sale_date on public."order";

create trigger sync_order_sale_date
  before insert or update of order_status, payment_status, sale_date, order_kind on public."order"
  for each row
  execute function private.sync_order_sale_date();

drop table if exists public.agent_order_item;
drop table if exists public.agent_order;

create or replace function private.customer_order_view_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_row public."order"%rowtype;
begin
  insert into public."order" (
    id,
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    submitted_by,
    approved_by,
    approved_at,
    created_at,
    updated_at,
    admin_read_at,
    admin_read_by,
    notes,
    agent_order_id,
    release_date,
    converted_to_agent_order_id,
    converted_to_agent_order_at,
    converted_to_agent_order_by,
    sale_date,
    order_kind,
    parent_order_id,
    converted_at,
    converted_by
  )
  values (
    coalesce(new.id, extensions.gen_random_uuid()),
    new.customer_id,
    new.agent_id,
    new.source,
    new.order_status,
    new.payment_status,
    new.submitted_by,
    new.approved_by,
    new.approved_at,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now()),
    new.admin_read_at,
    new.admin_read_by,
    new.notes,
    new.agent_order_id,
    new.release_date,
    new.converted_to_agent_order_id,
    new.converted_to_agent_order_at,
    new.converted_to_agent_order_by,
    new.sale_date,
    case
      when new.agent_id is not null
        and new.customer_id is not null
        and exists (
          select 1
          from public.agent agent_row
          where agent_row.id = new.agent_id
            and agent_row.customer_id = new.customer_id
        )
        and new.source = 'agent_submitted'
      then 'personal'
      else 'customer'
    end,
    coalesce(new.agent_order_id, new.converted_to_agent_order_id),
    new.converted_to_agent_order_at,
    new.converted_to_agent_order_by
  )
  returning * into inserted_row;

  new.id := inserted_row.id;
  return new;
end;
$$;

create or replace function private.customer_order_view_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public."order" target_order
  set
    customer_id = coalesce(new.customer_id, old.customer_id),
    agent_id = coalesce(new.agent_id, old.agent_id),
    source = coalesce(new.source, old.source),
    order_status = coalesce(new.order_status, old.order_status),
    payment_status = coalesce(new.payment_status, old.payment_status),
    submitted_by = coalesce(new.submitted_by, old.submitted_by),
    approved_by = coalesce(new.approved_by, old.approved_by),
    approved_at = coalesce(new.approved_at, old.approved_at),
    updated_at = coalesce(new.updated_at, now()),
    admin_read_at = coalesce(new.admin_read_at, old.admin_read_at),
    admin_read_by = coalesce(new.admin_read_by, old.admin_read_by),
    notes = coalesce(new.notes, old.notes),
    agent_order_id = coalesce(new.agent_order_id, old.agent_order_id),
    release_date = coalesce(new.release_date, old.release_date),
    converted_to_agent_order_id = coalesce(new.converted_to_agent_order_id, old.converted_to_agent_order_id),
    converted_to_agent_order_at = coalesce(new.converted_to_agent_order_at, old.converted_to_agent_order_at),
    converted_to_agent_order_by = coalesce(new.converted_to_agent_order_by, old.converted_to_agent_order_by),
    sale_date = coalesce(new.sale_date, old.sale_date),
    parent_order_id = coalesce(
      new.agent_order_id,
      new.converted_to_agent_order_id,
      old.agent_order_id,
      old.converted_to_agent_order_id
    ),
    converted_at = coalesce(new.converted_to_agent_order_at, old.converted_to_agent_order_at),
    converted_by = coalesce(new.converted_to_agent_order_by, old.converted_to_agent_order_by)
  where target_order.id = old.id
    and target_order.order_kind in ('customer', 'personal');

  return new;
end;
$$;

create or replace function private.customer_order_view_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public."order" target_order
  where target_order.id = old.id
    and target_order.order_kind in ('customer', 'personal');

  return old;
end;
$$;

create or replace function private.customer_order_item_view_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_kind text;
begin
  select parent_order.order_kind
  into parent_kind
  from public."order" parent_order
  where parent_order.id = new.order_id;

  if parent_kind is null then
    raise exception 'Order % was not found for order item insert.', new.order_id;
  end if;

  if parent_kind not in ('customer', 'personal') then
    raise exception 'Customer order items can only be attached to customer or personal orders.';
  end if;

  insert into public.order_item (
    id,
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    created_at,
    updated_at,
    add_details,
    agent_commission_amount,
    agent_commission_set_by,
    agent_commission_set_at,
    unit_price,
    price_type,
    agent_commission_paid,
    agent_order_quantity_increase,
    order_kind
  )
  values (
    coalesce(new.id, extensions.gen_random_uuid()),
    new.order_id,
    new.product_id,
    new.partial_quantity,
    new.final_quantity,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now()),
    new.add_details,
    coalesce(new.agent_commission_amount, 0),
    new.agent_commission_set_by,
    new.agent_commission_set_at,
    new.unit_price,
    new.price_type,
    coalesce(new.agent_commission_paid, false),
    coalesce(new.agent_order_quantity_increase, 0),
    parent_kind
  );

  return new;
end;
$$;

create or replace function private.customer_order_item_view_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.order_item target_item
  set
    order_id = new.order_id,
    product_id = new.product_id,
    partial_quantity = new.partial_quantity,
    final_quantity = new.final_quantity,
    updated_at = coalesce(new.updated_at, now()),
    add_details = new.add_details,
    agent_commission_amount = new.agent_commission_amount,
    agent_commission_set_by = new.agent_commission_set_by,
    agent_commission_set_at = new.agent_commission_set_at,
    unit_price = new.unit_price,
    price_type = new.price_type,
    agent_commission_paid = new.agent_commission_paid,
    agent_order_quantity_increase = new.agent_order_quantity_increase
  where target_item.id = old.id
    and target_item.order_kind in ('customer', 'personal');

  return new;
end;
$$;

create or replace function private.customer_order_item_view_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.order_item target_item
  where target_item.id = old.id
    and target_item.order_kind in ('customer', 'personal');

  return old;
end;
$$;

create or replace function private.agent_order_view_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_row public."order"%rowtype;
begin
  insert into public."order" (
    id,
    agent_id,
    order_status,
    notes,
    submitted_by,
    admin_read_at,
    admin_read_by,
    created_at,
    updated_at,
    release_date,
    sale_date,
    order_kind,
    customer_id,
    source,
    payment_status
  )
  values (
    coalesce(new.id, extensions.gen_random_uuid()),
    new.agent_id,
    new.order_status,
    new.notes,
    new.submitted_by,
    new.admin_read_at,
    new.admin_read_by,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now()),
    new.release_date,
    new.sale_date,
    'distribution',
    null,
    'agent_submitted',
    'unpaid'
  )
  returning * into inserted_row;

  new.id := inserted_row.id;
  return new;
end;
$$;

create or replace function private.agent_order_view_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public."order" target_order
  set
    agent_id = new.agent_id,
    order_status = new.order_status,
    notes = new.notes,
    submitted_by = new.submitted_by,
    admin_read_at = new.admin_read_at,
    admin_read_by = new.admin_read_by,
    updated_at = coalesce(new.updated_at, now()),
    release_date = new.release_date,
    sale_date = new.sale_date
  where target_order.id = old.id
    and target_order.order_kind = 'distribution';

  return new;
end;
$$;

create or replace function private.agent_order_view_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public."order" target_order
  where target_order.id = old.id
    and target_order.order_kind = 'distribution';

  return old;
end;
$$;

create or replace function private.agent_order_item_view_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_item (
    id,
    order_id,
    product_id,
    partial_quantity,
    final_quantity,
    add_details,
    created_at,
    updated_at,
    agent_commission_amount,
    agent_commission_set_by,
    agent_commission_set_at,
    unit_price,
    price_type,
    agent_commission_paid,
    agent_order_quantity_increase,
    order_kind
  )
  values (
    coalesce(new.id, extensions.gen_random_uuid()),
    new.agent_order_id,
    new.product_id,
    new.quantity,
    new.quantity,
    new.add_details,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now()),
    coalesce(new.agent_commission_amount, 0),
    new.agent_commission_updated_by,
    new.agent_commission_updated_at,
    null,
    null,
    false,
    0,
    'distribution'
  );

  return new;
end;
$$;

create or replace function private.agent_order_item_view_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.order_item target_item
  set
    order_id = new.agent_order_id,
    product_id = new.product_id,
    partial_quantity = new.quantity,
    final_quantity = new.quantity,
    add_details = new.add_details,
    updated_at = coalesce(new.updated_at, now()),
    agent_commission_amount = new.agent_commission_amount,
    agent_commission_set_by = new.agent_commission_updated_by,
    agent_commission_set_at = new.agent_commission_updated_at
  where target_item.id = old.id
    and target_item.order_kind = 'distribution';

  return new;
end;
$$;

create or replace function private.agent_order_item_view_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.order_item target_item
  where target_item.id = old.id
    and target_item.order_kind = 'distribution';

  return old;
end;
$$;

drop view if exists public.customer_order;
drop view if exists public.customer_order_item;

create view public.customer_order as
select
  id,
  customer_id,
  agent_id,
  source,
  order_status,
  payment_status,
  submitted_by,
  approved_by,
  approved_at,
  created_at,
  updated_at,
  admin_read_at,
  admin_read_by,
  notes,
  parent_order_id as agent_order_id,
  release_date,
  case
    when converted_at is not null then parent_order_id
    else null
  end as converted_to_agent_order_id,
  converted_at as converted_to_agent_order_at,
  converted_by as converted_to_agent_order_by,
  sale_date
from public."order"
where order_kind in ('customer', 'personal');

create trigger customer_order_view_insert
  instead of insert on public.customer_order
  for each row
  execute function private.customer_order_view_insert();

create trigger customer_order_view_update
  instead of update on public.customer_order
  for each row
  execute function private.customer_order_view_update();

create trigger customer_order_view_delete
  instead of delete on public.customer_order
  for each row
  execute function private.customer_order_view_delete();

create view public.customer_order_item as
select
  id,
  order_id,
  product_id,
  partial_quantity,
  final_quantity,
  created_at,
  updated_at,
  add_details,
  agent_commission_amount,
  agent_commission_set_by,
  agent_commission_set_at,
  unit_price,
  price_type,
  agent_commission_paid,
  agent_order_quantity_increase
from public.order_item
where order_kind in ('customer', 'personal');

create trigger customer_order_item_view_insert
  instead of insert on public.customer_order_item
  for each row
  execute function private.customer_order_item_view_insert();

create trigger customer_order_item_view_update
  instead of update on public.customer_order_item
  for each row
  execute function private.customer_order_item_view_update();

create trigger customer_order_item_view_delete
  instead of delete on public.customer_order_item
  for each row
  execute function private.customer_order_item_view_delete();

create view public.agent_order as
select
  id,
  agent_id,
  order_status,
  notes,
  submitted_by,
  admin_read_at,
  admin_read_by,
  created_at,
  updated_at,
  release_date,
  sale_date
from public."order"
where order_kind = 'distribution';

create trigger agent_order_view_insert
  instead of insert on public.agent_order
  for each row
  execute function private.agent_order_view_insert();

create trigger agent_order_view_update
  instead of update on public.agent_order
  for each row
  execute function private.agent_order_view_update();

create trigger agent_order_view_delete
  instead of delete on public.agent_order
  for each row
  execute function private.agent_order_view_delete();

create view public.agent_order_item as
select
  id,
  order_id as agent_order_id,
  product_id,
  partial_quantity as quantity,
  add_details,
  created_at,
  updated_at,
  agent_commission_amount,
  agent_commission_set_by as agent_commission_updated_by,
  agent_commission_set_at as agent_commission_updated_at
from public.order_item
where order_kind = 'distribution';

create trigger agent_order_item_view_insert
  instead of insert on public.agent_order_item
  for each row
  execute function private.agent_order_item_view_insert();

create trigger agent_order_item_view_update
  instead of update on public.agent_order_item
  for each row
  execute function private.agent_order_item_view_update();

create trigger agent_order_item_view_delete
  instead of delete on public.agent_order_item
  for each row
  execute function private.agent_order_item_view_delete();

grant select, insert, update, delete on public.agent_order to authenticated, service_role;
grant select, insert, update, delete on public.agent_order_item to authenticated, service_role;

revoke all on function private.sync_customer_order_sale_date() from public;
drop function if exists private.sync_customer_order_sale_date();
drop function if exists private.sync_agent_order_sale_date();

grant execute on function private.sync_order_sale_date() to service_role;
