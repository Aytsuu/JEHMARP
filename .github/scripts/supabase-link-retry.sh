#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${1:?Supabase project ref is required}"
MAX_ATTEMPTS="${SUPABASE_LINK_MAX_ATTEMPTS:-5}"
RETRY_DELAY_SECONDS="${SUPABASE_LINK_RETRY_DELAY_SECONDS:-15}"
DNS_RESOLVER="${SUPABASE_DNS_RESOLVER:-https}"

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  echo "SUPABASE_DB_PASSWORD is required."
  exit 1
fi

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "Linking Supabase project ${PROJECT_REF} (attempt ${attempt}/${MAX_ATTEMPTS})..."

  if supabase link \
    --project-ref "$PROJECT_REF" \
    --password "$SUPABASE_DB_PASSWORD" \
    --dns-resolver "$DNS_RESOLVER" \
    --yes; then
    echo "Supabase link succeeded."
    exit 0
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    echo "Supabase link failed after ${MAX_ATTEMPTS} attempts."
    exit 1
  fi

  echo "Supabase link failed; retrying in ${RETRY_DELAY_SECONDS}s..."
  sleep "$RETRY_DELAY_SECONDS"
  attempt=$((attempt + 1))
done
