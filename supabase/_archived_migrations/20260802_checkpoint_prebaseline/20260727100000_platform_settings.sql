create table if not exists public.platform_settings (
  id text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint platform_settings_singleton check (id = 'default')
);

comment on table public.platform_settings is
  'Singleton JSON document for admin-managed platform configuration.';

insert into public.platform_settings (id, settings)
values (
  'default',
  jsonb_build_object(
    'businessProfile', jsonb_build_object(
      'tradeName', 'Meat and Poultry Products',
      'legalName', '',
      'address', 'Brgy. Tolo-Tolo Consolacion, Cebu',
      'phone', '09322159289 | 09177770118',
      'tin', '',
      'logoPath', null,
      'primaryEmail', 'jehmarp2020@gmail.com',
      'secondaryEmail', ''
    ),
    'documentPayment', jsonb_build_object(
      'instructions', '',
      'bankName', '',
      'accountName', '',
      'accountNumber', '',
      'gcashNumber', '',
      'mayaNumber', ''
    ),
    'defaults', jsonb_build_object(
      'customerCreditLimit', 1000
    ),
    'notifications', jsonb_build_object(
      'routes', jsonb_build_array(
        jsonb_build_object('event', 'new_order', 'primaryEmail', '', 'secondaryEmail', ''),
        jsonb_build_object('event', 'reseller_application', 'primaryEmail', '', 'secondaryEmail', ''),
        jsonb_build_object('event', 'contact_inquiry', 'primaryEmail', '', 'secondaryEmail', ''),
        jsonb_build_object('event', 'credit_alert', 'primaryEmail', '', 'secondaryEmail', '')
      )
    ),
    'documentNumbering', jsonb_build_object(
      'invoicePrefix', 'INV-',
      'invoiceNext', 1,
      'orderSlipPrefix', 'OS-',
      'orderSlipNext', 1
    )
  )
)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

create policy "Admins can read platform settings"
  on public.platform_settings
  for select
  to authenticated
  using ((select private.is_admin()));

create policy "Admins can update platform settings"
  on public.platform_settings
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

grant select, update on table public.platform_settings to authenticated;
grant select, insert, update, delete on table public.platform_settings to service_role;

alter table public.invoice
  alter column invoice_number drop default;

create or replace function public.assign_invoice_number_from_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text;
  sequence_value bigint;
begin
  select coalesce(settings #>> '{documentNumbering,invoicePrefix}', 'INV-')
  into prefix
  from public.platform_settings
  where id = 'default';

  sequence_value := nextval('public.invoice_number_seq');
  new.invoice_number := prefix || lpad(sequence_value::text, 8, '0');
  return new;
end;
$$;

drop trigger if exists invoice_assign_number_from_settings on public.invoice;

create trigger invoice_assign_number_from_settings
  before insert on public.invoice
  for each row
  execute function public.assign_invoice_number_from_settings();

create or replace function public.sync_invoice_sequence_from_settings(target_next bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_next < 1 then
    raise exception 'Invoice next number must be at least 1.';
  end if;

  perform setval('public.invoice_number_seq', target_next - 1, true);
end;
$$;

grant execute on function public.sync_invoice_sequence_from_settings(bigint) to authenticated;
grant execute on function public.sync_invoice_sequence_from_settings(bigint) to service_role;
