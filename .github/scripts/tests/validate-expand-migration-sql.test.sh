#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/validate-expand-migration-sql.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

write_fixture() {
  local name="$1"
  local content="$2"
  printf '%s' "$content" > "${FIXTURE_DIR}/${name}"
}

write_fixture "expand-add-column.sql" \
  "-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/expand-repai
alter table public.example add column if not exists note text;
"

write_fixture "expand-drop-column.sql" \
  "-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/expand-repai
alter table public.example drop column legacy_note;
"

write_fixture "contract-drop-view.sql" \
  "-- migration-phase: contract
-- owner: platform
-- lock-impact: high
-- backfill: completed
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/contract-repai
-- compatibility-window-complete: 2026-08-01
-- legacy-usage-confirmed-zero: dashboard/zero-legacy
-- backup-verified: backup/run-123
drop view if exists public.legacy_view;
"

write_fixture "legacy-destructive.sql" \
  "-- historical migration without phase metadata
drop table public.legacy_table;
"

write_fixture "expand-set-not-null.sql" \
  "-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/expand-repai
alter table public.example alter column note set not null;
"

write_fixture "expand-set-not-null-noted.sql" \
  "-- migration-phase: expand
-- expand-path: nullable column added in prior migration; backfill completed
-- owner: platform
-- lock-impact: low
-- backfill: completed
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/expand-repai
alter table public.example alter column note set not null;
"

if ! bash "$SCRIPT_PATH" --files "${FIXTURE_DIR}/expand-add-column.sql"; then
  echo "Expected expand add column migration to pass." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --files "${FIXTURE_DIR}/expand-drop-column.sql" 2>/dev/null; then
  echo "Expected expand drop column migration to fail." >&2
  exit 1
fi

if ! bash "$SCRIPT_PATH" --files "${FIXTURE_DIR}/contract-drop-view.sql"; then
  echo "Expected contract drop view migration to be skipped (allowed)." >&2
  exit 1
fi

if ! bash "$SCRIPT_PATH" --files "${FIXTURE_DIR}/legacy-destructive.sql"; then
  echo "Expected legacy migration without phase to be skipped." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --files "${FIXTURE_DIR}/expand-set-not-null.sql" 2>/dev/null; then
  echo "Expected expand set not null without expand-path note to fail." >&2
  exit 1
fi

if ! bash "$SCRIPT_PATH" --files "${FIXTURE_DIR}/expand-set-not-null-noted.sql"; then
  echo "Expected expand set not null with expand-path note to pass (warn only)." >&2
  exit 1
fi

echo "validate-expand-migration-sql tests passed."
