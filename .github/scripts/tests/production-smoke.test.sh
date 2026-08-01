#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SMOKE_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/production-smoke.sh"
SMOKE_LIB="${REPOSITORY_ROOT}/.github/scripts/smoke-lib.sh"

# shellcheck source=/dev/null
source "$SMOKE_LIB"

header="$(smoke_build_version_override_header "jehmarp" "test-version-id")"
expected='Cloudflare-Workers-Version-Overrides: jehmarp="test-version-id"'

if [ "$header" != "$expected" ]; then
  echo "Unexpected header: ${header}" >&2
  exit 1
fi

if BASE_URL="" bash "$SMOKE_SCRIPT" 2>/dev/null; then
  echo "Expected smoke script to fail without BASE_URL." >&2
  exit 1
fi

worker_name="$(bash "${REPOSITORY_ROOT}/.github/scripts/resolve-worker-name.sh")"
if [ "$worker_name" != "jehmarp" ]; then
  echo "Unexpected worker name from wrangler config: ${worker_name}" >&2
  exit 1
fi

echo "production-smoke helper tests passed."
