#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/validate-production-pr.yml"
TRUSTED_DRY_RUN_WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/production-migration-dry-run.yml"

validation_job="$(sed -n '/^  validate:/,$p' "$WORKFLOW")"

if printf '%s\n' "$validation_job" | grep -Eq 'secrets\.(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)'; then
  echo "Secret-free PR validation job must not expose production database credentials." >&2
  exit 1
fi

if printf '%s\n' "$validation_job" | grep -q 'supabase-db-push-remote.sh'; then
  echo "Validate production PR must not run credentialed production migration dry-runs inline." >&2
  exit 1
fi

if ! grep -q 'pull_request_target:' "$TRUSTED_DRY_RUN_WORKFLOW"; then
  echo "Credentialed production migration dry-run must be defined on trusted main via pull_request_target." >&2
  exit 1
fi

if ! grep -q 'environment: production-validation' "$TRUSTED_DRY_RUN_WORKFLOW"; then
  echo "Trusted production migration dry-run must use production-validation." >&2
  exit 1
fi

if ! grep -q 'overlay-candidate-migration-data.sh' "$TRUSTED_DRY_RUN_WORKFLOW"; then
  echo "Trusted production migration dry-run must overlay candidate migration data." >&2
  exit 1
fi

if ! grep -q 'assert-supabase-baseline-ledger-state.sh' "$TRUSTED_DRY_RUN_WORKFLOW"; then
  echo "Trusted production migration dry-run must assert ledger state before db push." >&2
  exit 1
fi

echo "validate-production-pr workflow tests passed."
