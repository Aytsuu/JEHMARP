#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AUTH_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/authenticated-smoke.sh"
SMOKE_LIB="${REPOSITORY_ROOT}/.github/scripts/smoke-lib.sh"

find "${REPOSITORY_ROOT}/.github/scripts" -name '*.sh' -print0 | xargs -0 sed -i 's/\r$//' 2>/dev/null || true

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

# A staging deployment currently verifies only the admin dashboard. It must not
# require agent credentials or make agent-route requests in that scoped mode.
curl() {
  local url="${!#}"

  if [[ "$url" == *"/agent"* ]]; then
    echo "Admin-only smoke unexpectedly requested an agent route: ${url}" >&2
    return 99
  fi

  if [[ "$url" == *"/api/login" ]]; then
    if [[ "$*" != *"Origin: https://example.test"* ]]; then
      echo "Authenticated smoke login did not send a same-origin Origin header." >&2
      return 98
    fi
    if [[ "$*" != *"cf-turnstile-response="* ]]; then
      echo "Authenticated smoke login did not send cf-turnstile-response." >&2
      return 97
    fi
    printf '302|https://example.test/dashboard'
    return 0
  fi

  printf '200'
}
export -f curl

if ! BASE_URL="https://example.test" \
  AUTH_SMOKE_ROLE=admin \
  AUTH_SMOKE_TARGET_ENV=staging \
  AUTH_SMOKE_TURNSTILE_MODE=test \
  SMOKE_ADMIN_EMAIL="admin@example.test" \
  SMOKE_ADMIN_PASSWORD="admin-password" \
  bash "$AUTH_SCRIPT" >/tmp/auth-smoke-admin-only.out 2>&1; then
  cat /tmp/auth-smoke-admin-only.out >&2
  echo "Expected admin-only authenticated smoke to pass without agent credentials." >&2
  exit 1
fi

if ! grep -q "Authenticated admin smoke checks passed" /tmp/auth-smoke-admin-only.out; then
  echo "Expected admin-only authenticated smoke success message." >&2
  exit 1
fi

if BASE_URL="https://example.test" \
  AUTH_SMOKE_ROLE=admin \
  AUTH_SMOKE_TARGET_ENV=production \
  AUTH_SMOKE_TURNSTILE_MODE=test \
  SMOKE_ADMIN_EMAIL="admin@example.test" \
  SMOKE_ADMIN_PASSWORD="admin-password" \
  bash "$AUTH_SCRIPT" >/tmp/auth-smoke-prod-blocked.out 2>&1; then
  echo "Expected production test Turnstile mode to fail closed." >&2
  exit 1
fi

if grep -Fq '1x0000000000000000000000000000000AA' /tmp/auth-smoke-prod-blocked.out; then
  echo "Production failure output must not leak the test Turnstile response token." >&2
  exit 1
fi

if ! grep -Fq 'manual production authentication gate' /tmp/auth-smoke-prod-blocked.out; then
  echo "Expected remediation message for production authenticated smoke." >&2
  cat /tmp/auth-smoke-prod-blocked.out >&2
  exit 1
fi

if BASE_URL="https://example.test" \
  AUTH_SMOKE_TARGET_ENV=staging \
  AUTH_SMOKE_TURNSTILE_MODE=real-browser \
  SMOKE_ADMIN_EMAIL="admin@example.test" \
  SMOKE_ADMIN_PASSWORD="admin-password" \
  bash "$AUTH_SCRIPT" >/tmp/auth-smoke-real-browser.out 2>&1; then
  echo "Expected real-browser mode to refuse curl login." >&2
  exit 1
fi

if ! is_cloudflare_access_redirect_url "https://aytsuu.cloudflareaccess.com/cdn-cgi/access/login/staging.example"; then
  echo "Expected Cloudflare Access redirect URL detection." >&2
  exit 1
fi

if (
  # shellcheck source=/dev/null
  source "$AUTH_SCRIPT"
  assert_login_succeeded "admin" "302|https://aytsuu.cloudflareaccess.com/cdn-cgi/access/login/staging.example"
) >/tmp/auth-smoke-access-assert.out 2>&1; then
  echo "Expected Cloudflare Access login redirect to fail assert_login_succeeded." >&2
  cat /tmp/auth-smoke-access-assert.out >&2
  exit 1
fi

if ! grep -Fq 'Cloudflare Access' /tmp/auth-smoke-access-assert.out \
  || ! grep -Fq 'CF_ACCESS_CLIENT_ID' /tmp/auth-smoke-access-assert.out; then
  echo "Expected Cloudflare Access remediation message." >&2
  cat /tmp/auth-smoke-access-assert.out >&2
  exit 1
fi

allowed=$((20 * 5 / 100))

if [ "$allowed" != "1" ]; then
  echo "Unexpected allowed failure threshold: ${allowed}" >&2
  exit 1
fi

echo "authenticated-smoke helper tests passed."
