#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LIST_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/list-diff-migration-files.sh"
EXPAND_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/validate-expand-migration-sql.sh"
METADATA_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/validate-migration-phase-metadata.sh"
SCAN_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/scan-changed-migrations-high-risk.sh"
FIXTURE_REPO="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_REPO"' EXIT

bootstrap_fixture_repo() {
  mkdir -p "${FIXTURE_REPO}/.github/scripts" "${FIXTURE_REPO}/supabase/migrations"
  cp "${REPOSITORY_ROOT}/.github/scripts/migration-diff-lib.sh" "${FIXTURE_REPO}/.github/scripts/"
  cp "${REPOSITORY_ROOT}/.github/scripts/migration-baseline-compaction.sh" "${FIXTURE_REPO}/.github/scripts/"
  cp "${LIST_SCRIPT}" "${EXPAND_SCRIPT}" "${METADATA_SCRIPT}" "${SCAN_SCRIPT}" "${FIXTURE_REPO}/.github/scripts/"

  git -C "$FIXTURE_REPO" init -q
  git -C "$FIXTURE_REPO" config user.email "test@example.com"
  git -C "$FIXTURE_REPO" config user.name "Test User"

  cat > "${FIXTURE_REPO}/supabase/migrations/20260701000000_old.sql" <<'EOF'
-- historical migration
select 1;
EOF

  git -C "$FIXTURE_REPO" add -A
  git -C "$FIXTURE_REPO" commit -q -m "base"
  git -C "$FIXTURE_REPO" branch -M main
}

write_compaction_baseline() {
  cat > "${FIXTURE_REPO}/supabase/migrations/20260802000000_baseline_schema.sql" <<'EOF'
-- migration-type: history-compaction-baseline
-- compaction-checkpoint: 20260802_checkpoint_prebaseline
drop table public.example;
EOF
  mkdir -p "${FIXTURE_REPO}/supabase/_archived_migrations/20260802_checkpoint_prebaseline"
  printf '%s\n' "-- archived" > "${FIXTURE_REPO}/supabase/_archived_migrations/20260802_checkpoint_prebaseline/20260701000000_old.sql"
}

bootstrap_fixture_repo
BASE_REF="$(git -C "$FIXTURE_REPO" rev-parse HEAD)"

rm "${FIXTURE_REPO}/supabase/migrations/20260701000000_old.sql"
cat > "${FIXTURE_REPO}/supabase/migrations/20260802000001_new_expand.sql" <<'EOF'
-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: runbook/expand-repai
alter table public.example add column if not exists note text;
EOF
git -C "$FIXTURE_REPO" add -A
git -C "$FIXTURE_REPO" commit -q -m "replace old with new"
REPLACE_REF="$(git -C "$FIXTURE_REPO" rev-parse HEAD)"

current_list="$(bash "${FIXTURE_REPO}/.github/scripts/list-diff-migration-files.sh" --diff-base "$BASE_REF" --mode current)"
if ! printf '%s\n' "$current_list" | grep -Fxq "supabase/migrations/20260802000001_new_expand.sql"; then
  echo "Expected only the added current migration to be selected." >&2
  printf '%s\n' "$current_list" >&2
  exit 1
fi
if printf '%s\n' "$current_list" | grep -Fq "20260701000000_old.sql"; then
  echo "Deleted migration must not be selected as a current scanable file." >&2
  exit 1
fi

audit_list="$(bash "${FIXTURE_REPO}/.github/scripts/list-diff-migration-files.sh" --diff-base "$BASE_REF" --mode all)"
if ! printf '%s\n' "$audit_list" | grep -Fxq "supabase/migrations/20260701000000_old.sql"; then
  echo "Deleted migration should remain visible in audit mode." >&2
  exit 1
fi

if ! bash "${FIXTURE_REPO}/.github/scripts/validate-expand-migration-sql.sh" --diff-base "$BASE_REF"; then
  echo "Expected expand validation to pass for added current migration only." >&2
  exit 1
fi

git -C "$FIXTURE_REPO" checkout -q "$BASE_REF"
rm -f "${FIXTURE_REPO}/supabase/migrations/20260701000000_old.sql"
git -C "$FIXTURE_REPO" add -A
git -C "$FIXTURE_REPO" commit -q -m "delete only"

delete_only_current="$(bash "${FIXTURE_REPO}/.github/scripts/list-diff-migration-files.sh" --diff-base "$BASE_REF" --mode current || true)"
if [ -n "$delete_only_current" ]; then
  echo "Deletion-only diff should produce no current scanable files." >&2
  printf '%s\n' "$delete_only_current" >&2
  exit 1
fi

if ! bash "${FIXTURE_REPO}/.github/scripts/validate-expand-migration-sql.sh" --diff-base "$BASE_REF"; then
  echo "Deletion-only diff should not fail expand validation." >&2
  exit 1
fi

git -C "$FIXTURE_REPO" checkout -q main
cat > "${FIXTURE_REPO}/supabase/migrations/20260802000002_new_plain.sql" <<'EOF'
-- brand new migration without metadata
drop table public.example;
EOF
git -C "$FIXTURE_REPO" add -A
git -C "$FIXTURE_REPO" commit -q -m "new plain destructive"

if bash "${FIXTURE_REPO}/.github/scripts/validate-migration-phase-metadata.sh" --diff-base "$BASE_REF" --require-phase-for-added 2>/dev/null; then
  echo "Expected newly added migration without metadata to fail." >&2
  exit 1
fi

if bash "${FIXTURE_REPO}/.github/scripts/scan-changed-migrations-high-risk.sh" --diff-base "$BASE_REF" --policy production-pr 2>/dev/null; then
  echo "Expected destructive new migration to require migration-reviewed in production PR policy." >&2
  exit 1
fi

git -C "$FIXTURE_REPO" checkout -q main
git -C "$FIXTURE_REPO" reset --hard HEAD~1
rm -f "${FIXTURE_REPO}/supabase/migrations/"*.sql
write_compaction_baseline
git -C "$FIXTURE_REPO" add -A
git -C "$FIXTURE_REPO" commit -q -m "compaction baseline"

if ! bash "${FIXTURE_REPO}/.github/scripts/validate-migration-phase-metadata.sh" --diff-base "$REPLACE_REF" --require-phase-for-added; then
  echo "Verified compaction baseline should satisfy added-metadata policy." >&2
  exit 1
fi

if bash "${FIXTURE_REPO}/.github/scripts/scan-changed-migrations-high-risk.sh" --diff-base "$REPLACE_REF" --policy production-pr 2>/dev/null; then
  echo "Compaction baseline should still require migration-reviewed for promotion." >&2
  exit 1
fi

if ! MIGRATION_REVIEWED=true bash "${FIXTURE_REPO}/.github/scripts/scan-changed-migrations-high-risk.sh" --diff-base "$REPLACE_REF" --policy production-pr; then
  echo "Compaction baseline should pass high-risk scan when migration-reviewed is set." >&2
  exit 1
fi

if bash "${LIST_SCRIPT}" --diff-base origin/main --mode current 2>/dev/null | grep -Fq "_archived_migrations/"; then
  echo "Active migration selector must never return archived migration paths." >&2
  exit 1
fi

echo "migration diff selection tests passed."
