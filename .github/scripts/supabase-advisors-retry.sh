#!/usr/bin/env bash
set -euo pipefail

MAX_ATTEMPTS="${SUPABASE_ADVISORS_MAX_ATTEMPTS:-3}"
RETRY_DELAY_SECONDS="${SUPABASE_ADVISORS_RETRY_DELAY_SECONDS:-10}"

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "SUPABASE_ADVISORS_MAX_ATTEMPTS must be a positive integer." >&2
  exit 1
fi

if ! [[ "$RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "SUPABASE_ADVISORS_RETRY_DELAY_SECONDS must be a non-negative integer." >&2
  exit 1
fi

is_transient_failure() {
  local advisor_output="$1"

  [[ "$advisor_output" =~ status[[:space:]]+5[0-9]{2} ]] ||
    [[ "$advisor_output" =~ connection[[:space:]]+(refused|reset) ]] ||
    [[ "$advisor_output" =~ (i/o|TLS[[:space:]]+handshake)[[:space:]]+timeout ]] ||
    [[ "$advisor_output" =~ context[[:space:]]+deadline[[:space:]]+exceeded ]] ||
    [[ "$advisor_output" =~ temporary[[:space:]]+failure[[:space:]]+in[[:space:]]+name[[:space:]]+resolution ]] ||
    [[ "$advisor_output" =~ no[[:space:]]+such[[:space:]]+host ]]
}

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "Running Supabase database advisors (attempt ${attempt}/${MAX_ATTEMPTS})..."

  if advisor_output="$(supabase db advisors --linked --type all --level warn --fail-on error 2>&1)"; then
    printf '%s\n' "$advisor_output"
    echo "Supabase database advisors completed."
    exit 0
  else
    advisor_exit_code=$?
  fi

  printf '%s\n' "$advisor_output" >&2

  if ! is_transient_failure "$advisor_output"; then
    echo "Supabase database advisors failed with a non-transient error; not retrying." >&2
    exit "$advisor_exit_code"
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    echo "Supabase database advisors failed after ${MAX_ATTEMPTS} attempts." >&2
    exit "$advisor_exit_code"
  fi

  echo "Supabase database advisors encountered a transient failure; retrying in ${RETRY_DELAY_SECONDS}s..." >&2
  sleep "$RETRY_DELAY_SECONDS"
  attempt=$((attempt + 1))
done
