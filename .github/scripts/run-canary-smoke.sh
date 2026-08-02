#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SMOKE_LABEL=""
SMOKE_SUITE="public"
VERSION_TARGETED=false

usage() {
  cat <<'EOF'
Usage: run-canary-smoke.sh --label TEXT [--public-only|--with-test-auth] [--version-targeted]

Run smoke checks during production canary deployments. On failure, reverse traffic
to the prior stable Worker version.

Suites:
  --public-only (default)   Public HTTP smoke only. Required for production canary.
  --with-test-auth            Non-production authenticated smoke using test Turnstile
                              keys. Requires AUTH_SMOKE_TARGET_ENV=staging|local.

Environment:
  NEW_VERSION_ID / STABLE_VERSION_ID   Required for automatic rollback.
  WORKER_VERSION_ID                  Used when --version-targeted is set.
  AUTH_SMOKE_TARGET_ENV              Required for --with-test-auth.
  AUTH_SMOKE_TURNSTILE_MODE          Defaults to test for --with-test-auth.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --label)
      SMOKE_LABEL="${2:?--label requires text}"
      shift 2
      ;;
    --public-only)
      SMOKE_SUITE="public"
      shift
      ;;
    --with-test-auth)
      SMOKE_SUITE="test-auth"
      shift
      ;;
    --auth)
      echo "--auth is no longer supported in production canary smoke." >&2
      echo "Use --public-only for production canary suites or --with-test-auth in staging/local only." >&2
      exit 1
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

echo "Running canary smoke suite (${SMOKE_SUITE}): ${SMOKE_LABEL}"

if [ "$SMOKE_SUITE" = "test-auth" ]; then
  export AUTH_SMOKE_TURNSTILE_MODE="${AUTH_SMOKE_TURNSTILE_MODE:-test}"
  if [ -z "${AUTH_SMOKE_TARGET_ENV:-}" ]; then
    echo "AUTH_SMOKE_TARGET_ENV is required for --with-test-auth (staging or local)." >&2
    exit 1
  fi
  if [ "$AUTH_SMOKE_TARGET_ENV" = "production" ]; then
    echo "Production canary smoke cannot use --with-test-auth." >&2
    echo "Use the protected manual production authentication gate instead." >&2
    exit 1
  fi
fi

if ! bash "${SCRIPT_DIR}/production-smoke.sh"; then
  rollback_on_failure "Public smoke failed during ${SMOKE_LABEL}."
  exit 1
fi

if [ "$SMOKE_SUITE" = "test-auth" ]; then
  if ! bash "${SCRIPT_DIR}/authenticated-smoke.sh"; then
    rollback_on_failure "Authenticated smoke failed during ${SMOKE_LABEL}."
    exit 1
  fi
fi

echo "Canary smoke suite passed: ${SMOKE_LABEL}."
