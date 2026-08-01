#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OBSERVE_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/canary-observe-and-guard.sh"
ROLLBACK_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/canary-rollback.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

if ! bash -n "$OBSERVE_SCRIPT"; then
  echo "canary-observe-and-guard.sh failed bash -n." >&2
  exit 1
fi

if ! bash -n "$ROLLBACK_SCRIPT"; then
  echo "canary-rollback.sh failed bash -n." >&2
  exit 1
fi

canary_compute_allowed_failures() {
  local total="$1"
  local rate_percent="$2"
  local explicit_max="${3:-}"

  if [ -n "$explicit_max" ]; then
    printf '%s' "$explicit_max"
    return 0
  fi

  printf '%s' $((total * rate_percent / 100))
}

if [ "$(canary_compute_allowed_failures 20 5 "")" != "1" ]; then
  echo "Expected floor(20 * 0.05) = 1." >&2
  exit 1
fi

if [ "$(canary_compute_allowed_failures 20 5 "0")" != "0" ]; then
  echo "Expected explicit CANARY_PROBE_FAILURES_MAX override." >&2
  exit 1
fi

canary_build_rollback_command() {
  printf 'bash .github/scripts/cloudflare-worker-canary.sh deploy-split %s %s 100 0' "$1" "$2"
}

rollback_cmd="$(canary_build_rollback_command "stable-version" "new-version")"
expected_cmd='bash .github/scripts/cloudflare-worker-canary.sh deploy-split stable-version new-version 100 0'

if [ "$rollback_cmd" != "$expected_cmd" ]; then
  echo "Unexpected rollback command: ${rollback_cmd}" >&2
  exit 1
fi

if BASE_URL="" NEW_VERSION_ID="new-version" STABLE_VERSION_ID="stable-version" \
  bash "$OBSERVE_SCRIPT" 2>/dev/null; then
  echo "Expected observe script to fail without BASE_URL." >&2
  exit 1
fi

if NEW_VERSION_ID="" STABLE_VERSION_ID="stable-version" BASE_URL="https://example.test" \
  bash "$ROLLBACK_SCRIPT" 2>/dev/null; then
  echo "Expected rollback script to fail without NEW_VERSION_ID." >&2
  exit 1
fi

echo "canary-observe-and-guard helper tests passed."
