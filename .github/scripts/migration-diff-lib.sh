#!/usr/bin/env bash

# Shared helpers for selecting migration paths from a git diff range.
# Source this file; it is not meant to be executed directly.

migration_diff_lib_repository_root() {
  local script_di
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${script_dir}/../.." && pwd
}

migration_diff_lib_assert_git_ref() {
  local repo_root="$1"
  local ref="$2"

  if ! git -C "$repo_root" rev-parse --verify "${ref}" >/dev/null 2>&1; then
    echo "Git ref not found: ${ref}" >&2
    return 1
  fi
}

migration_diff_lib_is_active_migration_path() {
  local path="$1"

  [[ "$path" == supabase/migrations/* ]] \
    && [[ "$path" != supabase/_archived_migrations/* ]]
}

migration_diff_lib_path_exists_in_repo() {
  local repo_root="$1"
  local rel_path="$2"

  [ -f "${repo_root}/${rel_path}" ]
}

migration_diff_lib_normalize_repo_relative_path() {
  local repo_root="$1"
  local path="$2"

  if [[ "$path" == /* ]]; then
    case "$path" in
      "${repo_root}"/*)
        path="${path#"${repo_root}"/}"
        ;;
      *)
        echo "Migration path is outside the repository root: ${path}" >&2
        return 1
        ;;
    esac
  fi

  if ! migration_diff_lib_is_active_migration_path "$path"; then
    echo "Path is not an active migration under supabase/migrations/: ${path}" >&2
    return 1
  fi

  printf '%s' "$path"
}

migration_diff_lib_all_changed_paths() {
  local repo_root="$1"
  local diff_base="$2"

  git -C "$repo_root" diff --name-only "${diff_base}"...HEAD -- supabase/migrations 2>/dev/null || true
}

migration_diff_lib_status_changed_paths() {
  local repo_root="$1"
  local diff_base="$2"
  local diff_filter="$3"

  git -C "$repo_root" diff --diff-filter="${diff_filter}" --name-only "${diff_base}"...HEAD -- supabase/migrations 2>/dev/null || true
}

migration_diff_lib_emit_current_scanable_paths() {
  local repo_root="$1"
  local diff_base="$2"
  local path

  while IFS= read -r path; do
    [ -z "$path" ] && continue

    if ! migration_diff_lib_is_active_migration_path "$path"; then
      echo "Refusing to treat non-active migration path as scanable SQL: ${path}" >&2
      return 1
    fi

    if ! migration_diff_lib_path_exists_in_repo "$repo_root" "$path"; then
      echo "Expected added/modified migration file to exist in checkout: ${path}" >&2
      return 1
    fi

    printf '%s\n' "$path"
  done < <(migration_diff_lib_status_changed_paths "$repo_root" "$diff_base" "ACMR")
}

migration_diff_lib_emit_added_paths() {
  local repo_root="$1"
  local diff_base="$2"
  local path

  while IFS= read -r path; do
    [ -z "$path" ] && continue

    if ! migration_diff_lib_is_active_migration_path "$path"; then
      echo "Refusing to treat non-active migration path as added SQL: ${path}" >&2
      return 1
    fi

    if ! migration_diff_lib_path_exists_in_repo "$repo_root" "$path"; then
      echo "Expected added migration file to exist in checkout: ${path}" >&2
      return 1
    fi

    printf '%s\n' "$path"
  done < <(migration_diff_lib_status_changed_paths "$repo_root" "$diff_base" "A")
}
