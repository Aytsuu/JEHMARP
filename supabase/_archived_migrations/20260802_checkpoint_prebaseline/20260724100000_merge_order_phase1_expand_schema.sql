-- Phase 1: Expand schema (rename customer_order family, add order_kind, compat views)

alter table public.customer_order rename to "order";
alter table public.customer_order_item rename to order_item;
alter table public.customer_order_status_history rename to order_status_history;

alter table public."order"
  add column if not exists order_kind text not null default 'customer',
  add column if not exists parent_order_id uuid,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid;

alter table public."order"
  drop constraint if exists customer_order_converted_to_agent_order_by_fkey;

alter table public."order"
  add constraint order_converted_by_fkey
  foreign key (converted_by)
  references auth.users(id)
  on delete set null;

alter table public."order"
  alter column customer_id drop not null;

update public."order"
set
  converted_at = converted_to_agent_order_at,
  converted_by = converted_to_agent_order_by
where converted_to_agent_order_id is not null
  and converted_at is null;

update public."order" customer_order_row
set order_kind = 'personal'
from public.agent agent_row
where customer_order_row.agent_id = agent_row.id
  and customer_order_row.customer_id = agent_row.customer_id
  and customer_order_row.source = 'agent_submitted';

alter table public."order"
  drop constraint if exists customer_order_order_status_check;

alter table public."order"
  add constraint order_status_by_kind_check
  check (
    (
      order_kind = 'distribution'
      and order_status = any (array['pending_customers'::text, 'pending_order'::text, 'processing'::text, 'closed'::text])
    )
    or (
      order_kind in ('customer', 'personal')
      and order_status = any (array['pending'::text, 'processing'::text, 'closed'::text])
    )
  );

alter table public."order"
  add constraint order_kind_check
  check (order_kind = any (array['customer'::text, 'personal'::text, 'distribution'::text]));

alter table public.order_item
  add column if not exists order_kind text;

update public.order_item order_item_row
set order_kind = parent_order.order_kind
from public."order" parent_order
where order_item_row.order_id = parent_order.id
  and order_item_row.order_kind is null;

alter table public.order_item
  alter column order_kind set not null;

alter table public.order_item
  add constraint order_item_order_kind_check
  check (order_kind = any (array['customer'::text, 'personal'::text, 'distribution'::text]));

alter table public.order_item
  alter column unit_price drop not null,
  alter column price_type drop not null;

alter table public.order_item
  drop constraint if exists customer_order_item_price_type_check;

alter table public.order_item
  add constraint order_item_price_type_check
  check (price_type is null or price_type = any (array['retail'::text, 'reseller'::text]));

alter table public.order_item
  drop constraint if exists customer_order_item_unit_price_check;

alter table public.order_item
  add constraint order_item_unit_price_check
  check (unit_price is null or unit_price >= 0::numeric);

alter table public.order_item
  add constraint order_item_pricing_by_kind_check
  check (
    (
      order_kind = 'distribution'
      and unit_price is null
      and price_type is null
    )
    or (
      order_kind in ('customer', 'personal')
      and unit_price is not null
      and price_type is not null
    )
  );

create or replace view public.customer_order as
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
  agent_order_id,
  release_date,
  converted_to_agent_order_id,
  converted_to_agent_order_at,
  converted_to_agent_order_by,
  sale_date
from public."order";

create or replace view public.customer_order_item as
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
from public.order_item;

create or replace view public.customer_order_status_history as
select
  id,
  order_id,
  from_status,
  to_status,
  changed_by,
  changed_at,
  notes
from public.order_status_history;

grant select, insert, update, delete on public.customer_order to authenticated, service_role;
grant select, insert, update, delete on public.customer_order_item to authenticated, service_role;
grant select, insert, update, delete on public.customer_order_status_history to authenticated, service_role;

comment on table public."order" is 'Unified order table (customer, personal, and distribution orders).';
comment on column public."order".order_kind is 'customer | personal | distribution';
comment on column public."order".parent_order_id is 'Self-FK to parent distribution order for child customer orders.';
