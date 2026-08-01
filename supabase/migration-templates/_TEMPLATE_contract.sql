-- Contract migration template (not applied by Supabase — copy when creating a new migration)
-- migration-phase: contract
-- owner: platform
-- lock-impact: high
-- backfill: completed
-- compatible-with: worker >= YYYY.MM.0
-- forward-repair: runbook/contract-repair-or-migration-reference
-- compatibility-window-complete: YYYY-MM-DD
-- legacy-usage-confirmed-zero: dashboard/query/runbook-reference
-- backup-verified: backup-run-or-artifact-reference

-- Contract migrations remove legacy schema after the compatibility window.
-- Require the migration-reviewed label on the PR and production environment approval.
-- Destructive SQL (drops, renames, truncate, policy replacement) is expected here.

-- drop view if exists ...
-- alter table ... drop column ...
