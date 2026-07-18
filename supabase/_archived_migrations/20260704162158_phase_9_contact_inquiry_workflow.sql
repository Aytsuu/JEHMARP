alter table public.contact_inquiry
  add column if not exists source_ip inet,
  add column if not exists user_agent text;

create index if not exists contact_inquiry_email_created_at_idx
  on public.contact_inquiry (lower(email), created_at desc)
  where email is not null;

create index if not exists contact_inquiry_source_ip_created_at_idx
  on public.contact_inquiry (source_ip, created_at desc)
  where source_ip is not null;

revoke insert (name, email, phone_number, message)
  on public.contact_inquiry from anon, authenticated;

drop policy if exists "Guests can create contact inquiries"
  on public.contact_inquiry;

comment on column public.contact_inquiry.source_ip is
  'Request IP captured by the trusted contact inquiry workflow for abuse controls.';

comment on column public.contact_inquiry.user_agent is
  'Request user agent captured by the trusted contact inquiry workflow for abuse review.';
