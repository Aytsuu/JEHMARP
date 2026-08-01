#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/verify-version-affinity.sh"

if bash "$SCRIPT_PATH" --help >/dev/null; then
  : # help exits 0
else
  echo "Expected --help to succeed." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" 2>/dev/null; then
  echo "Expected script to fail without required args." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" \
  --base-url "https://example.com" \
  --worker-name "jehmarp" \
  --version-a "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" \
  --version-b "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" 2>/dev/null; then
  echo "Expected identical version ids to fail." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" \
  --base-url "https://example.com" \
  --worker-name "jehmarp" \
  --version-a "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" \
  --version-b "bbbbbbbb-cccc-dddd-eeee-ffffffffffffff" \
  --probe-count 0 2>/dev/null; then
  echo "Expected invalid probe-count to fail." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --unknown-flag 2>/dev/null; then
  echo "Expected unknown flag to fail." >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

cat > "${temp_dir}/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

headers_file=""
body_file=""
override=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -D)
      headers_file="$2"
      shift 2
      ;;
    -o)
      body_file="$2"
      shift 2
      ;;
    -H)
      if [[ "$2" == Cloudflare-Workers-Version-Overrides:* ]]; then
        override="$2"
      fi
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

counter_file="${FAKE_CURL_COUNTER:?}"
counter=0
if [ -f "$counter_file" ]; then
  counter="$(cat "$counter_file")"
fi
counter=$((counter + 1))
printf '%s' "$counter" > "$counter_file"

response_body="stable-response"
if [[ "$override" == *'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'* ]]; then
  response_body="version-a-response"
elif [[ "$override" == *'bbbbbbbb-cccc-dddd-eeee-ffffffffffffff'* ]]; then
  response_body="version-b-response"
fi

printf 'HTTP/2 200\r\nETag: "stable"\r\ncf-ray: request-%s\r\n\r\n' "$counter" > "$headers_file"
printf '%s' "$response_body" > "$body_file"
EOF
chmod +x "${temp_dir}/curl"

if ! affinity_output="$(
  PATH="${temp_dir}:$PATH" \
  FAKE_CURL_COUNTER="${temp_dir}/counter" \
  VERSION_AFFINITY_REQUIRED=true \
  bash "$SCRIPT_PATH" \
    --base-url "https://example.com" \
    --worker-name "jehmarp" \
    --version-a "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" \
    --version-b "bbbbbbbb-cccc-dddd-eeee-ffffffffffffff" \
    --probe-count 2 2>&1
)"; then
  echo "Expected stable affinity to pass when only cf-ray changes between probes." >&2
  printf '%s\n' "$affinity_output" >&2
  exit 1
fi

if [[ "$affinity_output" != *"Version affinity verification passed"* ]]; then
  echo "Expected successful version-affinity verification output." >&2
  printf '%s\n' "$affinity_output" >&2
  exit 1
fi

echo "verify-version-affinity arg validation tests passed."
