-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: platform_settings trade name default
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20260906000001_update_platform_settings_trade_name.sql

-- Set the default public website title when the legacy seed value is still present.

update public.platform_settings
set settings = jsonb_set(
  settings,
  '{businessProfile,tradeName}',
  to_jsonb('JEHMARP'::text),
  true
)
where id = 'default'
  and coalesce(settings #>> '{businessProfile,tradeName}', '') in ('', 'Meat and Poultry Products');
