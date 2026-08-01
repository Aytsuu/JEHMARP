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
SMOKE_TURNSTILE_RESPONSE="${SMOKE_TURNSTILE_RESPONSE:-}"

usage() {
  cat <<'EOF'
Usage: authenticated-smoke.sh

Run authenticated HTTP smoke checks against BASE_URL (or PRODUCTION_BASE_URL /
STAGING_BASE_URL).

Environment:
  SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD   Admin dashboard smoke credentials.
  SMOKE_AGENT_EMAIL / SMOKE_AGENT_PASSWORD   Agent dashboard smoke credentials.
  AUTH_SMOKE_OPTIONAL=true                   Skip with warning when credentials are missing.
  SMOKE_TURNSTILE_RESPONSE                   Optional Turnstile token for /api/login when
                                             the target environment enables Turnstile.
  BASE_URL / PRODUCTION_BASE_URL / STAGING_BASE_URL
  WORKER_VERSION_ID                          Optional Worker version override header.
EOF
}

missing_smoke_credentials() {
  [ -z "$SMOKE_ADMIN_EMAIL" ] || [ -z "$SMOKE_ADMIN_PASSWORD" ] \
    || [ -z "$SMOKE_AGENT_EMAIL" ] || [ -z "$SMOKE_AGENT_PASSWORD" ]
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
    -o /dev/null
    -w "%{http_code}|%{redirect_url}"
    --max-redirs 0
  )

  if [ -n "$turnstile_token" ]; then
    curl_args+=(-F "cf-turnstile-response=${turnstile_token}")
  fi

  if [ -n "${VERSION_OVERRIDE_HEADER:-}" ]; then
    curl_args+=(-H "$VERSION_OVERRIDE_HEADER")
  fi

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

  if [ -n "${VERSION_OVERRIDE_HEADER:-}" ]; then
    curl_args+=(-H "$VERSION_OVERRIDE_HEADER")
  fi

  curl "${curl_args[@]}" "${BASE_URL}${path}"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if ! smoke_require_base_url; then
  exit 1
fi

smoke_setup_version_override "$SCRIPT_DIR"

if missing_smoke_credentials; then
  if [ "$AUTH_SMOKE_OPTIONAL" = "true" ]; then
    echo "AUTH_SMOKE_OPTIONAL=true and smoke credentials are missing; skipping authenticated smoke checks."
    exit 0
  fi

  echo "Authenticated smoke credentials are required (SMOKE_ADMIN_* and SMOKE_AGENT_*)." >&2
  echo "Set AUTH_SMOKE_OPTIONAL=true only for environments still provisioning smoke users." >&2
  exit 1
fi

echo "Authenticated smoke testing ${BASE_URL}"

admin_jar="$(mktemp)"
agent_jar="$(mktemp)"
trap 'rm -f "$admin_jar" "$agent_jar"' EXIT

turnstile_token="$SMOKE_TURNSTILE_RESPONSE"
if [ -z "$turnstile_token" ]; then
  turnstile_token="1x0000000000000000000000000000000AA"
fi

admin_login_result="$(login_dashboard_user "$SMOKE_ADMIN_EMAIL" "$SMOKE_ADMIN_PASSWORD" "$admin_jar" "$turnstile_token")"
assert_login_succeeded "admin" "$admin_login_result"

agent_login_result="$(login_dashboard_user "$SMOKE_AGENT_EMAIL" "$SMOKE_AGENT_PASSWORD" "$agent_jar" "$turnstile_token")"
assert_login_succeeded "agent" "$agent_login_result"

admin_home_status="$(smoke_curl_with_cookie_jar "$admin_jar" "${BASE_URL}/admin" -L --max-redirs 5)"
assert_status "/admin (admin session)" "200" "$admin_home_status"

agent_home_status="$(smoke_curl_with_cookie_jar "$agent_jar" "${BASE_URL}/agent" -L --max-redirs 5)"
assert_status "/agent (agent session)" "200" "$agent_home_status"

admin_cross_status="$(smoke_curl_with_cookie_jar "$agent_jar" "${BASE_URL}/admin" -L --max-redirs 0 || true)"
assert_status_in "/admin (agent session)" "$admin_cross_status" 301 302 303 307 308

agent_cross_status="$(smoke_curl_with_cookie_jar "$admin_jar" "${BASE_URL}/agent" -L --max-redirs 0 || true)"
assert_status_in "/agent (admin session)" "$agent_cross_status" 301 302 303 307 308

admin_api_status="$(fetch_json_status "$admin_jar" "/admin/dashboard-summary.json")"
assert_status "/admin/dashboard-summary.json (admin session)" "200" "$admin_api_status"

agent_api_status="$(fetch_json_status "$agent_jar" "/admin/dashboard-summary.json")"
assert_status "/admin/dashboard-summary.json (agent session)" "403" "$agent_api_status"

echo "Authenticated smoke checks passed."
