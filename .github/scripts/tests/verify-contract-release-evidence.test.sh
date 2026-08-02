#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/verify-contract-release-evidence.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

write_fixture() {
  local name="$1"
  local content="$2"
  printf '%s' "$content" > "${FIXTURE_DIR}/${name}"
}

write_fixture "contract-ready.sql" \
  "-- migration-phase: contract
-- owner: platform
-- lock-impact: high
-- backfill: completed
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/contract-repai
-- compatibility-window-complete: 2026-07-01
-- legacy-usage-confirmed-zero: dashboard/zero-legacy
-- backup-verified: github-actions-run-999001
select 1;
"

write_fixture "contract-future-window.sql" \
  "-- migration-phase: contract
-- owner: platform
-- lock-impact: high
-- backfill: completed
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/contract-repai
-- compatibility-window-complete: 2099-01-01
-- legacy-usage-confirmed-zero: dashboard/zero-legacy
-- backup-verified: github-actions-run-999001
select 1;
"

write_fixture "expand-pending.sql" \
  "-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/expand-repai
select 1;
"

mkdir -p "${FIXTURE_DIR}/backup-artifact"
printf '%s' '-- backup schema' > "${FIXTURE_DIR}/backup-artifact/production-schema.sql"

mkdir -p "${FIXTURE_DIR}/evidence-pack"
write_fixture "evidence-pack/backup-run-id.txt" "999001"
write_fixture "evidence-pack/legacy-usage-confirmed-zero.txt" "dashboard/zero-legacy"

common_args=(
  --backup-run-id 999001
  --backup-artifact-dir "${FIXTURE_DIR}/backup-artifact"
  --today 2026-08-01
)

if ! bash "$SCRIPT_PATH" "${common_args[@]}" --files "${FIXTURE_DIR}/contract-ready.sql"; then
  echo "Expected complete contract migration to pass evidence validation." >&2
  exit 1
fi

if ! bash "$SCRIPT_PATH" "${common_args[@]}" \
  --evidence-dir "${FIXTURE_DIR}/evidence-pack" \
  --files "${FIXTURE_DIR}/contract-ready.sql"; then
  echo "Expected evidence pack with matching backup run id to pass." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" "${common_args[@]}" --files "${FIXTURE_DIR}/contract-future-window.sql" 2>/dev/null; then
  echo "Expected future compatibility window to fail." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" "${common_args[@]}" --files "${FIXTURE_DIR}/expand-pending.sql" 2>/dev/null; then
  echo "Expected expand pending migration to be refused." >&2
  exit 1
fi

write_fixture "contract-bad-backup-ref.sql" \
  "-- migration-phase: contract
-- owner: platform
-- lock-impact: high
-- backfill: completed
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/contract-repai
-- compatibility-window-complete: 2026-07-01
-- legacy-usage-confirmed-zero: dashboard/zero-legacy
-- backup-verified: backup/other-run
select 1;
"

if bash "$SCRIPT_PATH" "${common_args[@]}" --files "${FIXTURE_DIR}/contract-bad-backup-ref.sql" 2>/dev/null; then
  echo "Expected backup-verified reference without run id to fail." >&2
  exit 1
fi

empty_backup_dir="$(mktemp -d)"
if bash "$SCRIPT_PATH" --backup-run-id 999001 --backup-artifact-dir "$empty_backup_dir" --today 2026-08-01 \
  --files "${FIXTURE_DIR}/contract-ready.sql" 2>/dev/null; then
  echo "Expected empty backup artifact directory to fail." >&2
  exit 1
fi
rm -rf "$empty_backup_dir"

echo "verify-contract-release-evidence tests passed."
