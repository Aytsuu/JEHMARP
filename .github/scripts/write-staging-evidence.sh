#!/usr/bin/env bash
set -euo pipefail

EVIDENCE_DIR="${1:-staging-evidence}"
mkdir -p "$EVIDENCE_DIR"

echo "${GITHUB_SHA:?GITHUB_SHA is required}" > "${EVIDENCE_DIR}/commit-sha.txt"
echo "smoke_ok" > "${EVIDENCE_DIR}/smoke-result.txt"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "${EVIDENCE_DIR}/generated-at.txt"

if [ "${SUPABASE_LINKED:-false}" = "true" ]; then
  supabase migration list --linked --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}" \
    > "${EVIDENCE_DIR}/migration-list.txt"
elif [ -n "${SUPABASE_DB_POOLER_URL:-}" ]; then
  supabase migration list --db-url "$SUPABASE_DB_POOLER_URL" --dns-resolver "${SUPABASE_DNS_RESOLVER:-https}" \
    > "${EVIDENCE_DIR}/migration-list.txt"
else
  echo "migration-list-unavailable" > "${EVIDENCE_DIR}/migration-list.txt"
fi

echo "Wrote staging evidence to ${EVIDENCE_DIR}"
