#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-${REPOSITORY_ROOT}/web/wrangler.jsonc}"
PLACEHOLDER="REPLACE_WITH_STAGING_SESSION_KV_ID"

production_name="$(WRANGLER_CONFIG="$CONFIG_FILE" bash "${SCRIPT_DIR}/resolve-worker-name.sh")"
staging_name="$(WRANGLER_CONFIG="$CONFIG_FILE" WRANGLER_ENV=staging bash "${SCRIPT_DIR}/resolve-worker-name.sh")"

if [ "$staging_name" = "$production_name" ]; then
  echo "Staging worker name (${staging_name}) must differ from production (${production_name})." >&2
  exit 1
fi

if [ "$staging_name" = "jehmarp" ]; then
  echo "Staging worker name must not be the production worker name 'jehmarp'." >&2
  exit 1
fi

read_production_session_kv_id() {
  sed -n '1,/\"env\"[[:space:]]*:/p' "$CONFIG_FILE" \
    | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1
}

read_staging_session_kv_id() {
  sed -n '/"staging"[[:space:]]*:[[:space:]]*{/,/^[[:space:]]*}[[:space:]]*,\?[[:space:]]*$/p' "$CONFIG_FILE" \
    | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1
}

production_kv_id="$(read_production_session_kv_id)"
staging_kv_id="$(read_staging_session_kv_id)"

if [ -z "$production_kv_id" ]; then
  echo "Missing production SESSION KV id in wrangler config." >&2
  exit 1
fi

if [ -z "$staging_kv_id" ]; then
  echo "Missing staging SESSION KV id in wrangler config." >&2
  exit 1
fi

if [ "$staging_kv_id" = "$production_kv_id" ]; then
  echo "Staging SESSION KV id must not match production SESSION KV id (${production_kv_id})." >&2
  exit 1
fi

if [ "$staging_kv_id" = "$PLACEHOLDER" ]; then
  if [ -z "${STAGING_SESSION_KV_ID:-}" ]; then
    echo "Staging SESSION KV id is still the placeholder. Set STAGING_SESSION_KV_ID before deploy." >&2
    exit 1
  fi

  if [ "$STAGING_SESSION_KV_ID" = "$production_kv_id" ]; then
    echo "STAGING_SESSION_KV_ID must not match the production SESSION KV namespace id." >&2
    exit 1
  fi

  echo "Staging KV placeholder will be replaced from STAGING_SESSION_KV_ID during deploy."
  exit 0
fi

if [ -n "${STAGING_SESSION_KV_ID:-}" ] && [ "$staging_kv_id" != "$STAGING_SESSION_KV_ID" ]; then
  echo "Configured staging SESSION KV id (${staging_kv_id}) does not match STAGING_SESSION_KV_ID." >&2
  exit 1
fi

echo "Staging isolation verified: worker=${staging_name}, SESSION KV id differs from production."
