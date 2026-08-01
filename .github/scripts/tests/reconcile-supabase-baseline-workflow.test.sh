#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/reconcile-supabase-baseline.yml"

if [ ! -f "$WORKFLOW" ]; then
  echo "Expected the Supabase baseline reconciliation workflow to exist." >&2
  exit 1
fi

if ! grep -q 'workflow_dispatch:' "$WORKFLOW"; then
  echo "Baseline reconciliation must be manually dispatched." >&2
  exit 1
fi

for input in target expected_baseline_version confirmation_token execution_mode execute_confirmation migration_source_sha; do
  if ! grep -q "      ${input}:" "$WORKFLOW"; then
    echo "Baseline reconciliation must require the ${input} dispatch input." >&2
    exit 1
  fi
done

if ! grep -q 'type: choice' "$WORKFLOW" \
  || ! grep -q 'staging' "$WORKFLOW" \
  || ! grep -q 'production' "$WORKFLOW"; then
  echo "Baseline reconciliation target must be limited to staging or production." >&2
  exit 1
fi

if ! grep -q 'default: plan-only' "$WORKFLOW" \
  || ! grep -q 'execute-ledger-repair' "$WORKFLOW"; then
  echo "Baseline reconciliation must default to a plan-only mode and require an explicit execution mode." >&2
  exit 1
fi

if ! grep -q 'environment: \${{ inputs.target }}' "$WORKFLOW"; then
  echo "Baseline reconciliation must use the selected protected environment." >&2
  exit 1
fi

if grep -Eq '(^|[[:space:]])supabase[[:space:]]+db[[:space:]]+push([[:space:]]|$)' "$WORKFLOW"; then
  echo "Baseline reconciliation must never run supabase db push." >&2
  exit 1
fi

if ! grep -q 'supabase migration list --linked' "$WORKFLOW"; then
  echo "Baseline reconciliation must capture the remote migration ledger." >&2
  exit 1
fi

if ! grep -q '20260802_checkpoint_prebaseline' "$WORKFLOW" \
  || ! grep -q 'archived-versions.txt' "$WORKFLOW" \
  || ! grep -q 'Remote migration ledger does not exactly match this checkout' "$WORKFLOW"; then
  echo "Baseline reconciliation must require an exact archived-checkpoint-to-remote-ledger match." >&2
  exit 1
fi

if grep -q "awk -F '│'" "$WORKFLOW"; then
  echo "Baseline reconciliation must not parse legacy box-drawing migration-list columns." >&2
  exit 1
fi

if ! grep -q 'extract-supabase-remote-migration-versions.sh' "$WORKFLOW"; then
  echo "Baseline reconciliation must parse remote migration versions via the shared extractor." >&2
  exit 1
fi

if ! grep -q 'supabase migration repair --status reverted' "$WORKFLOW" \
  || ! grep -q 'supabase migration repair --status applied' "$WORKFLOW"; then
  echo "Baseline reconciliation must describe both metadata-repair operations." >&2
  exit 1
fi

repair_step="$(sed -n '/^      - name: Apply approved migration-ledger reconciliation/,/^      - name: /p' "$WORKFLOW")"
if ! printf '%s\n' "$repair_step" | grep -q "inputs.execution_mode == 'execute-ledger-repair'" \
  || ! printf '%s\n' "$repair_step" | grep -q "inputs.execute_confirmation == 'APPLY_METADATA_ONLY'"; then
  echo "Migration repair must require both explicit execution inputs." >&2
  exit 1
fi

if ! grep -q 'I_UNDERSTAND_THIS_IS_A_METADATA_ONLY_RECONCILIATION' "$WORKFLOW"; then
  echo "Baseline reconciliation must validate its acknowledgement token." >&2
  exit 1
fi

if ! grep -q 'expected baseline migration file' "$WORKFLOW" \
  || ! grep -q 'remote ledger already contains the expected baseline version' "$WORKFLOW" \
  || ! grep -q 'migration list before repair' "$WORKFLOW"; then
  echo "Baseline reconciliation must validate local and remote ledger preconditions." >&2
  exit 1
fi

if ! grep -q 'actions/upload-artifact@v4' "$WORKFLOW"; then
  echo "Baseline reconciliation must retain an auditable preflight artifact." >&2
  exit 1
fi

if ! grep -q 'overlay-candidate-migration-data.sh' "$WORKFLOW"; then
  echo "Baseline reconciliation must overlay candidate migration data via trusted script." >&2
  exit 1
fi

if ! grep -q 'validate-migration-source-sha.sh' "$WORKFLOW"; then
  echo "Baseline reconciliation must validate immutable migration_source_sha references." >&2
  exit 1
fi

if ! grep -q 'migration-source-sha.txt' "$WORKFLOW"; then
  echo "Baseline reconciliation must record migration source SHA in evidence." >&2
  exit 1
fi

if ! grep -q 'production reconciliation requires migration_source_sha' "$WORKFLOW"; then
  echo "Baseline reconciliation must require migration_source_sha for production." >&2
  exit 1
fi

echo "reconcile-supabase-baseline workflow tests passed."
