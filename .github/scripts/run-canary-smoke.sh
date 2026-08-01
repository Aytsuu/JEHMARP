#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SMOKE_LABEL=""
RUN_AUTH=false
VERSION_TARGETED=false

usage() {
  cat <<'EOF'
Usage: run-canary-smoke.sh --label TEXT [--auth] [--version-targeted]

Run public (and optional authenticated) smoke checks during production canary
deployments. On failure, reverse traffic to the prior stable Worker version.

Environment:
  NEW_VERSION_ID / STABLE_VERSION_ID   Required for automatic rollback.
  WORKER_VERSION_ID                  Used when --version-targeted is set.
  AUTH_SMOKE_OPTIONAL                Passed through to authenticated-smoke.sh.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --label)
      SMOKE_LABEL="${2:?--label requires text}"
      shift 2
      ;;
    --auth)
      RUN_AUTH=true
      shift
      ;;
    --version-targeted)
      VERSION_TARGETED=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$SMOKE_LABEL" ]; then
  echo "--label is required." >&2
  usage >&2
  exit 1
fi

if [ "$VERSION_TARGETED" = true ]; then
  export WORKER_VERSION_ID="${WORKER_VERSION_ID:-${NEW_VERSION_ID:-}}"
fi

rollback_on_failure() {
  local reason="$1"
  bash "${SCRIPT_DIR}/canary-rollback.sh" "$reason"
}

echo "Running canary smoke suite: ${SMOKE_LABEL}"

if ! bash "${SCRIPT_DIR}/production-smoke.sh"; then
  rollback_on_failure "Public smoke failed during ${SMOKE_LABEL}."
  exit 1
fi

if [ "$RUN_AUTH" = true ]; then
  if ! bash "${SCRIPT_DIR}/authenticated-smoke.sh"; then
    rollback_on_failure "Authenticated smoke failed during ${SMOKE_LABEL}."
    exit 1
  fi
fi

echo "Canary smoke suite passed: ${SMOKE_LABEL}."
