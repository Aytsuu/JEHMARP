#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ASSERT_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/assert-staging-worker-isolation.sh"
INJECT_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/inject-staging-kv-id.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

STAGING_SESSION_KV_ID="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
export STAGING_SESSION_KV_ID

if ! bash "$ASSERT_SCRIPT"; then
  echo "Expected repository staging isolation assertion to pass with STAGING_SESSION_KV_ID set." >&2
  exit 1
fi

cat > "${FIXTURE_DIR}/wrangler.jsonc" <<'JSONC'
{
  "name": "jehmarp",
  "kv_namespaces": [
    {
      "binding": "SESSION",
      "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ],
  "env": {
    "staging": {
      "name": "jehmarp",
      "kv_namespaces": [
        {
          "binding": "SESSION",
          "id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        }
      ]
    }
  }
}
JSONC

if CONFIG_FILE="${FIXTURE_DIR}/wrangler.jsonc" bash "$ASSERT_SCRIPT"; then
  echo "Expected matching staging/production worker names to fail." >&2
  exit 1
fi

cat > "${FIXTURE_DIR}/wrangler.jsonc" <<'JSONC'
{
  "name": "jehmarp",
  "kv_namespaces": [
    {
      "binding": "SESSION",
      "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ],
  "env": {
    "staging": {
      "name": "jehmarp-staging",
      "kv_namespaces": [
        {
          "binding": "SESSION",
          "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      ]
    }
  }
}
JSONC

if CONFIG_FILE="${FIXTURE_DIR}/wrangler.jsonc" bash "$ASSERT_SCRIPT"; then
  echo "Expected matching staging/production KV ids to fail." >&2
  exit 1
fi

cat > "${FIXTURE_DIR}/wrangler.jsonc" <<'JSONC'
{
  "name": "jehmarp",
  "kv_namespaces": [
    {
      "binding": "SESSION",
      "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ],
  "env": {
    "staging": {
      "name": "jehmarp-staging",
      "kv_namespaces": [
        {
          "binding": "SESSION",
          "id": "REPLACE_WITH_STAGING_SESSION_KV_ID"
        }
      ]
    }
  }
}
JSONC

if STAGING_SESSION_KV_ID="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" CONFIG_FILE="${FIXTURE_DIR}/wrangler.jsonc" bash "$INJECT_SCRIPT"; then
  echo "Expected inject to reject production KV id." >&2
  exit 1
fi

STAGING_SESSION_KV_ID="cccccccccccccccccccccccccccccccc" CONFIG_FILE="${FIXTURE_DIR}/wrangler.jsonc" bash "$INJECT_SCRIPT"
injected_id="$(
  sed -n '/"staging"[[:space:]]*:[[:space:]]*{/,/^[[:space:]]*}[[:space:]]*,\?[[:space:]]*$/p' "${FIXTURE_DIR}/wrangler.jsonc" \
    | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1
)"

if [ "$injected_id" != "cccccccccccccccccccccccccccccccc" ]; then
  echo "Expected injected staging KV id, got '${injected_id}'." >&2
  exit 1
fi

echo "assert-staging-worker-isolation helper tests passed."
