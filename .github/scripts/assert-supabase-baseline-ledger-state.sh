#!/usr/bin/env bash
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPOSITORY_ROOT="${BASELINE_LEDGER_REPO_ROOT:-$SCRIPT_ROOT}"
MIGRATIONS_DIR="${REPOSITORY_ROOT}/supabase/migrations"

TARGET_ENV="${BASELINE_LEDGER_TARGET:-staging}"
LEDGER_POLICY="${BASELINE_LEDGER_POLICY:-staging-cutover}"
CONNECTION_MODE=""
DB_URL=""
MIGRATION_LIST_FILE=""
MANIFEST_FILE=""

usage() {
  cat <<'EOF'
Usage: assert-supabase-baseline-ledger-state.sh (--linked | --db-url URL) [options]

Fail fast before supabase db push when the remote migration ledger still reflects
the archived pre-baseline checkpoint instead of the active baseline state.

Options:
  --linked                     Read the remote ledger from the linked project.
  --db-url URL                 Read the remote ledger via a pooler/database URL.
  --migration-list-file PATH   Test hook: use a captured migration list fixture.
  --target NAME                Environment label for operator messages (default: staging).
  --policy NAME                Ledger policy: staging-cutover or active-prefix.
  --manifest PATH              Trusted compaction manifest (default: repo config).
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
    --policy)
      LEDGER_POLICY="${2:?--policy requires a value}"
      shift 2
      ;;
    --manifest)
      MANIFEST_FILE="${2:?--manifest requires a path}"
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

case "$LEDGER_POLICY" in
  staging-cutover|active-prefix) ;;
  *)
    echo "Unsupported ledger policy: ${LEDGER_POLICY}" >&2
    exit 1
    ;;
esac

# shellcheck source=/dev/null
source "${SCRIPT_ROOT}/.github/scripts/load-baseline-compaction-manifest.sh"
baseline_compaction_manifest_load "$REPOSITORY_ROOT" "$MANIFEST_FILE"

ARCHIVED_CHECKPOINT="$BASELINE_COMPACTION_CHECKPOINT_PATH"
baseline_version="$BASELINE_COMPACTION_BASELINE_VERSION"
archived_versions_file_path="$BASELINE_COMPACTION_ARCHIVED_VERSIONS_PATH"

if [ ! -d "$ARCHIVED_CHECKPOINT" ]; then
  echo "Missing archived migration checkpoint: ${BASELINE_COMPACTION_CHECKPOINT_DIRECTORY}" >&2
  exit 1
fi

collect_version_ids_from_sql_files() {
  local directory="$1"
  baseline_compaction_collect_versions_from_sql_dir "$directory"
}

read_active_versions_file() {
  local output_file="$1"
  collect_version_ids_from_sql_files "$MIGRATIONS_DIR" > "$output_file"

  if [ ! -s "$output_file" ]; then
    echo "No active migration versions found in supabase/migrations." >&2
    exit 1
  fi
}

validate_active_migration_shape() {
  local active_versions_file="$1"
  local active_count

  active_count="$(wc -l < "$active_versions_file" | tr -d ' ')"

  if [ "$LEDGER_POLICY" = "staging-cutover" ] && [ "$active_count" -ne 1 ]; then
    echo "Expected exactly one active baseline migration in supabase/migrations." >&2
    cat "$active_versions_file" >&2
    exit 1
  fi

  if [ "$LEDGER_POLICY" = "active-prefix" ] && [ "$active_count" -lt 1 ]; then
    echo "Expected at least one active migration in supabase/migrations." >&2
    exit 1
  fi

  if ! grep -Fxq "$baseline_version" "$active_versions_file"; then
    echo "Active migrations must include the trusted baseline version ${baseline_version}." >&2
    cat "$active_versions_file" >&2
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

  printf '%s\n' "$list_output" \
    | bash "${SCRIPT_ROOT}/.github/scripts/extract-supabase-remote-migration-versions.sh" \
    | sort -u > "$output_file"
}

print_reconciliation_instruction() {
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
  local remote_versions_file="$1"

  echo "Remote migration ledger does not match the archived checkpoint or the active baseline state." >&2
  echo "Expected either:" >&2
  echo "  - archived checkpoint versions only (requires manual reconciliation), or" >&2
  if [ "$LEDGER_POLICY" = "staging-cutover" ]; then
    echo "  - exactly one remote version: ${baseline_version}" >&2
  else
    echo "  - a valid applied prefix of the active migrations beginning with ${baseline_version}" >&2
  fi
  echo "Remote versions:" >&2
  cat "$remote_versions_file" >&2
  echo "Archived checkpoint versions:" >&2
  cat "$archived_versions_file_path" >&2
  echo "Active migration versions:" >&2
  cat "$active_versions_file" >&2
}

assert_no_secret_leaks() {
  local text="$1"

  if printf '%s\n' "$text" | grep -Eiq 'postgresql://|postgres(\.[a-z0-9-]+)?\.supabase\.co|SUPABASE_|sbp_[A-Za-z0-9]|password='; then
    echo "Internal error: refusal message must not include secrets." >&2
    exit 1
  fi
}

remote_is_valid_active_prefix() {
  local remote_versions_file="$1"
  local active_versions_file="$2"
  local remote_count
  local active_count
  local index=1

  remote_count="$(wc -l < "$remote_versions_file" | tr -d ' ')"
  active_count="$(wc -l < "$active_versions_file" | tr -d ' ')"

  if [ "$remote_count" -eq 0 ] || [ "$remote_count" -gt "$active_count" ]; then
    return 1
  fi

  while [ "$index" -le "$remote_count" ]; do
    remote_version="$(sed -n "${index}p" "$remote_versions_file")"
    active_version="$(sed -n "${index}p" "$active_versions_file")"
    if [ "$remote_version" != "$active_version" ]; then
      return 1
    fi
    index=$((index + 1))
  done

  return 0
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

active_versions_file="${tmp_dir}/active-versions.txt"
remote_versions_file="${tmp_dir}/remote-versions.txt"
normalized_archived_versions_file="${tmp_dir}/archived-versions-normalized.txt"

read_active_versions_file "$active_versions_file"
validate_active_migration_shape "$active_versions_file"
baseline_compaction_normalize_versions_file "$archived_versions_file_path" "$normalized_archived_versions_file"

if ! list_output="$(fetch_migration_list)"; then
  echo "Unable to read the remote migration ledger." >&2
  exit 1
fi

write_remote_versions_file "$list_output" "$remote_versions_file"

if [ ! -s "$remote_versions_file" ]; then
  message="$(print_drift_message "$remote_versions_file")"
  assert_no_secret_leaks "$message"
  printf '%s\n' "$message" >&2
  exit 1
fi

if cmp -s "$normalized_archived_versions_file" "$remote_versions_file"; then
  message="$(print_reconciliation_instruction)"
  assert_no_secret_leaks "$message"
  printf '%s\n' "$message" >&2
  exit 1
fi

if grep -Fxf "$normalized_archived_versions_file" "$remote_versions_file" >/dev/null; then
  message="$(print_drift_message "$remote_versions_file")"
  assert_no_secret_leaks "$message"
  printf '%s\n' "$message" >&2
  exit 1
fi

if [ "$LEDGER_POLICY" = "staging-cutover" ]; then
  remote_count="$(wc -l < "$remote_versions_file" | tr -d ' ')"
  if [ "$remote_count" -eq 1 ] && grep -Fxq "$baseline_version" "$remote_versions_file"; then
    echo "Remote migration ledger matches the active baseline (${baseline_version}); db push may proceed."
    exit 0
  fi
else
  if remote_is_valid_active_prefix "$remote_versions_file" "$active_versions_file"; then
    echo "Remote migration ledger matches a valid applied prefix of the active migrations; db push planning may proceed."
    exit 0
  fi
fi

message="$(print_drift_message "$remote_versions_file")"
assert_no_secret_leaks "$message"
printf '%s\n' "$message" >&2
exit 1
