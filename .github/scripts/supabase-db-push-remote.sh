#!/usr/bin/env bash
set -euo pipefail

DNS_RESOLVER="${SUPABASE_DNS_RESOLVER:-https}"
LINKED="${SUPABASE_LINKED:-false}"
DRY_RUN="${SUPABASE_DB_PUSH_DRY_RUN:-false}"
MAX_ATTEMPTS="${SUPABASE_DB_PUSH_MAX_ATTEMPTS:-5}"
RETRY_DELAY_SECONDS="${SUPABASE_DB_PUSH_RETRY_DELAY_SECONDS:-15}"

push_args=(--dns-resolver "$DNS_RESOLVER" --yes)

if [ "$DRY_RUN" = "true" ]; then
  push_args=(--dry-run "${push_args[@]}")
fi

run_linked_push() {
  if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
    echo "SUPABASE_DB_PASSWORD is required for linked db push."
    return 1
  fi

  supabase db push --linked --password "$SUPABASE_DB_PASSWORD" "${push_args[@]}"
}

run_pooler_push() {
  if [ -z "${SUPABASE_DB_POOLER_URL:-}" ]; then
    return 1
  fi

  echo "Applying migrations via SUPABASE_DB_POOLER_URL."
  supabase db push --db-url "$SUPABASE_DB_POOLER_URL" "${push_args[@]}"
}

attempt_with_retries() {
  local label="$1"
  shift

  local attempt=1
  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    echo "Remote ${label} db push attempt ${attempt}/${MAX_ATTEMPTS}..."

    if "$@"; then
      return 0
    fi

    if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
      return 1
    fi

    echo "Remote ${label} db push failed; retrying in ${RETRY_DELAY_SECONDS}s..."
    sleep "$RETRY_DELAY_SECONDS"
    attempt=$((attempt + 1))
  done

  return 1
}

if [ "$LINKED" = "true" ]; then
  if attempt_with_retries "linked" run_linked_push; then
    exit 0
  fi

  echo "Linked db push failed after ${MAX_ATTEMPTS} attempts."

  if [ -n "${SUPABASE_DB_POOLER_URL:-}" ]; then
    echo "Falling back to SUPABASE_DB_POOLER_URL."
    if attempt_with_retries "pooler" run_pooler_push; then
      exit 0
    fi
  fi

  exit 1
fi

if [ -n "${SUPABASE_DB_POOLER_URL:-}" ]; then
  echo "Supabase link unavailable; applying migrations via SUPABASE_DB_POOLER_URL."
  if attempt_with_retries "pooler" run_pooler_push; then
    exit 0
  fi

  exit 1
fi

echo "Remote db push requires a successful supabase link or SUPABASE_DB_POOLER_URL."
exit 1
