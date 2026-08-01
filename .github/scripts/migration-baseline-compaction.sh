#!/usr/bin/env bash

# Verified one-time history-compaction baseline detection.
# Source this file; it is not meant to be executed directly.

MIGRATION_BASELINE_COMPACTION_TYPE="history-compaction-baseline"
MIGRATION_BASELINE_COMPACTION_CHECKPOINT="supabase/_archived_migrations/20260802_checkpoint_prebaseline"
MIGRATION_BASELINE_COMPACTION_VERSION="20260802000000"

migration_baseline_compaction_get_header_value() {
  local file="$1"
  local key="$2"

  sed -n "s/^[[:space:]]*--[[:space:]]*${key}:[[:space:]]*//p" "$file" | head -1 | sed 's/[[:space:]]*$//'
}

migration_baseline_compaction_checkout_shape_ok() {
  local repo_root="$1"
  local migrations_dir="${repo_root}/supabase/migrations"
  local checkpoint_dir="${repo_root}/${MIGRATION_BASELINE_COMPACTION_CHECKPOINT}"
  local sql_count

  if [ ! -d "$checkpoint_dir" ]; then
    return 1
  fi

  sql_count="$(find "$migrations_dir" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
  [ "$sql_count" -eq 1 ]
}

migration_baseline_compaction_is_verified_file() {
  local repo_root="$1"
  local file_path="$2"
  local migration_type
  local checkpoint
  local basename

  if [[ "$file_path" != /* ]]; then
    file_path="${repo_root}/${file_path}"
  fi

  if [ ! -f "$file_path" ]; then
    return 1
  fi

  basename="$(basename "$file_path")"
  if [[ "$basename" != "${MIGRATION_BASELINE_COMPACTION_VERSION}"_* ]]; then
    return 1
  fi

  migration_type="$(migration_baseline_compaction_get_header_value "$file_path" "migration-type")"
  checkpoint="$(migration_baseline_compaction_get_header_value "$file_path" "compaction-checkpoint")"

  if [ "$migration_type" != "$MIGRATION_BASELINE_COMPACTION_TYPE" ]; then
    return 1
  fi

  if [ "$checkpoint" != "$(basename "$MIGRATION_BASELINE_COMPACTION_CHECKPOINT")" ]; then
    return 1
  fi

  migration_baseline_compaction_checkout_shape_ok "$repo_root"
}
