#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="${REPOSITORY_ROOT}/supabase/migrations"

STRICT_MODE=false
EXPAND_ONLY_MODE=false
REQUIRE_PHASE_IF_PRESENT=false
REQUIRE_PHASE_FOR_ADDED=false
DIFF_BASE=""
PENDING_LINKED=false
PENDING_DB_URL=""
declare -a EXPLICIT_FILES=()
declare -a ADDED_FILES=()
declare -A added_file_map=()

usage() {
  cat <<'EOF'
Usage: validate-migration-phase-metadata.sh [options] [FILE ...]

Validate Expand/Contract migration header metadata.

Options:
  --strict          Require full metadata headers (production-bound checks).
  --expand-only     Block contract-phase migrations unless MIGRATION_PHASE_ALLOW_CONTRACT=true.
  --diff-base REF   Validate migration files changed since REF (e.g. origin/dev).
  --pending-linked  Validate migration files not yet applied on the linked remote project.
  --pending-db-url URL
                    Validate migration files not yet applied on the remote DB at URL.
  --require-phase-if-present
                    Strictly validate files that declare migration-phase; warn on legacy files
                    without headers instead of failing the whole corpus.
  --require-phase-for-added | --mandatory-for-new
                    Require complete metadata for newly added migration files (git status A).
                    Modified legacy files remain warn-only when combined with
                    --require-phase-if-present. Requires --diff-base or explicit --added-files.
  --added-files     Mark the following paths as newly added (for use with --files mode).
  --changed-files   Alias for --require-phase-if-present (PR changed-file validation mode).
  --files           Treat remaining arguments as explicit migration file paths.

Environment:
  MIGRATION_PHASE_ALLOW_CONTRACT=true  Allow contract migrations during --expand-only gating.
  MIGRATION_REVIEWED=true              Allow incomplete contract metadata when PR is reviewed.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --strict)
      STRICT_MODE=true
      shift
      ;;
    --expand-only)
      EXPAND_ONLY_MODE=true
      shift
      ;;
    --diff-base)
      DIFF_BASE="${2:?--diff-base requires a git ref}"
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
    --require-phase-if-present|--changed-files)
      REQUIRE_PHASE_IF_PRESENT=true
      shift
      ;;
    --require-phase-for-added|--mandatory-for-new)
      REQUIRE_PHASE_FOR_ADDED=true
      shift
      ;;
    --added-files)
      shift
      while [ "$#" -gt 0 ] && [[ "$1" != --* ]]; do
        ADDED_FILES+=("$1")
        shift
      done
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

normalize_repo_path() {
  local path="$1"

  if [[ "$path" != /* ]]; then
    path="${REPOSITORY_ROOT}/${path}"
  fi

  echo "$path"
}

mark_added_file() {
  local file="$1"
  file="$(normalize_repo_path "$file")"
  added_file_map[$file]=1
}

collect_diff_base_files() {
  local changed_files
  local added_files

  if ! git -C "$REPOSITORY_ROOT" rev-parse --verify "${DIFF_BASE}" >/dev/null 2>&1; then
    echo "Git ref not found: ${DIFF_BASE}" >&2
    return 1
  fi

  changed_files="$(git -C "$REPOSITORY_ROOT" diff --name-only "${DIFF_BASE}"...HEAD -- supabase/migrations || true)"
  if [ -z "$changed_files" ]; then
    return 0
  fi

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    EXPLICIT_FILES+=("${REPOSITORY_ROOT}/${file}")
  done <<< "$changed_files"

  if [ "$REQUIRE_PHASE_FOR_ADDED" = true ]; then
    added_files="$(git -C "$REPOSITORY_ROOT" diff --diff-filter=A --name-only "${DIFF_BASE}"...HEAD -- supabase/migrations || true)"
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      mark_added_file "$file"
    done <<< "$added_files"
  fi
}

if [ "$PENDING_LINKED" = true ] || [ -n "$PENDING_DB_URL" ]; then
  collect_pending_remote_files
fi

if [ -n "$DIFF_BASE" ]; then
  collect_diff_base_files
fi

for file in "${ADDED_FILES[@]}"; do
  [ -z "$file" ] && continue
  mark_added_file "$file"
  file="$(normalize_repo_path "$file")"
  EXPLICIT_FILES+=("$file")
done

if [ "$REQUIRE_PHASE_FOR_ADDED" = true ]; then
  REQUIRE_PHASE_IF_PRESENT=true
fi

if [ "$REQUIRE_PHASE_FOR_ADDED" = true ] && [ "${#added_file_map[@]}" -eq 0 ] && [ -z "$DIFF_BASE" ]; then
  echo "--require-phase-for-added requires --diff-base or explicit --added-files." >&2
  exit 1
fi

if [ "$STRICT_MODE" = false ] && [ "$EXPAND_ONLY_MODE" = false ] && [ "$REQUIRE_PHASE_IF_PRESENT" = false ] && [ "$REQUIRE_PHASE_FOR_ADDED" = false ]; then
  STRICT_MODE=true
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
  echo "No migration files selected for metadata validation."
  exit 0
fi

echo "Validating migration metadata for ${#UNIQUE_FILES[@]} file(s):"
printf '  %s\n' "${UNIQUE_FILES[@]}"

validate_required_header() {
  local file="$1"
  local key="$2"
  local value

  value="$(get_header_value "$file" "$key")"
  if [ -z "$value" ]; then
    echo "Missing required header -- ${key}: in ${file}" >&2
    return 1
  fi

  return 0
}

validate_strict_file() {
  local file="$1"
  local phase
  local failed=false

  for key in migration-phase owner lock-impact backfill compatible-with forward-repair; do
    if ! validate_required_header "$file" "$key"; then
      failed=true
    fi
  done

  phase="$(get_header_value "$file" "migration-phase")"
  if [ -n "$phase" ] && [ "$phase" != "expand" ] && [ "$phase" != "contract" ]; then
    echo "Invalid migration-phase '${phase}' in ${file}. Expected expand or contract." >&2
    failed=true
  fi

  if [ "$phase" = "contract" ]; then
    for key in compatibility-window-complete legacy-usage-confirmed-zero backup-verified; do
      if ! validate_required_header "$file" "$key"; then
        failed=true
      fi
    done

    local window_complete
    window_complete="$(get_header_value "$file" "compatibility-window-complete")"
    if [ -n "$window_complete" ] && ! [[ "$window_complete" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      echo "Invalid compatibility-window-complete '${window_complete}' in ${file}. Expected YYYY-MM-DD." >&2
      failed=true
    fi
  fi

  if [ "$failed" = true ]; then
    return 1
  fi

  return 0
}

validate_expand_only_file() {
  local file="$1"
  local phase

  phase="$(get_header_value "$file" "migration-phase")"
  if [ "$phase" = "contract" ] && [ "${MIGRATION_PHASE_ALLOW_CONTRACT:-}" != "true" ]; then
    echo "Contract migration blocked for automatic staging push: ${file}" >&2
    echo "Contract migrations must not auto-apply on dev. Merge via an approved Contract release." >&2
    return 1
  fi

  return 0
}

validate_require_phase_if_present_file() {
  local file="$1"
  local phase

  phase="$(get_header_value "$file" "migration-phase")"
  if [ -z "$phase" ]; then
    echo "WARN: ${file} has no migration-phase header (legacy migration; metadata recommended for new changes)."
    return 0
  fi

  if validate_strict_file "$file"; then
    return 0
  fi

  if [ "$phase" = "contract" ] && [ "${MIGRATION_REVIEWED:-}" = "true" ]; then
    echo "WARN: Contract metadata incomplete in ${file}, but migration-reviewed label is present."
    return 0
  fi

  return 1
}

validate_require_phase_for_added_file() {
  local file="$1"
  local phase

  phase="$(get_header_value "$file" "migration-phase")"
  if [ -z "$phase" ]; then
    echo "New migration file missing required migration-phase header: ${file}" >&2
    echo "Add expand or contract metadata using supabase/migration-templates/." >&2
    return 1
  fi

  if validate_strict_file "$file"; then
    return 0
  fi

  if [ "$phase" = "contract" ] && [ "${MIGRATION_REVIEWED:-}" = "true" ]; then
    echo "WARN: New contract migration metadata incomplete in ${file}, but migration-reviewed label is present."
    return 0
  fi

  return 1
}

is_added_file() {
  local file="$1"
  [ -n "${added_file_map[$file]:-}" ]
}

overall_failed=false
legacy_warning_count=0
added_missing_phase_count=0

for file in "${UNIQUE_FILES[@]}"; do
  if [ "$EXPAND_ONLY_MODE" = true ]; then
    if ! validate_expand_only_file "$file"; then
      overall_failed=true
    fi
  fi

  if [ "$REQUIRE_PHASE_FOR_ADDED" = true ] && is_added_file "$file"; then
    if ! validate_require_phase_for_added_file "$file"; then
      overall_failed=true
      if [ -z "$(get_header_value "$file" "migration-phase")" ]; then
        added_missing_phase_count=$((added_missing_phase_count + 1))
      fi
    fi
    continue
  fi

  if [ "$REQUIRE_PHASE_IF_PRESENT" = true ]; then
    if ! validate_require_phase_if_present_file "$file"; then
      overall_failed=true
    elif [ -z "$(get_header_value "$file" "migration-phase")" ]; then
      legacy_warning_count=$((legacy_warning_count + 1))
    fi
  elif [ "$STRICT_MODE" = true ]; then
    if validate_strict_file "$file"; then
      :
    elif [ "$(get_header_value "$file" "migration-phase")" = "contract" ] \
      && [ "${MIGRATION_REVIEWED:-}" = "true" ]; then
      echo "WARN: Contract metadata incomplete in ${file}, but migration-reviewed label is present."
    else
      overall_failed=true
    fi
  fi
done

if [ "$legacy_warning_count" -gt 0 ]; then
  echo "WARN: ${legacy_warning_count} changed migration file(s) lack migration-phase metadata."
fi

if [ "$added_missing_phase_count" -gt 0 ]; then
  echo "FAIL: ${added_missing_phase_count} newly added migration file(s) require migration-phase metadata." >&2
fi

if [ "$overall_failed" = true ]; then
  exit 1
fi

echo "Migration metadata validation passed."
