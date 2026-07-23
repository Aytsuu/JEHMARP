#!/usr/bin/env bash
set -euo pipefail

DNS_RESOLVER="${SUPABASE_DNS_RESOLVER:-https}"
LINKED="${SUPABASE_LINKED:-false}"
DRY_RUN="${SUPABASE_DB_PUSH_DRY_RUN:-false}"

push_args=(--dns-resolver "$DNS_RESOLVER" --yes)

if [ "$DRY_RUN" = "true" ]; then
  push_args=(--dry-run "${push_args[@]}")
fi

if [ "$LINKED" = "true" ]; then
  if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
    echo "SUPABASE_DB_PASSWORD is required for linked db push."
    exit 1
  fi

  supabase db push --linked --password "$SUPABASE_DB_PASSWORD" "${push_args[@]}"
  exit 0
fi

if [ -n "${SUPABASE_DB_POOLER_URL:-}" ]; then
  echo "Supabase link unavailable; applying migrations via SUPABASE_DB_POOLER_URL."
  supabase db push --db-url "$SUPABASE_DB_POOLER_URL" "${push_args[@]}"
  exit 0
fi

echo "Remote db push requires a successful supabase link or SUPABASE_DB_POOLER_URL."
exit 1
