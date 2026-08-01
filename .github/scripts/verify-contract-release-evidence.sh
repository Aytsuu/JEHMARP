#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="${REPOSITORY_ROOT}/supabase/migrations"

EVIDENCE_DIR=""
BACKUP_RUN_ID=""
BACKUP_ARTIFACT_DIR=""
TODAY_OVERRIDE=""
PENDING_LINKED=false
PENDING_DB_URL=""
declare -a EXPLICIT_FILES=()

usage() {
  cat <<'EOF'
Usage: verify-contract-release-evidence.sh [options]

Fail-closed validation for Contract release evidence and pending migrations.

Options:
  --evidence-dir DIR           Optional committed evidence pack (contract-evidence/).
  --backup-run-id ID           Required Backup and Rollback workflow run id.
  --backup-artifact-dir DIR    Required path to downloaded backup workflow artifact.
  --pending-linked             Validate migrations not yet applied on the linked project.
  --pending-db-url URL         Validate migrations not yet applied on the remote DB at URL.
  --files FILE ...             Explicit migration file paths to validate.
  --today YYYY-MM-DD           Override today's date (tests only).

Contract release requires:
  - backup_run_id present and matching backup-verified references
  - downloaded backup artifact with at least one SQL or manifest file
  - every pending migration is migration-phase: contract (no Expand-only mix)
  - complete strict Contract metadata on each pending migration
  - compatibility-window-complete date on or before today
  - non-empty legacy-usage-confirmed-zero and backup-verified headers
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --evidence-dir)
      EVIDENCE_DIR="${2:?--evidence-dir requires a directory}"
      shift 2
      ;;
    --backup-run-id)
      BACKUP_RUN_ID="${2:?--backup-run-id requires a run id}"
      shift 2
      ;;
    --backup-artifact-dir)
      BACKUP_ARTIFACT_DIR="${2:?--backup-artifact-dir requires a directory}"
      shift 2
      ;;
    --pending-linked)
      PENDING_LINKED=true
      shift
      ;;
    --pending-db-url)
      PENDING_DB_URL="${2:?--pending-db-url requires a database URL}"
      shift 2
      ;;
    --today)
      TODAY_OVERRIDE="${2:?--today requires YYYY-MM-DD}"
      shift 2
      ;;
    --files)
      shift
      while [ "$#" -gt 0 ] && [[ "$1" != --* ]]; do
        EXPLICIT_FILES+=("$1")
        shift
      done
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
      EXPLICIT_FILES+=("$1")
      shift
      ;;
  esac
done

if [ -z "$BACKUP_RUN_ID" ]; then
  echo "Missing required --backup-run-id." >&2
  exit 1
fi

if [ -z "$BACKUP_ARTIFACT_DIR" ]; then
  echo "Missing required --backup-artifact-dir." >&2
  exit 1
fi

if [ ! -d "$BACKUP_ARTIFACT_DIR" ]; then
  echo "Backup artifact directory not found: ${BACKUP_ARTIFACT_DIR}" >&2
  exit 1
fi

get_header_value() {
  local file="$1"
  local key="$2"

  sed -n "s/^[[:space:]]*--[[:space:]]*${key}:[[:space:]]*//p" "$file" | head -1 | sed 's/[[:space:]]*$//'
}

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

collect_pending_remote_files() {
  local list_output version file

  if [ -n "$PENDING_DB_URL" ]; then
    if ! list_output="$(supabase migration list --db-url "$PENDING_DB_URL" --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}")"; then
      echo "supabase migration list --db-url failed." >&2
      return 1
    fi
  else
    if ! list_output="$(supabase migration list --linked --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}")"; then
      echo "supabase migration list --linked failed." >&2
      return 1
    fi
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
    EXPLICIT_FILES+=("$file")
  done <<< "$list_output"
}

if [ "$PENDING_LINKED" = true ] || [ -n "$PENDING_DB_URL" ]; then
  collect_pending_remote_files
fi

declare -a UNIQUE_FILES=()
declare -A seen_files=()

for file in "${EXPLICIT_FILES[@]}"; do
  [ -z "$file" ] && continue

  if [[ "$file" != /* ]]; then
    file="${REPOSITORY_ROOT}/${file}"
  fi

  if [ ! -f "$file" ]; then
    echo "Migration file not found: ${file}" >&2
    exit 1
  fi

  if [ -z "${seen_files[$file]:-}" ]; then
    seen_files[$file]=1
    UNIQUE_FILES+=("$file")
  fi
done

if [ "${#UNIQUE_FILES[@]}" -eq 0 ]; then
  echo "No pending Contract migrations selected for evidence validation." >&2
  exit 1
fi

today="${TODAY_OVERRIDE:-$(date -u +%Y-%m-%d)}"

backup_artifact_count="$(
  find "$BACKUP_ARTIFACT_DIR" -type f \( -name '*.sql' -o -name '*.csv' -o -name '*.md' -o -name '*.json' -o -name '*.txt' \) | wc -l | tr -d '[:space:]'
)"
if [ "${backup_artifact_count}" -eq 0 ]; then
  echo "Backup artifact directory has no recognizable backup files: ${BACKUP_ARTIFACT_DIR}" >&2
  exit 1
fi

if [ -n "$EVIDENCE_DIR" ]; then
  if [ ! -d "$EVIDENCE_DIR" ]; then
    echo "Evidence directory not found: ${EVIDENCE_DIR}" >&2
    exit 1
  fi

  if [ -f "${EVIDENCE_DIR}/backup-run-id.txt" ]; then
    evidence_run_id="$(tr -d '[:space:]' < "${EVIDENCE_DIR}/backup-run-id.txt")"
    if [ "$evidence_run_id" != "$BACKUP_RUN_ID" ]; then
      echo "Evidence backup-run-id mismatch: expected ${BACKUP_RUN_ID}, got ${evidence_run_id}." >&2
      exit 1
    fi
  fi
fi

reference_contains_run_id() {
  local reference="$1"

  if [ -z "$reference" ]; then
    return 1
  fi

  if [[ "$reference" == *"${BACKUP_RUN_ID}"* ]]; then
    return 0
  fi

  if [ -n "$EVIDENCE_DIR" ] && [ -f "${EVIDENCE_DIR}/backup-run-id.txt" ]; then
    return 0
  fi

  return 1
}

overall_failed=false
contract_count=0
expand_count=0
legacy_count=0

echo "Validating Contract release evidence for ${#UNIQUE_FILES[@]} pending migration file(s):"

for file in "${UNIQUE_FILES[@]}"; do
  printf '  %s\n' "$file"

  phase="$(get_header_value "$file" "migration-phase")"
  if [ "$phase" = "contract" ]; then
    contract_count=$((contract_count + 1))
  elif [ "$phase" = "expand" ]; then
    expand_count=$((expand_count + 1))
    echo "Expand-phase pending migration is not allowed in Contract release: ${file}" >&2
    overall_failed=true
    continue
  else
    legacy_count=$((legacy_count + 1))
    echo "Pending migration without contract phase metadata is not allowed: ${file}" >&2
    overall_failed=true
    continue
  fi

  for key in owner lock-impact backfill compatible-with forward-repair compatibility-window-complete legacy-usage-confirmed-zero backup-verified; do
    value="$(get_header_value "$file" "$key")"
    if [ -z "$value" ]; then
      echo "Missing required Contract header -- ${key}: in ${file}" >&2
      overall_failed=true
    fi
  done

  window_complete="$(get_header_value "$file" "compatibility-window-complete")"
  if [ -n "$window_complete" ]; then
    if ! [[ "$window_complete" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      echo "Invalid compatibility-window-complete '${window_complete}' in ${file}. Expected YYYY-MM-DD." >&2
      overall_failed=true
    elif [[ "$window_complete" > "$today" ]]; then
      echo "Compatibility window not complete in ${file}: ${window_complete} is after ${today}." >&2
      overall_failed=true
    fi
  fi

  legacy_usage="$(get_header_value "$file" "legacy-usage-confirmed-zero")"
  if [ -z "$legacy_usage" ]; then
    echo "legacy-usage-confirmed-zero must be non-empty in ${file}." >&2
    overall_failed=true
  elif [ -n "$EVIDENCE_DIR" ] && [ -f "${EVIDENCE_DIR}/legacy-usage-confirmed-zero.txt" ]; then
    evidence_legacy="$(tr -d '\r' < "${EVIDENCE_DIR}/legacy-usage-confirmed-zero.txt" | head -1 | sed 's/[[:space:]]*$//')"
    if [ -n "$evidence_legacy" ] && [ "$evidence_legacy" != "$legacy_usage" ]; then
      echo "legacy-usage-confirmed-zero mismatch in evidence pack for ${file}." >&2
      overall_failed=true
    fi
  fi

  backup_verified="$(get_header_value "$file" "backup-verified")"
  if [ -z "$backup_verified" ]; then
    echo "backup-verified must be non-empty in ${file}." >&2
    overall_failed=true
  elif ! reference_contains_run_id "$backup_verified"; then
    echo "backup-verified reference in ${file} must include backup run id ${BACKUP_RUN_ID}." >&2
    overall_failed=true
  fi
done

if [ "$contract_count" -eq 0 ]; then
  echo "Contract release requires at least one pending contract-phase migration." >&2
  overall_failed=true
fi

if [ "$expand_count" -gt 0 ] || [ "$legacy_count" -gt 0 ]; then
  echo "Contract release refused: pending set must be Contract-phase only (found expand=${expand_count}, legacy=${legacy_count})." >&2
  echo "Apply Expand migrations via Deploy Production; apply Contract migrations only via deploy-contract-release.yml." >&2
  overall_failed=true
fi

if [ "$overall_failed" = true ]; then
  exit 1
fi

echo "Contract release evidence validation passed for backup run ${BACKUP_RUN_ID} (${contract_count} contract migration(s))."
