#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/validate-migration-phase-metadata.sh"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

# Repository root resolution: script is two levels up from .github/scripts/
resolved_root="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [ ! -d "${resolved_root}/supabase/migrations" ]; then
  echo "Expected migrations directory under resolved repository root: ${resolved_root}/supabase/migrations" >&2
  exit 1
fi

if [ ! -f "${resolved_root}/.github/scripts/validate-migration-phase-metadata.sh" ]; then
  echo "Expected validation script under resolved repository root: ${resolved_root}" >&2
  exit 1
fi

buggy_root="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
if [ -f "${buggy_root}/.github/scripts/validate-migration-phase-metadata.sh" ]; then
  echo "Buggy three-level repository root must not resolve inside the repository: ${buggy_root}" >&2
  exit 1
fi

if [ "${resolved_root}" != "${REPOSITORY_ROOT}" ]; then
  echo "Test harness repository root mismatch: ${resolved_root} != ${REPOSITORY_ROOT}" >&2
  exit 1
fi

real_migration="$(find "${resolved_root}/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -print -quit)"
if [ -z "${real_migration}" ]; then
  echo "Expected at least one migration file under ${resolved_root}/supabase/migrations" >&2
  exit 1
fi

if ! bash "$SCRIPT_PATH" --expand-only --files "${real_migration}"; then
  echo "Expected real migration file to be found via repository root resolution: ${real_migration}" >&2
  exit 1
fi

write_fixture() {
  local name="$1"
  local content="$2"
  printf '%s' "$content" > "${FIXTURE_DIR}/${name}"
}

write_fixture "expand-complete.sql" \
  "-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/expand-repai
select 1;
"

write_fixture "contract-complete.sql" \
  "-- migration-phase: contract
-- owner: platform
-- lock-impact: high
-- backfill: completed
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/contract-repai
-- compatibility-window-complete: 2026-08-01
-- legacy-usage-confirmed-zero: dashboard/zero-legacy
-- backup-verified: backup/run-123
select 1;
"

write_fixture "contract-blocked.sql" \
  "-- migration-phase: contract
select 1;
"

write_fixture "legacy-no-phase.sql" \
  "-- historical migration without phase metadata
select 1;
"

write_fixture "expand-missing-metadata.sql" \
  "-- migration-phase: expand
select 1;
"

if ! bash "$SCRIPT_PATH" --expand-only --files "${FIXTURE_DIR}/legacy-no-phase.sql"; then
  echo "Expected legacy migration without phase metadata to pass expand-only gating." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --expand-only --files "${FIXTURE_DIR}/contract-blocked.sql" 2>/dev/null; then
  echo "Expected contract migration to be blocked in expand-only mode." >&2
  exit 1
fi

if ! MIGRATION_PHASE_ALLOW_CONTRACT=true bash "$SCRIPT_PATH" --expand-only --files "${FIXTURE_DIR}/contract-blocked.sql"; then
  echo "Expected contract migration to be allowed when MIGRATION_PHASE_ALLOW_CONTRACT=true." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --strict --files "${FIXTURE_DIR}/expand-missing-metadata.sql" 2>/dev/null; then
  echo "Expected strict mode to fail on missing expand metadata." >&2
  exit 1
fi

if ! bash "$SCRIPT_PATH" --strict --files "${FIXTURE_DIR}/expand-complete.sql"; then
  echo "Expected complete expand metadata to pass strict mode." >&2
  exit 1
fi

if ! bash "$SCRIPT_PATH" --strict --files "${FIXTURE_DIR}/contract-complete.sql"; then
  echo "Expected complete contract metadata to pass strict mode." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --require-phase-if-present --files "${FIXTURE_DIR}/legacy-no-phase.sql" "${FIXTURE_DIR}/expand-missing-metadata.sql" 2>/dev/null; then
  echo "Expected require-phase-if-present to fail on incomplete expand metadata." >&2
  exit 1
fi

if ! bash "$SCRIPT_PATH" --require-phase-if-present --files "${FIXTURE_DIR}/legacy-no-phase.sql" "${FIXTURE_DIR}/expand-complete.sql"; then
  echo "Expected require-phase-if-present to warn on legacy and pass complete expand metadata." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --require-phase-if-present --files "${FIXTURE_DIR}/contract-blocked.sql" 2>/dev/null; then
  echo "Expected incomplete contract metadata to fail without migration-reviewed." >&2
  exit 1
fi

if ! MIGRATION_REVIEWED=true bash "$SCRIPT_PATH" --require-phase-if-present --files "${FIXTURE_DIR}/contract-blocked.sql"; then
  echo "Expected incomplete contract metadata to pass when migration-reviewed is set." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --strict --files "${FIXTURE_DIR}/contract-blocked.sql" 2>/dev/null; then
  echo "Expected incomplete contract metadata to fail in strict mode without migration-reviewed." >&2
  exit 1
fi

if ! MIGRATION_REVIEWED=true bash "$SCRIPT_PATH" --strict --files "${FIXTURE_DIR}/contract-blocked.sql"; then
  echo "Expected incomplete contract metadata to pass strict mode when migration-reviewed is set." >&2
  exit 1
fi

write_fixture "new-expand-no-phase.sql" \
  "-- brand new migration without metadata
select 1;
"

write_fixture "new-expand-complete.sql" \
  "-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/expand-repai
alter table public.example add column if not exists note text;
"

if bash "$SCRIPT_PATH" --require-phase-for-added --added-files "${FIXTURE_DIR}/new-expand-no-phase.sql" --files "${FIXTURE_DIR}/new-expand-no-phase.sql" 2>/dev/null; then
  echo "Expected require-phase-for-added to fail on new file without migration-phase." >&2
  exit 1
fi

if ! bash "$SCRIPT_PATH" --require-phase-for-added --added-files "${FIXTURE_DIR}/new-expand-complete.sql" --files "${FIXTURE_DIR}/new-expand-complete.sql"; then
  echo "Expected require-phase-for-added to pass on complete new expand metadata." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --require-phase-for-added --added-files "${FIXTURE_DIR}/new-expand-no-phase.sql" --require-phase-if-present --files "${FIXTURE_DIR}/legacy-no-phase.sql" "${FIXTURE_DIR}/new-expand-no-phase.sql" 2>/dev/null; then
  echo "Expected modified legacy warn + added missing phase to fail overall." >&2
  exit 1
fi

# shellcheck source=../migration-baseline-compaction.sh
source "${REPOSITORY_ROOT}/.github/scripts/migration-baseline-compaction.sh"

if migration_baseline_compaction_checkout_shape_ok "$REPOSITORY_ROOT"; then
  real_baseline="$(find "${resolved_root}/supabase/migrations" -maxdepth 1 -type f -name '20260802000000_*.sql' -print -quit)"
  if [ -n "${real_baseline}" ]; then
    if ! bash "$SCRIPT_PATH" --require-phase-for-added --added-files "${real_baseline}" --files "${real_baseline}"; then
      echo "Real verified compaction baseline should pass require-phase-for-added." >&2
      exit 1
    fi
  fi
fi

if ! bash "$SCRIPT_PATH" --require-phase-for-added --added-files "${FIXTURE_DIR}/new-expand-complete.sql" --require-phase-if-present --files "${FIXTURE_DIR}/legacy-no-phase.sql" "${FIXTURE_DIR}/new-expand-complete.sql"; then
  echo "Expected modified legacy warn + complete added file to pass." >&2
  exit 1
fi

echo "validate-migration-phase-metadata tests passed."
