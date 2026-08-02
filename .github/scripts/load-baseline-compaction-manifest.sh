#!/usr/bin/env bash

# Shared trusted compaction manifest helpers.
# Source this file; it is not meant to be executed directly.

BASELINE_COMPACTION_MANIFEST_DEFAULT=".github/config/baseline-compaction-20260802.manifest"

baseline_compaction_manifest_read_value() {
  local manifest_file="$1"
  local key="$2"
  local value

  value="$(sed -n "s/^${key}=//p" "$manifest_file" | head -1 | tr -d '\r')"
  value="${value//$'\ufeff'/}"
  printf '%s' "$value"
}

baseline_compaction_manifest_resolve_path() {
  local repo_root="$1"
  local relative_path="$2"

  if [[ "$relative_path" == /* ]]; then
    printf '%s' "$relative_path"
  else
    printf '%s/%s' "$repo_root" "$relative_path"
  fi
}

baseline_compaction_manifest_load() {
  local repo_root="$1"
  local manifest_file="${2:-$BASELINE_COMPACTION_MANIFEST_DEFAULT}"

  if [[ "$manifest_file" != /* ]]; then
    manifest_file="${repo_root}/${manifest_file}"
  fi

  if [ ! -f "$manifest_file" ]; then
    echo "Missing trusted baseline compaction manifest: ${manifest_file}" >&2
    return 1
  fi

  BASELINE_COMPACTION_MANIFEST_FILE="$manifest_file"
  BASELINE_COMPACTION_CHECKPOINT_DIRECTORY="$(baseline_compaction_manifest_read_value "$manifest_file" CHECKPOINT_DIRECTORY)"
  BASELINE_COMPACTION_BASELINE_VERSION="$(baseline_compaction_manifest_read_value "$manifest_file" BASELINE_VERSION)"
  BASELINE_COMPACTION_ARCHIVED_VERSIONS_FILE="$(baseline_compaction_manifest_read_value "$manifest_file" ARCHIVED_VERSIONS_FILE)"

  if [ -z "$BASELINE_COMPACTION_CHECKPOINT_DIRECTORY" ] \
    || [ -z "$BASELINE_COMPACTION_BASELINE_VERSION" ] \
    || [ -z "$BASELINE_COMPACTION_ARCHIVED_VERSIONS_FILE" ]; then
    echo "Trusted baseline compaction manifest is incomplete: ${manifest_file}" >&2
    return 1
  fi

  BASELINE_COMPACTION_CHECKPOINT_PATH="$(baseline_compaction_manifest_resolve_path "$repo_root" "$BASELINE_COMPACTION_CHECKPOINT_DIRECTORY")"
  BASELINE_COMPACTION_ARCHIVED_VERSIONS_PATH="$(baseline_compaction_manifest_resolve_path "$repo_root" "$BASELINE_COMPACTION_ARCHIVED_VERSIONS_FILE")"

  if [ ! -f "$BASELINE_COMPACTION_ARCHIVED_VERSIONS_PATH" ]; then
    echo "Missing trusted archived-version list: ${BASELINE_COMPACTION_ARCHIVED_VERSIONS_FILE}" >&2
    return 1
  fi
}

baseline_compaction_normalize_versions_file() {
  local input_file="$1"
  local output_file="$2"

  tr -d '\r' < "$input_file" | sed '/^[[:space:]]*$/d' > "$output_file"
}

baseline_compaction_collect_versions_from_sql_dir() {
  local directory="$1"

  find "$directory" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' \
    | sed -nE 's/^([0-9]{14})_.+\.sql$/\1/p' \
    | sort -u
}

baseline_compaction_validate_checkpoint_directory() {
  local checkpoint_dir="$1"
  local archived_versions_path="$2"
  local tmp_di
  local checkpoint_versions_file
  local archived_count
  local checkpoint_count

  if [ ! -d "$checkpoint_dir" ]; then
    echo "Missing archived migration checkpoint: ${checkpoint_dir}" >&2
    return 1
  fi

  tmp_dir="$(mktemp -d)"
  checkpoint_versions_file="${tmp_dir}/checkpoint-versions.txt"
  trap 'rm -rf "$tmp_dir"' RETURN

  baseline_compaction_collect_versions_from_sql_dir "$checkpoint_dir" > "$checkpoint_versions_file"
  checkpoint_count="$(wc -l < "$checkpoint_versions_file" | tr -d ' ')"
  archived_count="$(wc -l < "$archived_versions_path" | tr -d ' ')"

  if [ "$checkpoint_count" -eq 0 ] || [ "$archived_count" -eq 0 ]; then
    echo "Archived checkpoint or trusted version list is empty." >&2
    return 1
  fi

  if ! cmp -s "$archived_versions_path" "$checkpoint_versions_file"; then
    local normalized_archived="${tmp_dir}/archived-normalized.txt"
    local normalized_checkpoint="${tmp_dir}/checkpoint-normalized.txt"
    baseline_compaction_normalize_versions_file "$archived_versions_path" "$normalized_archived"
    baseline_compaction_normalize_versions_file "$checkpoint_versions_file" "$normalized_checkpoint"
    if ! cmp -s "$normalized_archived" "$normalized_checkpoint"; then
    echo "Candidate archive checkpoint does not match the trusted compaction manifest." >&2
    echo "Only in trusted manifest:" >&2
    comm -23 "$archived_versions_path" "$checkpoint_versions_file" >&2 || true
    echo "Only in candidate checkpoint:" >&2
    comm -13 "$archived_versions_path" "$checkpoint_versions_file" >&2 || true
    return 1
    fi
  fi
}
