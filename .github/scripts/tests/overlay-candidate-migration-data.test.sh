#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/overlay-candidate-migration-data.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

trusted_dir="${FIXTURE_DIR}/trusted"
candidate_dir="${FIXTURE_DIR}/candidate"
checkpoint="supabase/_archived_migrations/20260802_checkpoint_prebaseline"

mkdir -p "${trusted_dir}/.github/scripts" "${trusted_dir}/.github/config"
mkdir -p "${candidate_dir}/supabase/migrations" "${candidate_dir}/${checkpoint}"

cp "${REPOSITORY_ROOT}/.github/scripts/load-baseline-compaction-manifest.sh" \
  "${trusted_dir}/.github/scripts/"
cp "${REPOSITORY_ROOT}/.github/config/baseline-compaction-20260802.manifest" \
  "${trusted_dir}/.github/config/"
cp "${REPOSITORY_ROOT}/.github/config/baseline-compaction-20260802.archived-versions.txt" \
  "${trusted_dir}/.github/config/"

printf '%s\n' '-- migration-type: history-compaction-baseline' \
  > "${candidate_dir}/supabase/migrations/20260802000000_baseline_schema.sql"
cp "${REPOSITORY_ROOT}/supabase/_archived_migrations/20260802_checkpoint_prebaseline/"*.sql \
  "${candidate_dir}/${checkpoint}/"

bash "$SCRIPT_PATH" \
  --trusted "$trusted_dir" \
  --candidate "$candidate_dir" \
  --validate-manifest

if [ ! -f "${trusted_dir}/supabase/migrations/20260802000000_baseline_schema.sql" ]; then
  echo "Overlay did not copy active migrations." >&2
  exit 1
fi

archived_count="$(find "${trusted_dir}/${checkpoint}" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
if [ "$archived_count" -lt 1 ]; then
  echo "Overlay did not copy archived checkpoint files." >&2
  exit 1
fi

if [ -f "${trusted_dir}/.github/scripts/evil-candidate.sh" ]; then
  echo "Overlay must not copy candidate scripts." >&2
  exit 1
fi

echo "overlay-candidate-migration-data tests passed."
