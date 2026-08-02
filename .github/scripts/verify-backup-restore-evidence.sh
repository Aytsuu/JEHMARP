#!/usr/bin/env bash
set -euo pipefail

BACKUP_RUN_ID=""
BACKUP_ARTIFACT_DIR=""
RESTORE_REHEARSAL_VERIFIED="${RESTORE_REHEARSAL_VERIFIED:-false}"

usage() {
  cat <<'EOF'
Usage: verify-backup-restore-evidence.sh [options]

Fail-closed validation for backup artifact presence and restore rehearsal evidence.

Options:
  --backup-run-id ID              Required Backup and Rollback workflow run id.
  --backup-artifact-dir DIR       Required path to downloaded backup workflow artifact.
  --restore-rehearsal-verified    Must be exactly "true" (non-bypassable Contract gate).

Restore rehearsal evidence requires one of:
  - restore-rehearsal-notes.md in the backup artifact directory
  - restore-rehearsal-verified.marker in the backup artifact directory
  - --restore-rehearsal-verified true (workflow input gate; still requires artifact marker or notes when present)
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --backup-run-id)
      BACKUP_RUN_ID="${2:?--backup-run-id requires a run id}"
      shift 2
      ;;
    --backup-artifact-dir)
      BACKUP_ARTIFACT_DIR="${2:?--backup-artifact-dir requires a directory}"
      shift 2
      ;;
    --restore-rehearsal-verified)
      RESTORE_REHEARSAL_VERIFIED="${2:?--restore-rehearsal-verified requires true or false}"
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

if [ "$RESTORE_REHEARSAL_VERIFIED" != "true" ]; then
  echo "restore_rehearsal_verified must be explicitly true (got: ${RESTORE_REHEARSAL_VERIFIED})." >&2
  echo "Contract release cannot proceed without confirmed restore rehearsal." >&2
  exit 1
fi

backup_artifact_count="$(
  find "$BACKUP_ARTIFACT_DIR" -type f \( -name '*.sql' -o -name '*.csv' -o -name '*.md' -o -name '*.json' -o -name '*.txt' \) | wc -l | tr -d '[:space:]'
)"
if [ "${backup_artifact_count}" -eq 0 ]; then
  echo "Backup artifact directory has no recognizable backup files: ${BACKUP_ARTIFACT_DIR}" >&2
  exit 1
fi

restore_notes_file=""
restore_marker_file=""
while IFS= read -r candidate; do
  [ -z "$candidate" ] && continue
  base_name="$(basename "$candidate")"
  if [ "$base_name" = "restore-rehearsal-notes.md" ]; then
    restore_notes_file="$candidate"
  fi
  if [ "$base_name" = "restore-rehearsal-verified.marker" ]; then
    restore_marker_file="$candidate"
  fi
done < <(find "$BACKUP_ARTIFACT_DIR" -type f \( -name 'restore-rehearsal-notes.md' -o -name 'restore-rehearsal-verified.marker' \) -print)

if [ -z "$restore_notes_file" ] && [ -z "$restore_marker_file" ]; then
  echo "Missing restore rehearsal artifact: expected restore-rehearsal-notes.md or restore-rehearsal-verified.marker in ${BACKUP_ARTIFACT_DIR}." >&2
  echo "Run Backup and Rollback (backup-production-db) after restore rehearsal, or add the marker file to the backup artifact." >&2
  exit 1
fi

if [ -n "$restore_marker_file" ]; then
  marker_run_id="$(tr -d '[:space:]' < "$restore_marker_file" || true)"
  if [ -n "$marker_run_id" ] && [ "$marker_run_id" != "$BACKUP_RUN_ID" ]; then
    echo "restore-rehearsal-verified.marker run id mismatch: expected ${BACKUP_RUN_ID}, got ${marker_run_id}." >&2
    exit 1
  fi
fi

echo "Backup restore evidence validated for run ${BACKUP_RUN_ID}."
if [ -n "$restore_notes_file" ]; then
  echo "Restore rehearsal notes: ${restore_notes_file}"
fi
if [ -n "$restore_marker_file" ]; then
  echo "Restore rehearsal marker: ${restore_marker_file}"
fi
