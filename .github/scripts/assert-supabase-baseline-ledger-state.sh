#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="${REPOSITORY_ROOT}/supabase/migrations"
ARCHIVED_CHECKPOINT="${REPOSITORY_ROOT}/supabase/_archived_migrations/20260802_checkpoint_prebaseline"

TARGET_ENV="${BASELINE_LEDGER_TARGET:-staging}"
CONNECTION_MODE=""
DB_URL=""
MIGRATION_LIST_FILE=""

usage() {
  cat <<'EOF'
Usage: assert-supabase-baseline-ledger-state.sh (--linked | --db-url URL) [options]

Fail fast before supabase db push when the remote migration ledger still reflects
the archived pre-baseline checkpoint instead of the single active baseline.

Options:
  --linked                     Read the remote ledger from the linked project.
  --db-url URL                 Read the remote ledger via a pooler/database URL.
  --migration-list-file PATH   Test hook: use a captured migration list fixture.
  --target NAME                Environment label for operator messages (default: staging).
  -h, --help                   Show this help.

The script prints migration version numbers only. It never prints URLs, passwords,
access tokens, or other secrets.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --linked)
      CONNECTION_MODE="linked"
      shift
      ;;
    --db-url)
      DB_URL="${2:?--db-url requires a database URL}"
      CONNECTION_MODE="db-url"
      shift 2
      ;;
    --migration-list-file)
      MIGRATION_LIST_FILE="${2:?--migration-list-file requires a path}"
      shift 2
      ;;
    --target)
      TARGET_ENV="${2:?--target requires a value}"
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

if [ -z "$CONNECTION_MODE" ]; then
  echo "A connection mode is required: --linked or --db-url." >&2
  usage >&2
  exit 1
fi

if [ "$CONNECTION_MODE" = "db-url" ] && [ -z "$DB_URL" ]; then
  echo "--db-url requires a database URL." >&2
  exit 1
fi

if [ ! -d "$ARCHIVED_CHECKPOINT" ]; then
  echo "Missing archived migration checkpoint: supabase/_archived_migrations/20260802_checkpoint_prebaseline" >&2
  exit 1
fi

collect_version_ids_from_sql_files() {
  local directory="$1"
  find "$directory" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' \
    | sed -nE 's/^([0-9]{14})_.+\.sql$/\1/p' \
    | sort -u
}

read_baseline_version() {
  local versions=()
  while IFS= read -r version; do
    versions+=("$version")
  done < <(collect_version_ids_from_sql_files "$MIGRATIONS_DIR")

  if [ "${#versions[@]}" -ne 1 ]; then
    echo "Expected exactly one active baseline migration in supabase/migrations." >&2
    collect_version_ids_from_sql_files "$MIGRATIONS_DIR" >&2 || true
    exit 1
  fi

  printf '%s' "${versions[0]}"
}

write_archived_versions_file() {
  local output_file="$1"
  collect_version_ids_from_sql_files "$ARCHIVED_CHECKPOINT" > "$output_file"

  if [ ! -s "$output_file" ]; then
    echo "Archived checkpoint contains no versioned SQL migrations." >&2
    exit 1
  fi
}

fetch_migration_list() {
  if [ -n "$MIGRATION_LIST_FILE" ]; then
    cat "$MIGRATION_LIST_FILE"
    return 0
  fi

  if [ "$CONNECTION_MODE" = "linked" ]; then
    supabase migration list --linked --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}"
    return 0
  fi

  supabase migration list --db-url "$DB_URL" --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}"
}

write_remote_versions_file() {
  local list_output="$1"
  local output_file="$2"

  awk '{
    remote = $0
    sub(/^[^|]*\|[[:space:]]*/, "", remote)
    sub(/[[:space:]]*\|.*$/, "", remote)
    gsub(/[[:space:]]/, "", remote)
    if (remote ~ /^[0-9]{14}$/) print remote
  }' <<< "$list_output" | sort -u > "$output_file"
}

print_reconciliation_instruction() {
  local baseline_version="$1"

  cat <<EOF
Remote migration ledger still matches the archived pre-baseline checkpoint.
Refusing to run supabase db push because this mismatch is not transient.

Next action:
  Workflow: Reconcile Supabase Baseline
  target: ${TARGET_ENV}
  expected_baseline_version: ${baseline_version}
  confirmation_token: I_UNDERSTAND_THIS_IS_A_METADATA_ONLY_RECONCILIATION
  execution_mode: plan-only

Review the uploaded plan-only artifact before any execute-ledger-repair dispatch.
EOF
}

print_drift_message() {
  local baseline_version="$1"
  local remote_versions_file="$2"
  local archived_versions_file="$3"

  echo "Remote migration ledger does not match the archived checkpoint or the single-baseline state." >&2
  echo "Expected either:" >&2
  echo "  - archived checkpoint versions only (requires manual reconciliation), or" >&2
  echo "  - exactly one remote version: ${baseline_version}" >&2
  echo "Remote versions:" >&2
  cat "$remote_versions_file" >&2
  echo "Archived checkpoint versions:" >&2
  cat "$archived_versions_file" >&2
}

assert_no_secret_leaks() {
  local text="$1"

  if printf '%s\n' "$text" | grep -Eiq 'postgresql://|postgres(\.[a-z0-9-]+)?\.supabase\.co|SUPABASE_|sbp_[A-Za-z0-9]|password='; then
    echo "Internal error: refusal message must not include secrets." >&2
    exit 1
  fi
}

baseline_version="$(read_baseline_version)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

archived_versions_file="${tmp_dir}/archived-versions.txt"
remote_versions_file="${tmp_dir}/remote-versions.txt"
write_archived_versions_file "$archived_versions_file"

if ! list_output="$(fetch_migration_list)"; then
  echo "Unable to read the remote migration ledger." >&2
  exit 1
fi

write_remote_versions_file "$list_output" "$remote_versions_file"

if [ ! -s "$remote_versions_file" ]; then
  message="$(print_drift_message "$baseline_version" "$remote_versions_file" "$archived_versions_file")"
  assert_no_secret_leaks "$message"
  printf '%s\n' "$message" >&2
  exit 1
fi

if cmp -s "$archived_versions_file" "$remote_versions_file"; then
  message="$(print_reconciliation_instruction "$baseline_version")"
  assert_no_secret_leaks "$message"
  printf '%s\n' "$message" >&2
  exit 1
fi

remote_count="$(wc -l < "$remote_versions_file" | tr -d ' ')"
if [ "$remote_count" -eq 1 ] && grep -Fxq "$baseline_version" "$remote_versions_file"; then
  if grep -Fxf "$archived_versions_file" "$remote_versions_file" >/dev/null; then
    message="$(print_drift_message "$baseline_version" "$remote_versions_file" "$archived_versions_file")"
    assert_no_secret_leaks "$message"
    printf '%s\n' "$message" >&2
    exit 1
  fi

  echo "Remote migration ledger matches the active baseline (${baseline_version}); db push may proceed."
  exit 0
fi

message="$(print_drift_message "$baseline_version" "$remote_versions_file" "$archived_versions_file")"
assert_no_secret_leaks "$message"
printf '%s\n' "$message" >&2
exit 1
