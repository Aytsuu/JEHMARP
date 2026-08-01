#!/usr/bin/env bash
set -euo pipefail

for f in .github/scripts/*.sh .github/scripts/tests/*.test.sh; do
  sed -i 's/\r$//' "$f"
  chmod +x "$f"
done

bash .github/scripts/tests/assert-supabase-baseline-ledger-state.test.sh
bash .github/scripts/tests/overlay-candidate-migration-data.test.sh
bash .github/scripts/tests/production-migration-dry-run-workflow.test.sh
bash .github/scripts/tests/validate-production-pr-workflow.test.sh
bash .github/scripts/tests/reconcile-supabase-baseline-workflow.test.sh
