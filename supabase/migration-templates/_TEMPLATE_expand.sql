-- Expand migration template (not applied by Supabase — copy when creating a new migration)
-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= YYYY.MM.0
-- forward-repair: runbook/expand-repair-or-migration-reference

-- Additive-only SQL examples:
-- create table ...
-- alter table ... add column ... (nullable or with safe default)
-- create index ...
-- create or replace function ... (backward-compatible signature)
-- create or replace view ... (compatibility shim)
-- create policy ...

-- Forbidden in expand phase (use a Contract migration instead):
-- drop table/column/view/function/policy, rename, truncate, delete from, cascade,
-- alter ... drop, set not null without prior nullable expand + backfill path note.
