alter table public.customer_order
  add column if not exists notes text;
