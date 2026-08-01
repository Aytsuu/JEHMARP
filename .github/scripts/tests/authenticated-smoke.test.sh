#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AUTH_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/authenticated-smoke.sh"
SMOKE_LIB="${REPOSITORY_ROOT}/.github/scripts/smoke-lib.sh"

# shellcheck source=/dev/null
source "$SMOKE_LIB"

header="$(smoke_build_version_override_header "jehmarp" "test-version-id")"
expected='Cloudflare-Workers-Version-Overrides: jehmarp="test-version-id"'

if [ "$header" != "$expected" ]; then
  echo "Unexpected header: ${header}" >&2
  exit 1
fi

if bash -n "$AUTH_SCRIPT"; then
  :
else
  echo "authenticated-smoke.sh failed bash -n." >&2
  exit 1
fi

if BASE_URL="https://example.test" bash "$AUTH_SCRIPT" 2>/dev/null; then
  echo "Expected authenticated smoke to fail without credentials." >&2
  exit 1
fi

if BASE_URL="https://example.test" AUTH_SMOKE_OPTIONAL=true bash "$AUTH_SCRIPT" >/tmp/auth-smoke-optional.out 2>&1; then
  if ! grep -q "skipping authenticated smoke" /tmp/auth-smoke-optional.out; then
    echo "Expected optional skip warning." >&2
    exit 1
  fi
else
  echo "Expected AUTH_SMOKE_OPTIONAL=true to exit 0 without credentials." >&2
  exit 1
fi

allowed=$((20 * 5 / 100))

if [ "$allowed" != "1" ]; then
  echo "Unexpected allowed failure threshold: ${allowed}" >&2
  exit 1
fi

echo "authenticated-smoke helper tests passed."
