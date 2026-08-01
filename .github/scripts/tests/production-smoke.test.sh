#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SMOKE_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/production-smoke.sh"
SMOKE_LIB="${REPOSITORY_ROOT}/.github/scripts/smoke-lib.sh"

# shellcheck source=/dev/null
source "$SMOKE_LIB"

header="$(smoke_build_version_override_header "jehmarp" "test-version-id")"
expected='Cloudflare-Workers-Version-Overrides: jehmarp="test-version-id"'

if [ "$header" != "$expected" ]; then
  echo "Unexpected header: ${header}" >&2
  exit 1
fi

if BASE_URL="" bash "$SMOKE_SCRIPT" 2>/dev/null; then
  echo "Expected smoke script to fail without BASE_URL." >&2
  exit 1
fi

worker_name="$(bash "${REPOSITORY_ROOT}/.github/scripts/resolve-worker-name.sh")"
if [ "$worker_name" != "jehmarp" ]; then
  echo "Unexpected worker name from wrangler config: ${worker_name}" >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

cat > "${temp_dir}/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

url="${!#}"
if [[ "$url" == */shop ]]; then
  count_file="${FAKE_CURL_COUNTER:?}"
  count=0
  if [ -f "$count_file" ]; then
    count="$(cat "$count_file")"
  fi
  count=$((count + 1))
  printf '%s' "$count" > "$count_file"

  if [ "${FAKE_CURL_MODE:?}" = "transient" ] && [ "$count" -gt 1 ]; then
    printf '200'
  else
    printf '404'
  fi
elif [[ "$url" == */admin || "$url" == */agent ]]; then
  printf '302'
elif [[ "$url" == */api/login ]]; then
  printf '400'
else
  printf '200'
fi
EOF
chmod +x "${temp_dir}/curl"

if ! transient_output="$(
  PATH="${temp_dir}:$PATH" \
  FAKE_CURL_MODE=transient \
  FAKE_CURL_COUNTER="${temp_dir}/transient-count" \
  SMOKE_MAX_ATTEMPTS=2 \
  SMOKE_RETRY_DELAY_SECONDS=0 \
  BASE_URL="https://smoke.example" \
  bash "$SMOKE_SCRIPT" 2>&1
)"; then
  echo "Expected a transient /shop 404 to be retried successfully." >&2
  printf '%s\n' "$transient_output" >&2
  exit 1
fi

if [[ "$transient_output" != *"/shop: 200"* ]]; then
  echo "Expected retried /shop request to return 200." >&2
  printf '%s\n' "$transient_output" >&2
  exit 1
fi

if PATH="${temp_dir}:$PATH" \
  FAKE_CURL_MODE=persistent \
  FAKE_CURL_COUNTER="${temp_dir}/persistent-count" \
  SMOKE_MAX_ATTEMPTS=2 \
  SMOKE_RETRY_DELAY_SECONDS=0 \
  BASE_URL="https://smoke.example" \
  bash "$SMOKE_SCRIPT" >/dev/null 2>&1; then
  echo "Expected a persistent /shop 404 to fail the smoke check." >&2
  exit 1
fi

echo "production-smoke helper tests passed."
