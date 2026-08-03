#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=migration-diff-lib.sh
source "${SCRIPT_DIR}/migration-diff-lib.sh"
MIGRATIONS_DIR="${REPOSITORY_ROOT}/supabase/migrations"

DIFF_BASE=""
declare -a EXPLICIT_FILES=()

usage() {
  cat <<'EOF'
Usage: validate-expand-migration-sql.sh [options] [FILE ...]

Enforce additive-only SQL for migration-phase: expand files.

Options:
  --diff-base REF   Validate migration files changed since REF.
  --files           Treat remaining arguments as explicit migration file paths.

Environment:
  MIGRATION_REVIEWED=true  Allow contract-phase destructive SQL when metadata is incomplete.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --diff-base)
      DIFF_BASE="${2:?--diff-base requires a git ref}"
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
    --)
      shift
      while [ "$#" -gt 0 ]; do
        EXPLICIT_FILES+=("$1")
        shift
      done
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

get_header_value() {
  local file="$1"
  local key="$2"

  sed -n "s/^[[:space:]]*--[[:space:]]*${key}:[[:space:]]*//p" "$file" | head -1 | sed 's/[[:space:]]*$//'
}

collect_diff_base_files() {
  local path

  if ! migration_diff_lib_assert_git_ref "$REPOSITORY_ROOT" "$DIFF_BASE"; then
    return 1
  fi

  while IFS= read -r path; do
    [ -z "$path" ] && continue
    EXPLICIT_FILES+=("${REPOSITORY_ROOT}/${path}")
  done < <(migration_diff_lib_emit_current_scanable_paths "$REPOSITORY_ROOT" "$DIFF_BASE")
}

if [ -n "$DIFF_BASE" ]; then
  collect_diff_base_files
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
  echo "No migration files selected for expand SQL validation."
  exit 0
fi

# Destructive / contract-territory patterns — forbidden in expand-phase migrations.
DESTRUCTIVE_PATTERN='drop[[:space:]]+(table|column|view|function|policy)|truncate[[:space:]]|delete[[:space:]]+from|rename[[:space:]]+(table|column)|cascade|alter[[:space:]]+[^;]*drop'

# Risky DDL that expand should avoid (nullable add + backfill path expected instead).
SET_NOT_NULL_PATTERN='alter[[:space:]]+column[^;]*set[[:space:]]+not[[:space:]]+null'
TYPE_REWRITE_PATTERN='alter[[:space:]]+column[^;]*(type|set[[:space:]]+data[[:space:]]+type)'

# Allowed with caution — warn only for expand (grants widen exposure).
GRANT_PATTERN='^[[:space:]]*grant[[:space:]]+'

expand_path_note_pattern='expand-path|additive-only|nullable-first|deferred-constraint'

scan_file_lines() {
  local file="$1"
  local pattern="$2"

  grep -Ein "${pattern}" "$file" || true
}

has_expand_path_note() {
  local file="$1"
  head -n 30 "$file" | grep -Eiq "${expand_path_note_pattern}"
}

destructive_reviewed_marker='migration-safety:[[:space:]]*destructive-reviewed'

has_destructive_reviewed_marker() {
  local file="$1"
  head -n 10 "$file" | grep -Eiq "${destructive_reviewed_marker}"
}

validate_expand_file() {
  local file="$1"
  local destructive_matches
  local set_not_null_matches
  local type_rewrite_matches
  local grant_matches
  local failed=false

  destructive_matches="$(scan_file_lines "$file" "$DESTRUCTIVE_PATTERN")"
  if [ -n "$destructive_matches" ]; then
    if has_destructive_reviewed_marker "$file"; then
      echo "Acknowledged destructive SQL in expand migration: ${file}"
    else
      echo "Expand migration contains destructive SQL (not allowed in expand phase): ${file}" >&2
      echo "${destructive_matches}" >&2
      failed=true
    fi
  fi

  set_not_null_matches="$(scan_file_lines "$file" "$SET_NOT_NULL_PATTERN")"
  if [ -n "$set_not_null_matches" ]; then
    if has_expand_path_note "$file"; then
      echo "WARN: ${file} sets NOT NULL in expand phase (expand-path note present; verify backfill completed)."
    else
      echo "Expand migration sets NOT NULL without expand-path note: ${file}" >&2
      echo "${set_not_null_matches}" >&2
      failed=true
    fi
  fi

  type_rewrite_matches="$(scan_file_lines "$file" "$TYPE_REWRITE_PATTERN")"
  if [ -n "$type_rewrite_matches" ]; then
    if has_expand_path_note "$file"; then
      echo "WARN: ${file} rewrites column type in expand phase (expand-path note present; verify compatibility)."
    else
      echo "Expand migration rewrites column type without expand-path note: ${file}" >&2
      echo "${type_rewrite_matches}" >&2
      failed=true
    fi
  fi

  grant_matches="$(scan_file_lines "$file" "$GRANT_PATTERN")"
  if [ -n "$grant_matches" ]; then
    echo "WARN: ${file} contains GRANT statements; confirm exposure is intentional."
    echo "${grant_matches}"
  fi

  if [ "$failed" = true ]; then
    return 1
  fi

  return 0
}

echo "Validating expand SQL for ${#UNIQUE_FILES[@]} file(s):"
printf '  %s\n' "${UNIQUE_FILES[@]}"

overall_failed=false
expand_file_count=0
skipped_legacy_count=0
skipped_contract_count=0

for file in "${UNIQUE_FILES[@]}"; do
  phase="$(get_header_value "$file" "migration-phase")"

  if [ -z "$phase" ]; then
    skipped_legacy_count=$((skipped_legacy_count + 1))
    echo "SKIP: ${file} has no migration-phase header (legacy; expand SQL rules not applied)."
    continue
  fi

  if [ "$phase" = "contract" ]; then
    skipped_contract_count=$((skipped_contract_count + 1))
    echo "SKIP: ${file} is contract-phase (destructive SQL allowed with Contract metadata)."
    continue
  fi

  if [ "$phase" != "expand" ]; then
    echo "Invalid migration-phase '${phase}' in ${file}. Expected expand or contract." >&2
    overall_failed=true
    continue
  fi

  expand_file_count=$((expand_file_count + 1))
  if ! validate_expand_file "$file"; then
    overall_failed=true
  fi
done

if [ "$expand_file_count" -eq 0 ]; then
  echo "No expand-phase migration files in selection (${skipped_legacy_count} legacy, ${skipped_contract_count} contract skipped)."
fi

if [ "$overall_failed" = true ]; then
  exit 1
fi

echo "Expand SQL validation passed."
