#!/usr/bin/env bash
set -euo pipefail

EVIDENCE_DIR="${1:-staging-evidence}"
EXPECTED_SHA="${2:?expected commit SHA is required}"

if [ ! -d "$EVIDENCE_DIR" ]; then
  echo "Staging evidence directory not found: ${EVIDENCE_DIR}" >&2
  exit 1
fi

actual_sha="$(tr -d '[:space:]' < "${EVIDENCE_DIR}/commit-sha.txt")"
if [ "$actual_sha" != "$EXPECTED_SHA" ]; then
  echo "Staging evidence commit SHA mismatch: expected ${EXPECTED_SHA}, got ${actual_sha}" >&2
  exit 1
fi

smoke_result="$(tr -d '[:space:]' < "${EVIDENCE_DIR}/smoke-result.txt")"
if [ "$smoke_result" != "smoke_ok" ]; then
  echo "Staging smoke tests did not pass (result: ${smoke_result})." >&2
  exit 1
fi

if [ ! -f "${EVIDENCE_DIR}/migration-list.txt" ] \
  || grep -q "migration-list-unavailable" "${EVIDENCE_DIR}/migration-list.txt"; then
  echo "WARN: Staging migration list unavailable in evidence; skipping history match."
  exit 0
fi

local_versions="$(
  find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' \
    | sed -E 's/_.*$//' \
    | sort -u
)"

staging_applied="$(
  awk -F'|' '
    {
       local_col = $1
       remote_col = $2
       gsub(/^[ \t]+|[ \t]+$/, "", local_col)
       gsub(/^[ \t]+|[ \t]+$/, "", remote_col)
       gsub(/`/, "", local_col)
       gsub(/`/, "", remote_col)
       if (local_col == "" || local_col == "Local" || local_col ~ /---/) {
        next
      }
      if (remote_col != "") {
        print local_col
      }
    }
  ' "${EVIDENCE_DIR}/migration-list.txt" | sort -u
)"

missing_versions=""
while IFS= read -r version; do
  [ -z "$version" ] && continue
  if ! grep -qx "$version" <<< "$staging_applied"; then
    missing_versions="${missing_versions}${version}"$'\n'
  fi
done <<< "$local_versions"

if [ -n "$missing_versions" ]; then
  echo "Staging migration history does not include all candidate migrations:" >&2
  printf '%s' "$missing_versions" >&2
  exit 1
fi

echo "Staging evidence verified for commit ${EXPECTED_SHA}."
