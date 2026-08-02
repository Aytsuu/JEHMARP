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

write_fixture "deployment-status.json" \
  '{
  "created_on": "2026-08-02T00:00:00.000Z",
  "versions": [
    { "version_id": "11111111-1111-1111-1111-111111111111", "percentage": 100 }
  ]
}'

write_fixture "versions-list.json" \
  '[
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "metadata": { "created_on": "2026-08-01T00:00:00.000Z" }
  },
  {
    "id": "33333333-3333-3333-3333-333333333333",
    "metadata": { "created_on": "2026-08-02T00:00:00.000Z" }
  }
]'

deployment_stable="$(
  # shellcheck source=/dev/null
  source "${CANARY_SCRIPT}"
  parse_deployments_status_json "${FIXTURE_DIR}/deployment-status.json"
)"
if [ "$deployment_stable" != "11111111-1111-1111-1111-111111111111" ]; then
  echo "Unexpected deployment status stable version: ${deployment_stable}" >&2
  exit 1
fi

list_stable="$(
  # shellcheck source=/dev/null
  source "${CANARY_SCRIPT}"
  parse_latest_version_from_list_json "${FIXTURE_DIR}/versions-list.json"
)"
if [ "$list_stable" != "33333333-3333-3333-3333-333333333333" ]; then
  echo "Unexpected versions list stable version: ${list_stable}" >&2
  exit 1
fi

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
