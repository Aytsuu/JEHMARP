#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/production-migration-dry-run.yml"

if [ ! -f "$WORKFLOW" ]; then
  echo "Expected trusted production migration dry-run workflow." >&2
  exit 1
fi

if ! grep -q 'pull_request_target:' "$WORKFLOW"; then
  echo "Production migration dry-run must use pull_request_target from trusted main." >&2
  exit 1
fi

if ! grep -q 'environment: production-validation' "$WORKFLOW"; then
  echo "Trusted production migration dry-run must use production-validation." >&2
  exit 1
fi

if grep -q '^    environment: production$' "$WORKFLOW"; then
  echo "Trusted production migration dry-run must not request production deployment." >&2
  exit 1
fi

if ! grep -q "github.event.pull_request.head.repo.full_name == github.repository" "$WORKFLOW"; then
  echo "Trusted production migration dry-run must reject fork pull requests." >&2
  exit 1
fi

if ! grep -q 'overlay-candidate-migration-data.sh' "$WORKFLOW"; then
  echo "Trusted production migration dry-run must overlay candidate migration data via trusted script." >&2
  exit 1
fi

if ! grep -q 'assert-supabase-baseline-ledger-state.sh' "$WORKFLOW"; then
  echo "Trusted production migration dry-run must assert ledger state before db push." >&2
  exit 1
fi

if ! grep -q -- '--policy active-prefix' "$WORKFLOW"; then
  echo "Trusted production migration dry-run must use active-prefix ledger policy." >&2
  exit 1
fi

if ! grep -q 'steps.baseline_guard.outcome == .success.' "$WORKFLOW"; then
  echo "Trusted production migration dry-run must skip db push when the guard fails." >&2
  exit 1
fi

if ! grep -q 'working-directory: trusted' "$WORKFLOW"; then
  echo "Trusted production migration dry-run must execute only from trusted checkout." >&2
  exit 1
fi

if grep -q 'candidate/.github/scripts' "$WORKFLOW"; then
  echo "Trusted production migration dry-run must not execute candidate scripts." >&2
  exit 1
fi

echo "production-migration-dry-run workflow tests passed."
