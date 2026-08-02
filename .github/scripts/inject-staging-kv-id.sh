#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_FILE="${CONFIG_FILE:-${1:-${REPOSITORY_ROOT}/web/wrangler.jsonc}}"
PLACEHOLDER="REPLACE_WITH_STAGING_SESSION_KV_ID"

: "${STAGING_SESSION_KV_ID:?Set STAGING_SESSION_KV_ID in the staging GitHub Environment}"

if ! [[ "$STAGING_SESSION_KV_ID" =~ ^[a-f0-9]{32}$ ]]; then
  echo "STAGING_SESSION_KV_ID must be a 32-character lowercase hex Cloudflare KV namespace id." >&2
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
if [ -z "$production_kv_id" ]; then
  echo "Unable to read production SESSION KV id from wrangler config." >&2
  exit 1
fi

if [ "$STAGING_SESSION_KV_ID" = "$production_kv_id" ]; then
  echo "STAGING_SESSION_KV_ID must not match the production SESSION KV namespace id." >&2
  exit 1
fi

if [ "$STAGING_SESSION_KV_ID" = "$PLACEHOLDER" ]; then
  echo "STAGING_SESSION_KV_ID is still the wrangler placeholder value." >&2
  exit 1
fi

if ! grep -q "$PLACEHOLDER" "$CONFIG_FILE"; then
  current_staging_kv_id="$(read_staging_session_kv_id)"
  if [ "$current_staging_kv_id" = "$STAGING_SESSION_KV_ID" ]; then
    echo "Staging SESSION KV id already set to ${STAGING_SESSION_KV_ID}."
    exit 0
  fi

  echo "Staging SESSION KV placeholder not found and id does not match STAGING_SESSION_KV_ID." >&2
  exit 1
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT
sed "s/${PLACEHOLDER}/${STAGING_SESSION_KV_ID}/" "$CONFIG_FILE" > "$tmp_file"
mv "$tmp_file" "$CONFIG_FILE"
trap - EXIT

echo "Injected staging SESSION KV id into ${CONFIG_FILE}."
