create table if not exists public.admin_notification_read (
  notification_id text primary key,
  admin_read_at timestamp with time zone not null default now(),
  admin_read_by uuid references auth.users (id) on delete set null
);

comment on table public.admin_notification_read is
  'Tracks read state for computed admin notifications such as unpaid-order regular checks.';

comment on column public.admin_notification_read.notification_id is
  'Stable notification identifier, for example unpaid-check-{customerId}-{thresholdKey}.';

create index if not exists admin_notification_read_admin_read_at_idx
  on public.admin_notification_read (admin_read_at desc);

alter table public.admin_notification_read enable row level security;

create policy "Admins can manage admin notification reads"
  on public.admin_notification_read
  for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

grant select, insert, update, delete on table public.admin_notification_read to authenticated;
grant select, insert, update, delete on table public.admin_notification_read to service_role;
