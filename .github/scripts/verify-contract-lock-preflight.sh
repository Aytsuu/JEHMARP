#!/usr/bin/env bash
set -euo pipefail

PENDING_LINKED=false
PENDING_DB_URL=""
CONTRACT_LOCK_PREFLIGHT="${CONTRACT_LOCK_PREFLIGHT:-true}"
LOCK_CHECK_TIMEOUT_SECONDS="${LOCK_CHECK_TIMEOUT_SECONDS:-60}"
ADVISORS_TIMEOUT_SECONDS="${ADVISORS_TIMEOUT_SECONDS:-120}"

usage() {
  cat <<'EOF'
Usage: verify-contract-lock-preflight.sh [options]

Run Supabase advisors and a pg_locks / long-running query preflight before Contract apply.

Options:
  --linked                 Use linked Supabase project (default when neither flag is set).
  --db-url URL             Use explicit database URL instead of linked project.

Environment:
  CONTRACT_LOCK_PREFLIGHT=true   Fail when advisors or lock checks report unsafe state.
  LOCK_CHECK_TIMEOUT_SECONDS     Long-running query threshold (default 60).
  ADVISORS_TIMEOUT_SECONDS       Wall-clock timeout for advisors subprocess (default 120).
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --linked)
      PENDING_LINKED=true
      shift
      ;;
    --db-url)
      PENDING_DB_URL="${2:?--db-url requires a database URL}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      echo "Unexpected positional argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ "$PENDING_LINKED" = false ] && [ -z "$PENDING_DB_URL" ]; then
  PENDING_LINKED=true
fi

if ! [[ "$LOCK_CHECK_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "LOCK_CHECK_TIMEOUT_SECONDS must be a non-negative integer." >&2
  exit 1
fi

if ! [[ "$ADVISORS_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo "ADVISORS_TIMEOUT_SECONDS must be a positive integer." >&2
  exit 1
fi

run_db_query() {
  local sql="$1"
  if [ -n "$PENDING_DB_URL" ]; then
    supabase db query --db-url "$PENDING_DB_URL" --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}" --output csv "$sql"
  else
    supabase db query --linked --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}" --output csv "$sql"
  fi
}

advisors_failed=false
lock_check_failed=false

echo "Contract lock/preflight: CONTRACT_LOCK_PREFLIGHT=${CONTRACT_LOCK_PREFLIGHT}"

if [ "$PENDING_LINKED" = true ] || [ -n "$PENDING_DB_URL" ]; then
  echo "Running Supabase database advisors (timeout ${ADVISORS_TIMEOUT_SECONDS}s)..."
  if timeout "$ADVISORS_TIMEOUT_SECONDS" bash .github/scripts/supabase-advisors-retry.sh; then
    echo "Supabase advisors completed."
  else
    advisors_exit=$?
    echo "Supabase advisors failed or timed out (exit ${advisors_exit})." >&2
    advisors_failed=true
  fi
else
  echo "Skipping advisors — no linked project or db URL." >&2
  advisors_failed=true
fi

lock_sql="
SELECT
  l.pid,
  l.locktype,
  COALESCE(l.relation::text, l.virtualxid::text, l.transactionid::text) AS resource,
  l.mode,
  l.granted,
  a.state,
  EXTRACT(EPOCH FROM (now() - a.query_start))::int AS query_age_seconds,
  LEFT(a.query, 200) AS query_sample
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE a.pid <> pg_backend_pid()
  AND (
    l.granted = false
    OR (
      a.state = 'active'
      AND a.query_start IS NOT NULL
      AND now() - a.query_start > (${LOCK_CHECK_TIMEOUT_SECONDS} * interval '1 second')
      AND a.query NOT ILIKE '%pg_stat_activity%'
    )
  )
ORDER BY query_age_seconds DESC NULLS LAST, l.pid;
"

echo "Running lock / long-running query check (threshold ${LOCK_CHECK_TIMEOUT_SECONDS}s)..."
if lock_output="$(run_db_query "$lock_sql" 2>&1)"; then
  data_rows="$(printf '%s\n' "$lock_output" | awk 'NR>1 && NF>0 {count++} END {print count+0}')"
  if [ "$data_rows" -gt 0 ]; then
    echo "Unsafe locks or long-running queries detected:" >&2
    printf '%s\n' "$lock_output" >&2
    lock_check_failed=true
  else
    echo "No blocking locks or long-running queries above threshold."
  fi
else
  echo "Lock check query failed:" >&2
  printf '%s\n' "$lock_output" >&2
  lock_check_failed=true
fi

if [ "$CONTRACT_LOCK_PREFLIGHT" != "true" ]; then
  if [ "$advisors_failed" = true ] || [ "$lock_check_failed" = true ]; then
    echo "Contract lock/preflight issues detected but CONTRACT_LOCK_PREFLIGHT=false — continuing."
    exit 0
  fi
  echo "Contract lock/preflight passed."
  exit 0
fi

if [ "$advisors_failed" = true ] || [ "$lock_check_failed" = true ]; then
  echo "Contract lock/preflight failed (CONTRACT_LOCK_PREFLIGHT=true)." >&2
  exit 1
fi

echo "Contract lock/preflight passed."
exit 0
