#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="${REPOSITORY_ROOT}/supabase/migrations"

PENDING_LINKED=false
PENDING_DB_URL=""

usage() {
  cat <<'EOF'
Usage: detect-pending-high-risk-migrations.sh [options]

Detect high-risk SQL patterns in migrations not yet applied on the remote database.

Options:
  --pending-linked   Read pending migrations from linked Supabase project.
  --pending-db-url URL
                     Read pending migrations from remote DB URL.

Outputs (stdout):
  high_risk=true|false
  Lists matching migration files on subsequent lines when high_risk=true.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --pending-linked)
      PENDING_LINKED=true
      shift
      ;;
    --pending-db-url)
      PENDING_DB_URL="${2:?--pending-db-url requires a database URL}"
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
  echo "Provide --pending-linked or --pending-db-url." >&2
  exit 1
fi

resolve_migration_file() {
  local version="$1"
  local match

  match="$(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name "${version}_*.sql" | head -1)"
  if [ -n "$match" ]; then
    echo "$match"
    return 0
  fi

  match="${MIGRATIONS_DIR}/${version}.sql"
  if [ -f "$match" ]; then
    echo "$match"
    return 0
  fi

  echo "Unable to resolve migration file for version ${version}." >&2
  return 1
}

collect_pending_files() {
  local list_output version file

  if [ -n "$PENDING_DB_URL" ]; then
    list_output="$(supabase migration list --db-url "$PENDING_DB_URL" --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}")"
  else
    list_output="$(supabase migration list --linked --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}")"
  fi

  while IFS= read -r line; do
    if [[ "$line" != *"|"* ]]; then
      continue
    fi

    local_col="$(echo "$line" | awk -F '|' '{print $1}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    remote_col="$(echo "$line" | awk -F '|' '{print $2}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

    if [ -z "$local_col" ] || [ "$local_col" = "Local" ] || [[ "$local_col" == *"---"* ]]; then
      continue
    fi

    if [ -n "$remote_col" ]; then
      continue
    fi

    version="$local_col"
    file="$(resolve_migration_file "$version")"
    printf '%s\n' "$file"
  done <<< "$list_output"
}

blocking_pattern='drop[[:space:]]+(table|column|view|function)|truncate[[:space:]]|delete[[:space:]]+from|rename[[:space:]]+(table|column)|cascade'
review_pattern='alter[[:space:]]+column.*set[[:space:]]+not[[:space:]]+null|alter[[:space:]]+column.*(type|set[[:space:]]+data[[:space:]]+type)|drop[[:space:]]+policy|replace[[:space:]]+policy|security[[:space:]]+definer|grant[[:space:]]+'
unbounded_update_pattern='^[[:space:]]*update[[:space:]]+[^;[:space:]]+[[:space:]]+set[[:space:]]+'
destructive_reviewed_marker='migration-safety:[[:space:]]*destructive-reviewed'

high_risk=false
declare -a high_risk_files=()

while IFS= read -r file; do
  [ -z "$file" ] && continue

  if head -n 20 "$file" | grep -Eiq '^[[:space:]]*--[[:space:]]*migration-phase:[[:space:]]*contract'; then
    high_risk=true
    high_risk_files+=("$file (contract-phase pending)")
    continue
  fi

  if ! head -n 20 "$file" | grep -Eiq '^[[:space:]]*--[[:space:]]*migration-phase:[[:space:]]*expand'; then
    matches="$(grep -Ein "$blocking_pattern" "$file" || true)"
    if [ -n "$matches" ]; then
      while IFS= read -r match_line; do
        [ -z "$match_line" ] && continue
        if head -n 10 "$file" | grep -Eiq "$destructive_reviewed_marker"; then
          continue
        fi
        high_risk=true
        high_risk_files+=("$file (legacy blocking SQL)")
        break
      done <<< "$matches"
    fi
  fi

  if grep -Eiq "$review_pattern" "$file"; then
    high_risk=true
    high_risk_files+=("$file (review-pattern SQL)")
  fi

  backfill_matches="$(grep -Ein "$unbounded_update_pattern" "$file" | grep -Eiv 'where' || true)"
  if [ -n "$backfill_matches" ]; then
    high_risk=true
    high_risk_files+=("$file (unbounded update)")
  fi

  lock_impact="$(sed -n 's/^[[:space:]]*--[[:space:]]*lock-impact:[[:space:]]*//p' "$file" | head -1 | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]*$//')"
  if [ "$lock_impact" = "high" ] || [ "$lock_impact" = "critical" ]; then
    high_risk=true
    high_risk_files+=("$file (lock-impact: ${lock_impact})")
  fi
done < <(collect_pending_files)

if [ "$high_risk" = true ]; then
  echo "high_risk=true"
  printf '%s\n' "${high_risk_files[@]}"
else
  echo "high_risk=false"
fi
