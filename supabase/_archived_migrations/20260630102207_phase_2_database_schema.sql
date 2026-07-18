create extension if not exists pgcrypto with schema extensions;
create sequence if not exists public.invoice_number_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;
create table public.profile (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.admin_role (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_role_user_id_key unique (user_id),
  constraint admin_role_role_check check (role in ('admin', 'owner')),
  constraint admin_role_status_check check (status in ('active', 'inactive'))
);
create table public.agent_profile (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_profile_user_id_key unique (user_id),
  constraint agent_profile_status_check check (status in ('active', 'inactive', 'suspended'))
);
create table public.customer (
  id uuid primary key default extensions.gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone_number text not null,
  email text,
  address text not null,
  assigned_agent_id uuid references public.agent_profile(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.product (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  unit_label text not null,
  default_price numeric(12, 2) not null,
  reseller_price numeric(12, 2) not null,
  stock_status text not null default 'in_stock',
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_category_check check (category in ('pork', 'chicken', 'egg')),
  constraint product_default_price_check check (default_price >= 0),
  constraint product_reseller_price_check check (reseller_price >= 0),
  constraint product_stock_status_check check (stock_status in ('in_stock', 'limited', 'out_of_stock'))
);
create table public.customer_order (
  id uuid primary key default extensions.gen_random_uuid(),
  customer_id uuid not null references public.customer(id) on delete restrict,
  agent_id uuid references public.agent_profile(id) on delete set null,
  source text not null,
  order_status text not null default 'submitted',
  payment_status text not null default 'unpaid',
  discount_amount numeric(12, 2) not null default 0,
  delivery_fee numeric(12, 2) not null default 0,
  submitted_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_order_source_check check (source in ('guest_shop', 'agent_submitted', 'admin_manual')),
  constraint customer_order_order_status_check check (
    order_status in ('draft', 'submitted', 'approved', 'processing', 'fulfilled', 'rejected', 'cancelled', 'closed')
  ),
  constraint customer_order_payment_status_check check (payment_status in ('unpaid', 'partial', 'paid', 'refunded', 'void')),
  constraint customer_order_discount_amount_check check (discount_amount >= 0),
  constraint customer_order_delivery_fee_check check (delivery_fee >= 0),
  constraint customer_order_approval_check check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  )
);
create table public.customer_order_item (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.customer_order(id) on delete cascade,
  product_id uuid not null references public.product(id) on delete restrict,
  partial_quantity numeric(12, 3) not null,
  final_quantity numeric(12, 3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  add_details text,
  agent_commission_amount numeric(12, 2) not null default 0,
  agent_commission_status text not null default 'unset',
  agent_commission_set_by uuid references auth.users(id) on delete set null,
  agent_commission_set_at timestamptz,
  agent_commission_notes text,
  constraint customer_order_item_partial_quantity_check check (partial_quantity > 0),
  constraint customer_order_item_final_quantity_check check (final_quantity > 0),
  constraint customer_order_item_commission_amount_check check (agent_commission_amount >= 0),
  constraint customer_order_item_commission_status_check check (agent_commission_status in ('unset', 'set', 'cancelled', 'paid')),
  constraint customer_order_item_commission_set_check check (
    (agent_commission_status = 'unset' and agent_commission_set_by is null and agent_commission_set_at is null)
    or agent_commission_status <> 'unset'
  )
);
create table public.payment (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.customer_order(id) on delete restrict,
  amount numeric(12, 2) not null,
  payment_method text not null,
  payment_date date not null default current_date,
  recorded_by uuid references auth.users(id) on delete set null,
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  constraint payment_amount_check check (amount > 0)
);
create table public.invoice (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.customer_order(id) on delete restrict,
  invoice_number text not null default (
    'INV-' || lpad(nextval('public.invoice_number_seq')::text, 8, '0')
  ),
  status text not null default 'draft',
  issued_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_order_id_key unique (order_id),
  constraint invoice_invoice_number_key unique (invoice_number),
  constraint invoice_status_check check (status in ('draft', 'issued', 'partially_paid', 'paid', 'void', 'overdue'))
);
create table public.customer_order_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.customer_order(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  notes text,
  constraint customer_order_status_history_from_status_check check (
    from_status is null
    or from_status in ('draft', 'submitted', 'approved', 'processing', 'fulfilled', 'rejected', 'cancelled', 'closed')
  ),
  constraint customer_order_status_history_to_status_check check (
    to_status in ('draft', 'submitted', 'approved', 'processing', 'fulfilled', 'rejected', 'cancelled', 'closed')
  )
);
create table public.customer_order_update (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.customer_order(id) on delete cascade,
  update_type text not null,
  title text not null,
  details text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.contact_inquiry (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  email text,
  phone_number text,
  message text not null,
  inquiry_status text not null default 'new',
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_inquiry_status_check check (inquiry_status in ('new', 'reviewing', 'responded', 'closed', 'spam'))
);
create table public.reseller_application (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  email text not null,
  address text not null,
  planned_transaction_type text not null,
  expected_quantity_per_week text not null,
  contact_number text not null,
  message text,
  application_status text not null default 'submitted',
  email_delivery_status text not null default 'pending',
  price_list_sent_at timestamptz,
  email_error text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reseller_application_status_check check (
    application_status in ('submitted', 'contacted', 'closed')
  ),
  constraint reseller_application_email_delivery_status_check check (email_delivery_status in ('pending', 'sent', 'failed'))
);
create table public.page (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null,
  title text not null,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint page_slug_key unique (slug),
  constraint page_status_check check (status in ('draft', 'published', 'archived'))
);
create table public.page_section (
  id uuid primary key default extensions.gen_random_uuid(),
  page_id uuid not null references public.page(id) on delete cascade,
  type text not null,
  sort_order integer not null,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint page_section_page_id_sort_order_key unique (page_id, sort_order),
  constraint page_section_sort_order_check check (sort_order >= 0),
  constraint page_section_content_object_check check (jsonb_typeof(content) = 'object'),
  constraint page_section_status_check check (status in ('draft', 'published', 'archived'))
);
create table public.media_asset (
  id uuid primary key default extensions.gen_random_uuid(),
  path text not null,
  alt_text text,
  media_type text not null,
  bucket text not null default 'public',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_asset_path_key unique (path)
);
create table public.analytics_daily (
  day date primary key,
  order_count integer not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  outstanding_balance numeric(12, 2) not null default 0,
  new_reseller_applications integer not null default 0,
  new_contact_inquiries integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_daily_order_count_check check (order_count >= 0),
  constraint analytics_daily_paid_amount_check check (paid_amount >= 0),
  constraint analytics_daily_outstanding_balance_check check (outstanding_balance >= 0),
  constraint analytics_daily_reseller_count_check check (new_reseller_applications >= 0),
  constraint analytics_daily_inquiry_count_check check (new_contact_inquiries >= 0)
);
create table public.analytics_product_daily (
  day date not null,
  product_id uuid not null references public.product(id) on delete cascade,
  quantity_sold numeric(12, 3) not null default 0,
  gross_sales numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, product_id),
  constraint analytics_product_daily_quantity_sold_check check (quantity_sold >= 0),
  constraint analytics_product_daily_gross_sales_check check (gross_sales >= 0)
);
create table public.analytics_agent_daily (
  day date not null,
  agent_id uuid not null references public.agent_profile(id) on delete cascade,
  order_count integer not null default 0,
  expected_commission numeric(12, 2) not null default 0,
  earned_commission numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, agent_id),
  constraint analytics_agent_daily_order_count_check check (order_count >= 0),
  constraint analytics_agent_daily_expected_commission_check check (expected_commission >= 0),
  constraint analytics_agent_daily_earned_commission_check check (earned_commission >= 0)
);
create index customer_assigned_agent_id_idx on public.customer (assigned_agent_id);
create index customer_created_by_idx on public.customer (created_by);
create index product_category_idx on public.product (category);
create index product_stock_status_idx on public.product (stock_status);
create index product_is_active_idx on public.product (is_active);
create index customer_order_customer_id_idx on public.customer_order (customer_id);
create index customer_order_agent_id_idx on public.customer_order (agent_id);
create index customer_order_source_idx on public.customer_order (source);
create index customer_order_order_status_idx on public.customer_order (order_status);
create index customer_order_payment_status_idx on public.customer_order (payment_status);
create index customer_order_created_at_idx on public.customer_order (created_at desc);
create index customer_order_item_order_id_idx on public.customer_order_item (order_id);
create index customer_order_item_product_id_idx on public.customer_order_item (product_id);
create index customer_order_item_commission_status_idx on public.customer_order_item (agent_commission_status);
create index payment_order_id_idx on public.payment (order_id);
create index payment_payment_date_idx on public.payment (payment_date desc);
create index invoice_status_idx on public.invoice (status);
create index customer_order_status_history_order_id_idx on public.customer_order_status_history (order_id);
create index customer_order_status_history_changed_at_idx on public.customer_order_status_history (changed_at desc);
create index customer_order_update_order_id_idx on public.customer_order_update (order_id);
create index contact_inquiry_status_idx on public.contact_inquiry (inquiry_status);
create index contact_inquiry_created_at_idx on public.contact_inquiry (created_at desc);
create index reseller_application_status_idx on public.reseller_application (application_status);
create index reseller_application_email_delivery_status_idx on public.reseller_application (email_delivery_status);
create index reseller_application_created_at_idx on public.reseller_application (created_at desc);
create index page_status_idx on public.page (status);
create index page_section_page_id_status_idx on public.page_section (page_id, status);
create index page_section_page_id_sort_order_idx on public.page_section (page_id, sort_order);
create index media_asset_bucket_idx on public.media_asset (bucket);
create index analytics_product_daily_product_id_idx on public.analytics_product_daily (product_id);
create index analytics_agent_daily_agent_id_idx on public.analytics_agent_daily (agent_id);
comment on column public.product.category is
  'Allowed v1 product category values: pork, chicken, egg.';
comment on column public.customer_order_item.partial_quantity is
  'Order slip quantity. Used for order reference totals.';
comment on column public.customer_order_item.final_quantity is
  'Sales invoice quantity. Used for final invoice totals, payment balance, and proportional commission calculations.';
insert into public.page (slug, title, status, published_at)
values
  ('home', 'Home', 'published', now()),
  ('our-story', 'Our Story', 'published', now()),
  ('shop', 'Shop', 'published', now()),
  ('business', 'Business', 'published', now()),
  ('contact', 'Contact', 'published', now())
on conflict (slug) do update set
  title = excluded.title,
  status = excluded.status,
  published_at = coalesce(public.page.published_at, excluded.published_at),
  updated_at = now();
