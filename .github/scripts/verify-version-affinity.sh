#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

BASE_URL=""
WORKER_NAME=""
VERSION_A=""
VERSION_B=""
AFFINITY_KEY="${AFFINITY_KEY:-ci-version-affinity-probe}"
PROBE_PATH="${PROBE_PATH:-/login}"
PROBE_COUNT="${PROBE_COUNT:-5}"
VERSION_AFFINITY_REQUIRED="${VERSION_AFFINITY_REQUIRED:-false}"
AFFINITY_COOKIE_NAME="${AFFINITY_COOKIE_NAME:-cf_worker_version_key}"

usage() {
  cat <<'EOF'
Usage: verify-version-affinity.sh [options]

Best-effort verification of Cloudflare Worker version affinity during canary rollouts.

Options:
  --base-url URL           Production origin (or set BASE_URL / PRODUCTION_BASE_URL).
  --worker-name NAME       Worker name for Version-Overrides header (or resolve via env).
  --version-a ID           New/canary Worker version id (VERSION_A / NEW).
  --version-b ID           Stable Worker version id (VERSION_B / STABLE).
  --affinity-key KEY       Stable Cloudflare-Workers-Version-Key value for probes.
  --probe-path PATH        Path to probe (default: /login).
  --probe-count N          Repeated affinity probes (default: 5).

Environment:
  VERSION_AFFINITY_REQUIRED=true   Fail when affinity cannot be verified automatically.
  AFFINITY_KEY                       Default version key for repeated probes.
  PROBE_PATH / PROBE_COUNT           Probe tuning.
  AFFINITY_COOKIE_NAME               Cookie name documented for Transform Rules (default cf_worker_version_key).

Cloudflare does not expose the routed Worker version id in response headers unless the
application uses the version metadata binding. This script compares response fingerprints
(body hash + selected headers) across probes and override headers. When automatic proof is
 inconclusive it prints a Transform Rule checklist for operators.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:?--base-url requires a URL}"
      shift 2
      ;;
    --worker-name)
      WORKER_NAME="${2:?--worker-name requires a name}"
      shift 2
      ;;
    --version-a|--new-version)
      VERSION_A="${2:?--version-a requires a version id}"
      shift 2
      ;;
    --version-b|--stable-version)
      VERSION_B="${2:?--version-b requires a version id}"
      shift 2
      ;;
    --affinity-key)
      AFFINITY_KEY="${2:?--affinity-key requires a value}"
      shift 2
      ;;
    --probe-path)
      PROBE_PATH="${2:?--probe-path requires a path}"
      shift 2
      ;;
    --probe-count)
      PROBE_COUNT="${2:?--probe-count requires a number}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      echo "Unexpected positional argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

BASE_URL="${BASE_URL:-${PRODUCTION_BASE_URL:-}}"
VERSION_A="${VERSION_A:-${NEW_VERSION_ID:-}}"
VERSION_B="${VERSION_B:-${STABLE_VERSION_ID:-}}"

if [ -z "$BASE_URL" ]; then
  echo "Missing --base-url (or BASE_URL / PRODUCTION_BASE_URL)." >&2
  exit 1
fi

if [ -z "$WORKER_NAME" ]; then
  WORKER_NAME="$(bash "${SCRIPT_DIR}/resolve-worker-name.sh")"
fi

if [ -z "$VERSION_A" ] || [ -z "$VERSION_B" ]; then
  echo "Both --version-a and --version-b are required." >&2
  exit 1
fi

if [ "$VERSION_A" = "$VERSION_B" ]; then
  echo "version-a and version-b must differ for canary affinity probes." >&2
  exit 1
fi

if ! [[ "$PROBE_COUNT" =~ ^[1-9][0-9]*$ ]]; then
  echo "PROBE_COUNT must be a positive integer (got: ${PROBE_COUNT})." >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
if [[ "$PROBE_PATH" != /* ]]; then
  PROBE_PATH="/${PROBE_PATH}"
fi

build_override_header() {
  local worker_name="$1"
  local version_id="$2"
  printf 'Cloudflare-Workers-Version-Overrides: %s="%s"' "$worker_name" "$version_id"
}

print_transform_rule_checklist() {
  cat <<EOF
### Cloudflare version affinity operator checklist

Cloudflare routes by \`Cloudflare-Workers-Version-Key\` during gradual deployments. Transform
Rules are required on a custom zone route (not \`*.workers.dev\`).

1. Open Cloudflare dashboard → your zone → **Rules** → **Transform Rules** → **Modify request header**.
2. Create a rule for production traffic to the Worker route.
3. **Expression** (cookie-based affinity — set cookie from Worker or upstream session):

   \`http.cookie contains "${AFFINITY_COOKIE_NAME}"\`

4. **Operation**: Set dynamic header
   - Header name: \`Cloudflare-Workers-Version-Key\`
   - Value: \`http.request.cookies["${AFFINITY_COOKIE_NAME}"][0]\`

5. Alternative (authenticated apps): map a stable session/user cookie to the same header.
6. For anonymous traffic without cookies, consider \`ip.src\` as the key (see Cloudflare docs).
7. Verify manually:

   \`\`\`bash
   curl -sS "${BASE_URL}${PROBE_PATH}" -H 'Cloudflare-Workers-Version-Key: manual-probe-1'
   curl -sS "${BASE_URL}${PROBE_PATH}" -H 'Cloudflare-Workers-Version-Key: manual-probe-1'
   \`\`\`

8. Optional: add the [version metadata binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
   to expose \`x-worker-version-id\` in responses for automated CI verification.

Docs: https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/version-affinity/
EOF
}

fetch_fingerprint() {
  local extra_header="${1:-}"
  local url="${BASE_URL}${PROBE_PATH}"
  local tmp_body tmp_headers

  tmp_body="$(mktemp)"
  tmp_headers="$(mktemp)"

  local curl_args=(
    -sS
    -L
    --max-redirs 5
    -D "$tmp_headers"
    -o "$tmp_body"
    -H "Cloudflare-Workers-Version-Key: ${AFFINITY_KEY}"
  )

  if [ -n "$extra_header" ]; then
    curl_args+=(-H "$extra_header")
  fi

  if ! curl "${curl_args[@]}" "$url"; then
    rm -f "$tmp_body" "$tmp_headers"
    echo "curl probe failed for ${url}" >&2
    return 1
  fi

  local version_header=""
  version_header="$(grep -Ei '^(x-worker-version-id|cf-worker-version-id|x-jehmarp-worker-version):' "$tmp_headers" | tail -1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)"

  python3 - "$tmp_body" "$tmp_headers" "$version_header" <<'PY'
import hashlib
import sys

body_path, headers_path, version_header = sys.argv[1], sys.argv[2], sys.argv[3]
with open(body_path, "rb") as handle:
    body_hash = hashlib.sha256(handle.read()).hexdigest()

etag = ""
with open(headers_path, encoding="utf-8", errors="replace") as handle:
    for line in handle:
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        name = name.strip().lower()
        value = value.strip()
        if name == "etag":
            etag = value

# cf-ray identifies an individual Cloudflare request, so it must not be part of
# an affinity fingerprint: it changes even when a stable Version-Key selects
# the same Worker version on every request.
parts = [body_hash, etag]
if version_header:
    parts.append(version_header)
print("|".join(parts))
PY

  rm -f "$tmp_body" "$tmp_headers"
}

echo "Version affinity probe: ${BASE_URL}${PROBE_PATH}"
echo "Worker: ${WORKER_NAME}"
echo "Canary versions: new=${VERSION_A} stable=${VERSION_B}"
echo "Affinity key: ${AFFINITY_KEY}"
echo "VERSION_AFFINITY_REQUIRED=${VERSION_AFFINITY_REQUIRED}"

override_a="$(build_override_header "$WORKER_NAME" "$VERSION_A")"
override_b="$(build_override_header "$WORKER_NAME" "$VERSION_B")"

fingerprint_a=""
fingerprint_b=""
if fingerprint_a="$(fetch_fingerprint "$override_a")" && fingerprint_b="$(fetch_fingerprint "$override_b")"; then
  echo "Override probe fingerprints:"
  echo "  version-a (${VERSION_A}): ${fingerprint_a}"
  echo "  version-b (${VERSION_B}): ${fingerprint_b}"
else
  echo "Unable to complete version override probes." >&2
  print_transform_rule_checklist
  if [ "$VERSION_AFFINITY_REQUIRED" = "true" ]; then
    exit 1
  fi
  echo "Version affinity verification inconclusive (override probes failed; VERSION_AFFINITY_REQUIRED=false)."
  exit 0
fi

overrides_differ=false
if [ "$fingerprint_a" != "$fingerprint_b" ]; then
  overrides_differ=true
  echo "Version overrides produce distinct fingerprints — canary versions are reachable."
else
  echo "Version override probes returned identical fingerprints; responses may be too similar to distinguish."
fi

declare -a affinity_fingerprints=()
affinity_failed=false
for i in $(seq 1 "$PROBE_COUNT"); do
  if fp="$(fetch_fingerprint)"; then
    affinity_fingerprints+=("$fp")
    echo "Affinity probe ${i}/${PROBE_COUNT}: ${fp}"
  else
    affinity_failed=true
    break
  fi
done

if [ "$affinity_failed" = true ]; then
  print_transform_rule_checklist
  if [ "$VERSION_AFFINITY_REQUIRED" = "true" ]; then
    exit 1
  fi
  echo "Version affinity verification inconclusive (affinity probes failed; VERSION_AFFINITY_REQUIRED=false)."
  exit 0
fi

first_fp="${affinity_fingerprints[0]}"
affinity_sticky=true
for fp in "${affinity_fingerprints[@]}"; do
  if [ "$fp" != "$first_fp" ]; then
    affinity_sticky=false
    break
  fi
done

exposed_version_id=false
if [[ "$first_fp" == *"x-worker-version-id"* ]] || [[ "$first_fp" == *"cf-worker-version-id"* ]] || [[ "$first_fp" == *"x-jehmarp-worker-version"* ]]; then
  exposed_version_id=true
fi

verification_passed=false
if [ "$affinity_sticky" = true ]; then
  echo "Repeated requests with the same Version-Key returned consistent fingerprints."
  if [ "$overrides_differ" = true ]; then
    verification_passed=true
    echo "Version affinity verification passed (sticky affinity key + distinct override fingerprints)."
  elif [ "$exposed_version_id" = true ]; then
    verification_passed=true
    echo "Version affinity verification passed (sticky affinity key + exposed version metadata)."
  else
    echo "Affinity is sticky but override fingerprints are identical; canary split may not be detectable from content alone."
  fi
else
  echo "Affinity probes returned inconsistent fingerprints with the same Version-Key." >&2
  echo "This may indicate missing Transform Rule affinity, dynamic page content, or active split without stable routing." >&2
fi

if [ "$verification_passed" = true ]; then
  exit 0
fi

print_transform_rule_checklist

if [ "$VERSION_AFFINITY_REQUIRED" = "true" ]; then
  echo "Version affinity verification failed (VERSION_AFFINITY_REQUIRED=true)." >&2
  exit 1
fi

echo "Version affinity verification inconclusive — operator checklist printed (VERSION_AFFINITY_REQUIRED=false)."
exit 0
