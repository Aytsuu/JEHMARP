alter table public.reseller_application
  add column if not exists source_ip inet,
  add column if not exists user_agent text;

create index if not exists reseller_application_email_created_at_idx
  on public.reseller_application (lower(email), created_at desc);

create index if not exists reseller_application_source_ip_created_at_idx
  on public.reseller_application (source_ip, created_at desc)
  where source_ip is not null;

comment on column public.reseller_application.source_ip is
  'Request IP captured by the trusted reseller application workflow for abuse controls.';

comment on column public.reseller_application.user_agent is
  'Request user agent captured by the trusted reseller application workflow for abuse review.';
