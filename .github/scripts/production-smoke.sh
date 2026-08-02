#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=smoke-lib.sh
source "${SCRIPT_DIR}/smoke-lib.sh"

WORKER_VERSION_ID="${WORKER_VERSION_ID:-}"

usage() {
  cat <<'EOF'
Usage: production-smoke.sh

Run production HTTP smoke checks against BASE_URL (or PRODUCTION_BASE_URL).

Environment:
  BASE_URL / PRODUCTION_BASE_URL / STAGING_BASE_URL
                                   Target origin (required unless resolved externally).
  WORKER_VERSION_ID                Optional Worker version ID for version-targeted smoke tests.
                                   Sets Cloudflare-Workers-Version-Overrides using the worke
                                   name from web/wrangler.jsonc (RFC 8941 dictionary format).
  SMOKE_MAX_ATTEMPTS               Public-route attempts after a Worker deployment (default: 6).
  SMOKE_RETRY_DELAY_SECONDS        Delay between public-route attempts (default: 5).
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if ! smoke_require_base_url; then
  exit 1
fi

smoke_setup_version_override "$SCRIPT_DIR"

echo "Smoke testing ${BASE_URL}"

for path in "/" "/shop" "/contact" "/login"; do
  status="$(smoke_curl_status_with_retry 200 "${BASE_URL}${path}" -L --max-redirs 5 || true)"
  echo "${path}: ${status}"
  if [ "${status}" != "200" ]; then
    exit 1
  fi
done

for path in "/admin" "/agent"; do
  status="$(smoke_curl_status "${BASE_URL}${path}" -L --max-redirs 0 || true)"
  echo "${path}: ${status}"
  case "${status}" in
    301|302|303|307|308) ;;
    *) exit 1 ;;
  esac
done

status="$(smoke_curl_status "${BASE_URL}/api/login" -X POST -F "email=" -F "password=")"
echo "/api/login invalid POST: ${status}"
case "${status}" in
  301|302|303|400|401|403|422) ;;
  *) exit 1 ;;
esac

echo "Production smoke checks passed."
