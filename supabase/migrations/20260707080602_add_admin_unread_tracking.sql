alter table public.customer_order
  add column if not exists admin_read_at timestamptz,
  add column if not exists admin_read_by uuid references auth.users(id) on delete set null;

alter table public.contact_inquiry
  add column if not exists admin_read_at timestamptz,
  add column if not exists admin_read_by uuid references auth.users(id) on delete set null;

alter table public.reseller_application
  add column if not exists admin_read_at timestamptz,
  add column if not exists admin_read_by uuid references auth.users(id) on delete set null;

update public.customer_order
set admin_read_at = coalesce(admin_read_at, updated_at, created_at)
where admin_read_at is null
  and (
    source = 'admin_manual'
    or order_status <> 'submitted'
  );

update public.contact_inquiry
set admin_read_at = coalesce(admin_read_at, updated_at, created_at)
where admin_read_at is null
  and inquiry_status <> 'new';

update public.reseller_application
set admin_read_at = coalesce(admin_read_at, updated_at, created_at)
where admin_read_at is null
  and application_status <> 'submitted';

create index if not exists customer_order_admin_unread_idx
  on public.customer_order (created_at desc)
  where admin_read_at is null
    and source <> 'admin_manual'
    and order_status = 'submitted';

create index if not exists contact_inquiry_admin_unread_idx
  on public.contact_inquiry (created_at desc)
  where admin_read_at is null
    and inquiry_status = 'new';

create index if not exists reseller_application_admin_unread_idx
  on public.reseller_application (created_at desc)
  where admin_read_at is null
    and application_status = 'submitted';

comment on column public.customer_order.admin_read_at is
  'Timestamp when an admin marked this externally submitted order as read.';

comment on column public.customer_order.admin_read_by is
  'Admin user who marked this externally submitted order as read.';

comment on column public.contact_inquiry.admin_read_at is
  'Timestamp when an admin marked this contact inquiry as read.';

comment on column public.contact_inquiry.admin_read_by is
  'Admin user who marked this contact inquiry as read.';

comment on column public.reseller_application.admin_read_at is
  'Timestamp when an admin marked this reseller application as read.';

comment on column public.reseller_application.admin_read_by is
  'Admin user who marked this reseller application as read.';
