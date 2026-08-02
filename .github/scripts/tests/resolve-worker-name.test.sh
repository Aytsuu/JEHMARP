#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RESOLVE_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/resolve-worker-name.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

production_name="$(bash "$RESOLVE_SCRIPT")"
if [ "$production_name" != "jehmarp" ]; then
  echo "Expected production worker name 'jehmarp', got '${production_name}'." >&2
  exit 1
fi

staging_name="$(WRANGLER_ENV=staging bash "$RESOLVE_SCRIPT")"
if [ "$staging_name" != "jehmarp-staging" ]; then
  echo "Expected staging worker name 'jehmarp-staging', got '${staging_name}'." >&2
  exit 1
fi

staging_name_arg="$(bash "$RESOLVE_SCRIPT" staging)"
if [ "$staging_name_arg" != "jehmarp-staging" ]; then
  echo "Expected positional staging arg to resolve 'jehmarp-staging', got '${staging_name_arg}'." >&2
  exit 1
fi

cat > "${FIXTURE_DIR}/wrangler.jsonc" <<'JSONC'
{
  "name": "jehmarp",
  "env": {
    "staging": {
      "name": "jehmarp-staging"
    }
  }
}
JSONC

fixture_production="$(
  WRANGLER_CONFIG="${FIXTURE_DIR}/wrangler.jsonc" bash "$RESOLVE_SCRIPT"
)"
fixture_staging="$(
  WRANGLER_CONFIG="${FIXTURE_DIR}/wrangler.jsonc" WRANGLER_ENV=staging bash "$RESOLVE_SCRIPT"
)"

if [ "$fixture_production" != "jehmarp" ] || [ "$fixture_staging" != "jehmarp-staging" ]; then
  echo "Fixture resolution failed: production=${fixture_production}, staging=${fixture_staging}" >&2
  exit 1
fi

echo "resolve-worker-name helper tests passed."
