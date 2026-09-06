-- Local platform settings privacy notice seed.
-- Applied by `supabase db reset` after migrations; mirrors public contact defaults from seed_landing_pages.sql.

update public.platform_settings
set settings = jsonb_set(
  settings,
  '{businessProfile,tradeName}',
  to_jsonb('JEHMARP'::text),
  true
)
where id = 'default';

update public.platform_settings
set settings = jsonb_set(
  settings,
  '{privacyNotice}',
  jsonb_build_object(
    'controllerLegalName', 'JEHMARP Meat and Poultry Products',
    'philippineBusinessAddress', 'Brgy. Tolo-Tolo Consolacion, Cebu, Philippines',
    'privacyContactEmail', 'jehmarp2020@gmail.com',
    'noticeVersion', '1.0',
    'effectiveDate', '2026-09-06',
    'retentionInquiries', '24 months after the inquiry is closed or resolved.',
    'retentionResellerApplications', '36 months after the application decision, unless a longer period is required by law.',
    'retentionOrders', '7 years from order completion for accounting, tax, and dispute records.',
    'retentionAccounts', 'While the account is active and for 24 months after closure, unless law requires longer retention.',
    'retentionSecurityLogs', '12 months for operational monitoring and incident investigation.',
    'retentionBackups', '30 days in rolling backup systems, subject to earlier overwrite.'
  ),
  true
)
where id = 'default';
