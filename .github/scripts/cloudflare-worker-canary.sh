#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_DIR="${REPOSITORY_ROOT}/web"
SCRIPT_NAME="$(basename "$0")"

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} <command> [options]

Wrangler gradual-deployment helpers for production canary rollouts.

Commands:
  assert-versions-api          Fail if installed wrangler lacks versions upload/deploy.
  upload [--env-file PATH]     Build and upload an inactive Worker version; prints version_id.
  stable-version               Print the current production version_id receiving the most traffic.
  deploy-split NEW STABLE NEW% STABLE%
                               Deploy a traffic split between new and stable version IDs.
  deployments-status [--json]  Show active deployment (wraps wrangler deployments status).
  list-versions [--json]       List recent Worker versions (wraps wrangler versions list).

Environment:
  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  Required for Cloudflare commands.
  WRANGLER_MIN_VERSION                       Optional minimum wrangler semver (default: 4.0.0).

Fallback:
  If versions upload/deploy is unavailable, use direct 'wrangler deploy' only after manual review.
  This script exits non-zero from assert-versions-api so CI does not silently skip canaries.
EOF
}

require_cloudflare_auth() {
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    echo "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required." >&2
    exit 1
  fi
}

wrangler_cmd() {
  require_cloudflare_auth
  if [ "${WRANGLER_ENV:-}" = "staging" ]; then
    echo "Canary helpers must target production only; do not set WRANGLER_ENV=staging." >&2
    exit 1
  fi
  (
    cd "$WEB_DIR"
    npx wrangler "$@"
  )
}

parse_wrangler_semver() {
  local raw="$1"
  raw="${raw#v}"
  echo "$raw" | sed -E 's/[^0-9.].*$//'
}

version_ge() {
  local left="$1"
  local right="$2"
  python3 - "$left" "$right" <<'PY'
import sys
from itertools import zip_longest

def parts(value):
    return [int(p) for p in value.split(".") if p != ""]

left, right = sys.argv[1], sys.argv[2]
print("yes" if parts(left) >= parts(right) else "no")
PY
}

assert_versions_api() {
  local min_version="${WRANGLER_MIN_VERSION:-4.0.0}"
  local wrangler_version

  if ! wrangler_version="$(cd "$WEB_DIR" && npx wrangler --version 2>/dev/null | head -1)"; then
    echo "Unable to run wrangler --version from ${WEB_DIR}." >&2
    exit 1
  fi

  wrangler_version="$(parse_wrangler_semver "$wrangler_version")"
  if [ "$(version_ge "$wrangler_version" "$min_version")" != "yes" ]; then
    echo "wrangler ${wrangler_version} is below required ${min_version} for versions upload/deploy." >&2
    echo "Upgrade wrangler (via @astrojs/cloudflare) or use a manual deploy fallback." >&2
    exit 1
  fi

  if ! wrangler_cmd versions upload --help >/dev/null 2>&1; then
    echo "Installed wrangler lacks 'versions upload'. Canary deploy is not available." >&2
    echo "Fallback: manual 'wrangler deploy' after review (not automated in CI)." >&2
    exit 1
  fi

  if ! wrangler_cmd versions deploy --help >/dev/null 2>&1; then
    echo "Installed wrangler lacks 'versions deploy'. Canary promotion is not available." >&2
    exit 1
  fi

  echo "wrangler ${wrangler_version} supports versions upload/deploy."
}

parse_wrangler_output_version_id() {
  local output_file="$1"

  if [ ! -f "$output_file" ]; then
    echo "Wrangler output file not found: ${output_file}" >&2
    return 1
  fi

  python3 - "$output_file" <<'PY'
import json
import sys

path = sys.argv[1]
version_id = None

with open(path, encoding="utf-8") as handle:
    for line in handle:
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if payload.get("type") == "version-upload" and payload.get("version_id"):
            version_id = payload["version_id"]
            break
        if payload.get("version_id"):
            version_id = payload["version_id"]

if not version_id:
    raise SystemExit("Unable to parse version_id from wrangler output file.")

print(version_id)
PY
}

upload_version() {
  local env_file="${1:-}"
  local output_file

  assert_versions_api
  output_file="$(mktemp)"
  trap 'rm -f "$output_file"' RETURN

  if [ -n "$env_file" ]; then
    if [ ! -f "${WEB_DIR}/${env_file}" ] && [ ! -f "$env_file" ]; then
      echo "Env file not found: ${env_file}" >&2
      exit 1
    fi
    WRANGLER_OUTPUT_FILE_PATH="$output_file" wrangler_cmd versions upload --env-file "$env_file"
  else
    WRANGLER_OUTPUT_FILE_PATH="$output_file" wrangler_cmd versions upload
  fi

  parse_wrangler_output_version_id "$output_file"
}

parse_deployments_status_json() {
  python3 - <<'PY'
import json
import sys

payload = json.load(sys.stdin)
versions = payload.get("versions") or []

if not versions:
    raise SystemExit("No versions found in active deployment.")

# Prefer the version receiving the highest traffic share as the current stable baseline.
stable = max(versions, key=lambda item: int(item.get("percentage") or 0))
version_id = stable.get("version_id")
if not version_id:
    raise SystemExit("Active deployment is missing version_id.")

print(version_id)
PY
}

stable_version() {
  assert_versions_api
  wrangler_cmd deployments status --json | parse_deployments_status_json
}

validate_percentage_pair() {
  local new_pct="$1"
  local stable_pct="$2"

  if ! [[ "$new_pct" =~ ^[0-9]+$ ]] || ! [[ "$stable_pct" =~ ^[0-9]+$ ]]; then
    echo "Percentages must be integers." >&2
    exit 1
  fi

  if [ $((new_pct + stable_pct)) -ne 100 ]; then
    echo "Traffic split must total 100% (got ${new_pct}% + ${stable_pct}%)." >&2
    exit 1
  fi
}

deploy_split() {
  local new_version_id="$1"
  local stable_version_id="$2"
  local new_pct="$3"
  local stable_pct="$4"
  local message="${5:-Production canary promotion via ${SCRIPT_NAME}}"

  assert_versions_api
  validate_percentage_pair "$new_pct" "$stable_pct"

  if [ -z "$new_version_id" ] || [ -z "$stable_version_id" ]; then
    echo "Both new and stable version IDs are required." >&2
    exit 1
  fi

  echo "Deploying traffic split: new=${new_version_id}@${new_pct}% stable=${stable_version_id}@${stable_pct}%"
  wrangler_cmd versions deploy \
    "${new_version_id}@${new_pct}" \
    "${stable_version_id}@${stable_pct}" \
    --message "$message" \
    --yes
}

deployments_status() {
  assert_versions_api
  if [ "${1:-}" = "--json" ]; then
    wrangler_cmd deployments status --json
  else
    wrangler_cmd deployments status
  fi
}

list_versions() {
  assert_versions_api
  if [ "${1:-}" = "--json" ]; then
    wrangler_cmd versions list --json
  else
    wrangler_cmd versions list
  fi
}

command="${1:-}"
shift || true

case "$command" in
  assert-versions-api)
    assert_versions_api
    ;;
  upload)
    env_file=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --env-file)
          env_file="${2:?--env-file requires a path}"
          shift 2
          ;;
        *)
          echo "Unknown upload option: $1" >&2
          usage >&2
          exit 1
          ;;
      esac
    done
    upload_version "$env_file"
    ;;
  stable-version)
    stable_version
    ;;
  deploy-split)
    if [ "$#" -lt 4 ]; then
      echo "deploy-split requires: NEW_VERSION STABLE_VERSION NEW% STABLE%" >&2
      exit 1
    fi
    deploy_split "$1" "$2" "$3" "$4" "${5:-}"
    ;;
  deployments-status)
    deployments_status "${1:-}"
    ;;
  list-versions)
    list_versions "${1:-}"
    ;;
  -h|--help|"")
    usage
    ;;
  *)
    echo "Unknown command: ${command}" >&2
    usage >&2
    exit 1
    ;;
esac
