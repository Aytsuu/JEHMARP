#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=smoke-lib.sh
source "${SCRIPT_DIR}/smoke-lib.sh"

SMOKE_ADMIN_EMAIL="${SMOKE_ADMIN_EMAIL:-}"
SMOKE_ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD:-}"
SMOKE_AGENT_EMAIL="${SMOKE_AGENT_EMAIL:-}"
SMOKE_AGENT_PASSWORD="${SMOKE_AGENT_PASSWORD:-}"
AUTH_SMOKE_OPTIONAL="${AUTH_SMOKE_OPTIONAL:-false}"
AUTH_SMOKE_ROLE="${AUTH_SMOKE_ROLE:-all}"
SMOKE_TURNSTILE_RESPONSE="${SMOKE_TURNSTILE_RESPONSE:-}"
AUTH_SMOKE_TURNSTILE_MODE="${AUTH_SMOKE_TURNSTILE_MODE:-test}"
AUTH_SMOKE_TARGET_ENV="${AUTH_SMOKE_TARGET_ENV:-}"
TURNSTILE_TEST_RESPONSE="1x0000000000000000000000000000000AA"

usage() {
  cat <<'EOF'
Usage: authenticated-smoke.sh

Run authenticated HTTP smoke checks against BASE_URL (or PRODUCTION_BASE_URL /
STAGING_BASE_URL).

Environment:
  SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD   Admin dashboard smoke credentials.
  SMOKE_AGENT_EMAIL / SMOKE_AGENT_PASSWORD   Agent dashboard smoke credentials when
                                             AUTH_SMOKE_ROLE=all (the default).
  AUTH_SMOKE_ROLE=admin|all                  Dashboard role coverage. Use admin fo
                                             staging-only admin smoke coverage.
  AUTH_SMOKE_OPTIONAL=true                   Skip with warning when credentials are missing.
  AUTH_SMOKE_TURNSTILE_MODE=test|real-browse
                                             test uses Cloudflare's documented test response only
                                             for non-production targets (staging/local). real-browse
                                             refuses curl-based login and directs operators to the
                                             production manual authentication gate.
  AUTH_SMOKE_TARGET_ENV=staging|local|production
                                             Required for test mode. Production rejects automated
                                             curl login with test Turnstile responses.
  SMOKE_TURNSTILE_RESPONSE                   Optional Turnstile token override for test mode in
                                             non-production targets configured with test keys.
  BASE_URL / PRODUCTION_BASE_URL / STAGING_BASE_URL
  CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET
                                             Optional Cloudflare Access service token fo
                                             staging targets behind Zero Trust. Required fo
                                             automated curl smoke when Access protects the origin.
  WORKER_VERSION_ID                          Optional Worker version override header.
EOF
}

missing_smoke_credentials() {
  if [ -z "$SMOKE_ADMIN_EMAIL" ] || [ -z "$SMOKE_ADMIN_PASSWORD" ]; then
    return 0
  fi

  if [ "$AUTH_SMOKE_ROLE" = "all" ] \
    && { [ -z "$SMOKE_AGENT_EMAIL" ] || [ -z "$SMOKE_AGENT_PASSWORD" ]; }; then
    return 0
  fi

  return 1
}

is_turnstile_test_response() {
  [ "${1:-}" = "$TURNSTILE_TEST_RESPONSE" ]
}

resolve_turnstile_token() {
  local token="${SMOKE_TURNSTILE_RESPONSE:-}"

  case "$AUTH_SMOKE_TURNSTILE_MODE" in
    real-browser)
      echo "Authenticated smoke cannot solve production Turnstile challenges via curl." >&2
      echo "Complete manual real-browser verification at the production canary auth gate." >&2
      echo "Verify /dashboard, /admin, and /admin/dashboard-summary.json after logging in through /login." >&2
      exit 1
      ;;
    test)
      ;;
    *)
      echo "AUTH_SMOKE_TURNSTILE_MODE must be test or real-browser, got: ${AUTH_SMOKE_TURNSTILE_MODE}" >&2
      exit 1
      ;;
  esac

  case "$AUTH_SMOKE_TARGET_ENV" in
    staging|local)
      ;;
    production)
      echo "Production targets cannot run automated curl authenticated smoke." >&2
      echo "Cloudflare test Turnstile responses are rejected by production Siteverify." >&2
      echo "Use the protected manual production authentication gate during canary deploy." >&2
      exit 1
      ;;
    "")
      echo "AUTH_SMOKE_TARGET_ENV is required for authenticated smoke (staging, local, or production)." >&2
      exit 1
      ;;
    *)
      echo "AUTH_SMOKE_TARGET_ENV must be staging, local, or production, got: ${AUTH_SMOKE_TARGET_ENV}" >&2
      exit 1
      ;;
  esac

  if [ -z "$token" ]; then
    token="$TURNSTILE_TEST_RESPONSE"
  fi

  if is_turnstile_test_response "$token"; then
    printf '%s' "$token"
    return 0
  fi

  echo "Only Cloudflare's documented test Turnstile response is supported in test mode." >&2
  echo "Do not store solved production Turnstile tokens in GitHub secrets." >&2
  exit 1
}

login_dashboard_user() {
  local email="$1"
  local password="$2"
  local cookie_jar="$3"
  local turnstile_token="${4:-}"
  local login_url="${BASE_URL}/api/login"
  local curl_args=(
    -sS
    -c "$cookie_jar"
    -b "$cookie_jar"
    -X POST
    -F "email=${email}"
    -F "password=${password}"
    -H "Origin: ${BASE_URL}"
    -o /dev/null
    -w "%{http_code}|%{redirect_url}"
    --max-redirs 0
  )

  if [ -n "$turnstile_token" ]; then
    curl_args+=(-F "cf-turnstile-response=${turnstile_token}")
  fi

  smoke_append_common_curl_headers curl_args

  curl "${curl_args[@]}" "$login_url"
}

assert_login_succeeded() {
  local role_label="$1"
  local login_result="$2"

  local status="${login_result%%|*}"
  local redirect_url="${login_result#*|}"

  echo "${role_label} login status: ${status} redirect: ${redirect_url}"

  case "${status}" in
    301|302|303|307|308)
      if is_cloudflare_access_redirect_url "$redirect_url"; then
        echo "${role_label} login was intercepted by Cloudflare Access." >&2
        if ! smoke_has_cloudflare_access_credentials; then
          echo "Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (service token) in the staging environment for CI smoke." >&2
          echo "Create the token in Cloudflare One → Access → Service Auth for the staging application." >&2
        else
          echo "Verify the service token is authorized for this staging hostname." >&2
        fi
        return 1
      fi
      if [[ "$redirect_url" != *"/dashboard"* ]]; then
        echo "${role_label} login did not redirect to /dashboard." >&2
        return 1
      fi
      ;;
    *)
      echo "${role_label} login failed." >&2
      return 1
      ;;
  esac
}

assert_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"

  echo "${label}: ${actual}"
  if [ "$actual" != "$expected" ]; then
    echo "Expected ${label} to return ${expected}, got ${actual}." >&2
    return 1
  fi
}

assert_status_in() {
  local label="$1"
  shift
  local actual="$1"
  shift
  local allowed=("$@")

  echo "${label}: ${actual}"
  for code in "${allowed[@]}"; do
    if [ "$actual" = "$code" ]; then
      return 0
    fi
  done

  echo "Expected ${label} to return one of: ${allowed[*]}, got ${actual}." >&2
  return 1
}

fetch_json_status() {
  local cookie_jar="$1"
  local path="$2"
  local tmp_headers
  tmp_headers="$(mktemp)"
  trap 'rm -f "$tmp_headers"' RETURN

  local curl_args=(
    -sS
    -b "$cookie_jar"
    -D "$tmp_headers"
    -o /dev/null
    -w "%{http_code}"
    -H "Accept: application/json"
  )

  smoke_append_common_curl_headers curl_args

  curl "${curl_args[@]}" "${BASE_URL}${path}"
}

if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0 2>/dev/null || exit 0
fi

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if ! smoke_require_base_url; then
  exit 1
fi

smoke_setup_version_override "$SCRIPT_DIR"

case "$AUTH_SMOKE_ROLE" in
  admin|all)
    ;;
  *)
    echo "AUTH_SMOKE_ROLE must be admin or all, got: ${AUTH_SMOKE_ROLE}" >&2
    exit 1
    ;;
esac

if missing_smoke_credentials; then
  if [ "$AUTH_SMOKE_OPTIONAL" = "true" ]; then
    echo "AUTH_SMOKE_OPTIONAL=true and smoke credentials are missing; skipping authenticated smoke checks."
    exit 0
  fi

  if [ "$AUTH_SMOKE_ROLE" = "admin" ]; then
    echo "Authenticated admin smoke credentials are required (SMOKE_ADMIN_*)." >&2
  else
    echo "Authenticated smoke credentials are required (SMOKE_ADMIN_* and SMOKE_AGENT_*)." >&2
  fi
  echo "Set AUTH_SMOKE_OPTIONAL=true only for environments still provisioning smoke users." >&2
  exit 1
fi

echo "Authenticated smoke testing ${BASE_URL}"

admin_jar="$(mktemp)"
trap 'rm -f "$admin_jar"' EXIT

turnstile_token="$(resolve_turnstile_token)"

admin_login_result="$(login_dashboard_user "$SMOKE_ADMIN_EMAIL" "$SMOKE_ADMIN_PASSWORD" "$admin_jar" "$turnstile_token")"
assert_login_succeeded "admin" "$admin_login_result"

admin_home_status="$(smoke_curl_with_cookie_jar "$admin_jar" "${BASE_URL}/admin" -L --max-redirs 5)"
assert_status "/admin (admin session)" "200" "$admin_home_status"

admin_api_status="$(fetch_json_status "$admin_jar" "/admin/dashboard-summary.json")"
assert_status "/admin/dashboard-summary.json (admin session)" "200" "$admin_api_status"

if [ "$AUTH_SMOKE_ROLE" = "all" ]; then
  agent_jar="$(mktemp)"
  trap 'rm -f "$admin_jar" "$agent_jar"' EXIT

  agent_login_result="$(login_dashboard_user "$SMOKE_AGENT_EMAIL" "$SMOKE_AGENT_PASSWORD" "$agent_jar" "$turnstile_token")"
  assert_login_succeeded "agent" "$agent_login_result"

  agent_home_status="$(smoke_curl_with_cookie_jar "$agent_jar" "${BASE_URL}/agent" -L --max-redirs 5)"
  assert_status "/agent (agent session)" "200" "$agent_home_status"

  admin_cross_status="$(smoke_curl_with_cookie_jar "$agent_jar" "${BASE_URL}/admin" -L --max-redirs 0 || true)"
  assert_status_in "/admin (agent session)" "$admin_cross_status" 301 302 303 307 308

  agent_cross_status="$(smoke_curl_with_cookie_jar "$admin_jar" "${BASE_URL}/agent" -L --max-redirs 0 || true)"
  assert_status_in "/agent (admin session)" "$agent_cross_status" 301 302 303 307 308

  agent_api_status="$(fetch_json_status "$agent_jar" "/admin/dashboard-summary.json")"
  assert_status "/admin/dashboard-summary.json (agent session)" "403" "$agent_api_status"
fi

echo "Authenticated ${AUTH_SMOKE_ROLE} smoke checks passed."
