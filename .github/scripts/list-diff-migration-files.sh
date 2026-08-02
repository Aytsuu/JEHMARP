#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=migration-diff-lib.sh
source "${SCRIPT_DIR}/migration-diff-lib.sh"

REPOSITORY_ROOT="$(migration_diff_lib_repository_root)"
DIFF_BASE=""
MODE="current"

usage() {
  cat <<'EOF'
Usage: list-diff-migration-files.sh --diff-base REF [--mode MODE]

List migration paths changed between DIFF_BASE and HEAD.

Modes:
  current   Added/modified/copied/renamed files that exist under supabase/migrations/ (default)
  all       All changed paths, including deletions, for audit/reporting
  added     Added files only that exist under supabase/migrations/
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --diff-base)
      DIFF_BASE="${2:?--diff-base requires a git ref}"
      shift 2
      ;;
    --mode)
      MODE="${2:?--mode requires current, all, or added}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$DIFF_BASE" ]; then
  echo "--diff-base is required." >&2
  usage >&2
  exit 1
fi

migration_diff_lib_assert_git_ref "$REPOSITORY_ROOT" "$DIFF_BASE"

case "$MODE" in
  current)
    migration_diff_lib_emit_current_scanable_paths "$REPOSITORY_ROOT" "$DIFF_BASE"
    ;;
  all)
    migration_diff_lib_all_changed_paths "$REPOSITORY_ROOT" "$DIFF_BASE"
    ;;
  added)
    migration_diff_lib_emit_added_paths "$REPOSITORY_ROOT" "$DIFF_BASE"
    ;;
  *)
    echo "Invalid --mode '${MODE}'. Expected current, all, or added." >&2
    exit 1
    ;;
esac
