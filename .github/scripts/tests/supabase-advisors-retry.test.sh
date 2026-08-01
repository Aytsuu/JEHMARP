#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/supabase-advisors-retry.sh"
STATE_FILE="$(mktemp)"
trap 'rm -f "$STATE_FILE"' EXIT

supabase() {
  [ "$1" = "db" ]
  [ "$2" = "advisors" ]
  [ "$3" = "--linked" ]
  [ "$4" = "--type" ]
  [ "$5" = "all" ]
  [ "$6" = "--level" ]
  [ "$7" = "warn" ]
  [ "$8" = "--fail-on" ]
  [ "$9" = "error" ]
  local calls
  calls="$(cat "$SUPABASE_FAKE_STATE_FILE")"
  calls=$((calls + 1))
  printf '%s' "$calls" > "$SUPABASE_FAKE_STATE_FILE"

  case "${SUPABASE_FAKE_MODE}" in
    success)
      return 0
      ;;
    transient-then-success)
      if [ "$calls" -eq 1 ]; then
        echo "unexpected performance advisors status 502: Bad Gateway" >&2
        return 1
      fi
      return 0
      ;;
    permanent-failure)
      echo "invalid access token" >&2
      return 1
      ;;
  esac

  echo "Unknown fake Supabase mode: ${SUPABASE_FAKE_MODE}" >&2
  return 99
}

export -f supabase

printf '0' > "$STATE_FILE"
SUPABASE_FAKE_STATE_FILE="$STATE_FILE" \
  SUPABASE_FAKE_MODE=success \
  SUPABASE_ADVISORS_MAX_ATTEMPTS=2 \
  SUPABASE_ADVISORS_RETRY_DELAY_SECONDS=0 \
  bash "$SCRIPT_PATH" >/dev/null
[ "$(cat "$STATE_FILE")" -eq 1 ]

printf '0' > "$STATE_FILE"
SUPABASE_FAKE_STATE_FILE="$STATE_FILE" \
  SUPABASE_FAKE_MODE=transient-then-success \
  SUPABASE_ADVISORS_MAX_ATTEMPTS=2 \
  SUPABASE_ADVISORS_RETRY_DELAY_SECONDS=0 \
  bash "$SCRIPT_PATH" >/dev/null
[ "$(cat "$STATE_FILE")" -eq 2 ]

printf '0' > "$STATE_FILE"
if SUPABASE_FAKE_STATE_FILE="$STATE_FILE" \
  SUPABASE_FAKE_MODE=permanent-failure \
  SUPABASE_ADVISORS_MAX_ATTEMPTS=2 \
  SUPABASE_ADVISORS_RETRY_DELAY_SECONDS=0 \
  bash "$SCRIPT_PATH" >/dev/null 2>&1; then
  echo "Expected a non-transient advisor failure to fail immediately." >&2
  exit 1
fi
[ "$(cat "$STATE_FILE")" -eq 1 ]

if SUPABASE_FAKE_STATE_FILE="$STATE_FILE" \
  SUPABASE_FAKE_MODE=success \
  SUPABASE_ADVISORS_MAX_ATTEMPTS=0 \
  SUPABASE_ADVISORS_RETRY_DELAY_SECONDS=0 \
  bash "$SCRIPT_PATH" >/dev/null 2>&1; then
  echo "Expected an invalid maximum attempt count to fail." >&2
  exit 1
fi
