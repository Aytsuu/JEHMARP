-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: platform_settings privacy notice defaults
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20260906000000_seed_platform_settings_privacy_notice.sql

-- Seed default privacy notice values into the platform_settings singleton.
-- Applies only when privacyNotice has not been configured yet, so admin edits are preserved.

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
where id = 'default'
  and (
    settings -> 'privacyNotice' is null
    or coalesce(settings #>> '{privacyNotice,controllerLegalName}', '') = ''
  );
