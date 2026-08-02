#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/run-canary-smoke.sh"
WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/deploy-production.yml"
STAGING_WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/deploy-staging.yml"

find "${REPOSITORY_ROOT}/.github/scripts" -name '*.sh' -print0 | xargs -0 sed -i 's/\r$//' 2>/dev/null || true

if ! bash -n "$RUN_SCRIPT"; then
  echo "run-canary-smoke.sh failed bash -n." >&2
  exit 1
fi

if BASE_URL="https://example.test" NEW_VERSION_ID="11111111-1111-1111-1111-111111111111" STABLE_VERSION_ID="22222222-2222-2222-2222-222222222222" \
  bash "$RUN_SCRIPT" --label test --auth >/tmp/run-canary-auth.out 2>&1; then
  echo "Expected deprecated --auth flag to fail closed." >&2
  exit 1
fi

if ! grep -Fq 'no longer supported in production canary smoke' /tmp/run-canary-auth.out; then
  echo "Expected --auth remediation message." >&2
  cat /tmp/run-canary-auth.out >&2
  exit 1
fi

if ! grep -Fq 'rollback_on_failure "Public smoke failed' "$RUN_SCRIPT"; then
  echo "run-canary-smoke.sh must roll back on public smoke failure." >&2
  exit 1
fi

if ! grep -Fq 'SMOKE_SUITE="public"' "$RUN_SCRIPT" \
  || ! grep -Fq 'authenticated-smoke.sh' "$RUN_SCRIPT"; then
  echo "run-canary-smoke.sh must distinguish public and test-auth suites explicitly." >&2
  exit 1
fi

if BASE_URL="https://example.test" \
  NEW_VERSION_ID="11111111-1111-1111-1111-111111111111" \
  STABLE_VERSION_ID="22222222-2222-2222-2222-222222222222" \
  AUTH_SMOKE_TARGET_ENV=production \
  bash "$RUN_SCRIPT" --label "bad auth" --with-test-auth >/tmp/run-canary-prod-auth.out 2>&1; then
  echo "Expected production --with-test-auth to fail closed." >&2
  exit 1
fi

if ! grep -Fq 'manual production authentication gate' /tmp/run-canary-prod-auth.out; then
  echo "Expected production --with-test-auth remediation message." >&2
  exit 1
fi

if ! grep -e '--label "0% version-targeted upload" --public-only --version-targeted' "$WORKFLOW"; then
  echo "deploy-production.yml must use public-only version-targeted 0% smoke." >&2
  exit 1
fi

if grep -e 'run-canary-smoke.sh.*--auth' "$WORKFLOW"; then
  echo "deploy-production.yml must not invoke curl authenticated smoke via --auth." >&2
  exit 1
fi

if ! grep -q 'environment: production-canary-auth' "$WORKFLOW"; then
  echo "deploy-production.yml must define the manual production authentication gate environment." >&2
  exit 1
fi

if ! grep -q 'manual-production-auth-gate.sh record' "$WORKFLOW"; then
  echo "deploy-production.yml must record manual production authentication attestation." >&2
  exit 1
fi

if ! grep -q 'rollback-on-manual-auth-failure' "$WORKFLOW"; then
  echo "deploy-production.yml must roll back when the manual auth gate fails." >&2
  exit 1
fi

if ! grep -q 'AUTH_SMOKE_TARGET_ENV: staging' "$STAGING_WORKFLOW" \
  || ! grep -q 'AUTH_SMOKE_TURNSTILE_MODE: test' "$STAGING_WORKFLOW"; then
  echo "deploy-staging.yml must keep automated admin smoke with test Turnstile mode." >&2
  exit 1
fi

if grep -q 'authenticated-smoke.sh' "$WORKFLOW"; then
  echo "deploy-production.yml must not invoke authenticated-smoke.sh directly." >&2
  exit 1
fi

echo "run-canary-smoke helper tests passed."
