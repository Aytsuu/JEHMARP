alter table public.agent
  add column if not exists promoted_from_customer_id uuid,
  add column if not exists promoted_from_customer_at timestamp with time zone;

comment on column public.agent.promoted_from_customer_id is
  'Original customer id used only as promotion audit metadata after the customer row is removed.';

comment on column public.agent.promoted_from_customer_at is
  'Timestamp when a customer row was promoted into this agent row.';

alter table public.customer_order
  alter column customer_id drop not null;

alter table public.customer_order
  drop constraint if exists customer_order_customer_id_fkey;

alter table public.customer_order
  add constraint customer_order_customer_id_fkey
  foreign key (customer_id)
  references public.customer(id)
  on delete set null;
