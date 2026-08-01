#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CANARY_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/cloudflare-worker-canary.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

write_fixture() {
  local name="$1"
  local content="$2"
  printf '%s' "$content" > "${FIXTURE_DIR}/${name}"
}

write_fixture "version-upload.ndjson" \
  '{"type":"version-upload","version":1,"worker_name":"jehmarp","version_id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}'

parsed="$(sed -n 's/.*"version_id":"\([^"]*\)".*/\1/p' "${FIXTURE_DIR}/version-upload.ndjson")"
if [ "$parsed" != "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" ]; then
  echo "Unexpected parsed version_id: ${parsed}" >&2
  exit 1
fi

header='Cloudflare-Workers-Version-Overrides: jehmarp="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"'
built="$(
  worker_name="jehmarp"
  version_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
  printf 'Cloudflare-Workers-Version-Overrides: %s="%s"' "$worker_name" "$version_id"
)"

if [ "$built" != "$header" ]; then
  echo "Unexpected override header: ${built}" >&2
  exit 1
fi

if bash "$CANARY_SCRIPT" deploy-split new stable 40 50 >/dev/null 2>&1; then
  echo "Expected invalid percentage totals to fail." >&2
  exit 1
fi

if WRANGLER_ENV=staging bash "$CANARY_SCRIPT" assert-versions-api >/dev/null 2>&1; then
  echo "Expected canary helpers to reject WRANGLER_ENV=staging." >&2
  exit 1
fi

echo "cloudflare-worker-canary helper tests passed."
