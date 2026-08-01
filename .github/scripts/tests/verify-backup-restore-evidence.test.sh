#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/verify-backup-restore-evidence.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

mkdir -p "${FIXTURE_DIR}/backup-artifact"
printf '%s' '-- schema' > "${FIXTURE_DIR}/backup-artifact/production-schema.sql"

common_args=(
  --backup-run-id 888001
  --backup-artifact-dir "${FIXTURE_DIR}/backup-artifact"
)

if bash "$SCRIPT_PATH" "${common_args[@]}" --restore-rehearsal-verified false 2>/dev/null; then
  echo "Expected restore_rehearsal_verified=false to fail." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" "${common_args[@]}" --restore-rehearsal-verified true 2>/dev/null; then
  echo "Expected missing restore marker/notes to fail." >&2
  exit 1
fi

printf '%s' '888001' > "${FIXTURE_DIR}/backup-artifact/restore-rehearsal-verified.marker"
if ! bash "$SCRIPT_PATH" "${common_args[@]}" --restore-rehearsal-verified true; then
  echo "Expected marker file with matching run id to pass." >&2
  exit 1
fi

rm -f "${FIXTURE_DIR}/backup-artifact/restore-rehearsal-verified.marker"
printf '%s' '# restore notes' > "${FIXTURE_DIR}/backup-artifact/restore-rehearsal-notes.md"
if ! bash "$SCRIPT_PATH" "${common_args[@]}" --restore-rehearsal-verified true; then
  echo "Expected restore-rehearsal-notes.md to pass." >&2
  exit 1
fi

printf '%s' 'wrong-id' > "${FIXTURE_DIR}/backup-artifact/restore-rehearsal-verified.marker"
if bash "$SCRIPT_PATH" "${common_args[@]}" --restore-rehearsal-verified true 2>/dev/null; then
  echo "Expected mismatched marker run id to fail." >&2
  exit 1
fi

empty_dir="$(mktemp -d)"
if bash "$SCRIPT_PATH" --backup-run-id 888001 --backup-artifact-dir "$empty_dir" --restore-rehearsal-verified true 2>/dev/null; then
  echo "Expected empty backup artifact to fail." >&2
  exit 1
fi
rm -rf "$empty_dir"

echo "verify-backup-restore-evidence tests passed."
