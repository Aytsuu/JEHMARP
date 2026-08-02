#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VERIFY_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/verify-staging-evidence.sh"

test_root="$(mktemp -d)"
cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

repository_copy="${test_root}/repository"
mkdir -p "${repository_copy}/supabase/migrations"
cp "$VERIFY_SCRIPT" "${repository_copy}/verify-staging-evidence.sh"
touch "${repository_copy}/supabase/migrations/20260712180918_initial.sql"
touch "${repository_copy}/supabase/migrations/20260712180919_followup.sql"

evidence_dir="${repository_copy}/staging-evidence"
mkdir -p "$evidence_dir"
printf '%s\n' 'candidate-sha' > "${evidence_dir}/commit-sha.txt"
printf '%s\n' 'smoke_ok' > "${evidence_dir}/smoke-result.txt"
cat > "${evidence_dir}/migration-list.txt" <<'EOF'
   Local            | Remote           | Time (UTC)
  ------------------|------------------|-----------------------
   `20260712180918` | `20260712180918` | `2026-07-12 18:09:18`
   `20260712180919` | `20260712180919` | `2026-07-12 18:09:19`
EOF

(
  cd "$repository_copy"
  bash ./verify-staging-evidence.sh staging-evidence candidate-sha
)

printf '%s\n' \
  '   Local            | Remote           | Time (UTC)' \
  '  ------------------|------------------|-----------------------' \
  '   `20260712180918` | `20260712180918` | `2026-07-12 18:09:18`' \
  '   `20260712180919` |                    |' \
  > "${evidence_dir}/migration-list.txt"
if (
  cd "$repository_copy"
  bash ./verify-staging-evidence.sh staging-evidence candidate-sha
); then
  echo "Expected staging evidence verification to fail when a candidate migration is not applied remotely." >&2
  exit 1
fi

echo "verify-staging-evidence tests passed."
