-- migration-phase: expand
-- migration-safety: destructive-reviewed
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: supabase/migrations/20260804000001_dedupe_list_admin_customer_rows.sql

-- PostgREST cannot choose between overloaded list_admin_customer_rows signatures.
-- Keep the 6-parameter function with defaulted filter args.
-- Retained because production already applied this version before the drop was folded into 000000.

drop function if exists public.list_admin_customer_rows(text, text, integer, integer);
