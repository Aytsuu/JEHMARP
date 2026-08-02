#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CANARY_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/cloudflare-worker-canary.sh"
ROLLBACK_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/canary-rollback.sh"
WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/deploy-production.yml"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

find "${REPOSITORY_ROOT}/.github/scripts" -name '*.sh' -print0 | xargs -0 sed -i 's/\r$//' 2>/dev/null || true

STABLE_UUID="d8284273-f9b5-4323-a829-e4a41ca2a3fb"
NEW_UUID="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
WORKER_NAME="jehmarp"

if git -C "$REPOSITORY_ROOT" ls-files --error-unmatch web/.wrangler/deploy/config.json >/dev/null 2>&1; then
  echo "web/.wrangler/deploy/config.json must not be tracked in git." >&2
  exit 1
fi

if ! grep -Fq '.wrangler/deploy/' "${REPOSITORY_ROOT}/web/.gitignore"; then
  echo "web/.gitignore must ignore generated .wrangler/deploy/ state." >&2
  exit 1
fi

write_mock_wrangler() {
  local mode="$1"
  local log_file="$2"
  cat > "${FIXTURE_DIR}/mock-wrangler" <<EOF
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "\$(pwd)" >> "${log_file}"
printf '%s\n' "\$*" >> "${log_file}"

case "\${1:-}" in
  --version)
    echo "4.112.0"
    ;;
  versions)
    shift
    case "\${1:-}" in
      upload)
        echo "Uploading Worker version..." >&1
        if [ -n "\${WRANGLER_OUTPUT_FILE_PATH:-}" ]; then
          printf '%s\n' '{"type":"version-upload","version_id":"${NEW_UUID}"}' > "\$WRANGLER_OUTPUT_FILE_PATH"
        fi
        ;;
      deploy)
        shift
        while [ "\$#" -gt 0 ]; do
          case "\$1" in
            --help|-h)
              exit 0
              ;;
            --name)
              printf '%s\n' "\$2" >> "${log_file}.worker-name"
              shift 2
              ;;
            --message)
              printf '%s\n' "\$2" >> "${log_file}.message"
              shift 2
              ;;
            --yes)
              shift
              ;;
            *)
              printf '%s\n' "\$1" >> "${log_file}.split"
              shift
              ;;
          esac
        done
        ;;
      list)
        shift
        while [ "\$#" -gt 0 ]; do
          case "\$1" in
            --name)
              printf '%s\n' "\$2" >> "${log_file}.worker-name"
              shift 2
              ;;
            --json)
              cat <<'JSON'
[
  {
    "id": "${STABLE_UUID}",
    "metadata": { "created_on": "2026-08-02T00:00:00.000Z" }
  }
]
JSON
              exit 0
              ;;
            *)
              shift
              ;;
          esac
        done
        ;;
      *)
        echo "unexpected versions command: \$*" >&2
        exit 99
        ;;
    esac
    ;;
  deployments)
    shift
    if [ "\${1:-}" = "status" ]; then
      shift
      while [ "\$#" -gt 0 ]; do
        case "\$1" in
          --name)
            printf '%s\n' "\$2" >> "${log_file}.worker-name"
            shift 2
            ;;
          --json)
            if [ "${mode}" = "fallback" ]; then
              echo "no deployments" >&2
              exit 1
            fi
            cat <<'JSON'
{
  "versions": [
    { "version_id": "${STABLE_UUID}", "percentage": 100 }
  ]
}
JSON
            exit 0
            ;;
          *)
            shift
            ;;
        esac
      done
    fi
    ;;
  *)
    echo "unexpected wrangler command: \$*" >&2
    exit 99
    ;;
esac
EOF
  chmod +x "${FIXTURE_DIR}/mock-wrangler"
}

assert_control_plane_cwd() {
  local log_file="$1"
  local expected="${REPOSITORY_ROOT}"

  if [ ! -f "$log_file" ]; then
    echo "Missing invocation log: ${log_file}" >&2
    exit 1
  fi

  while IFS= read -r cwd; do
    case "$cwd" in
      /*) ;;
      *)
        continue
        ;;
    esac
    if [ "$cwd" = "${REPOSITORY_ROOT}/web" ]; then
      echo "Control-plane command must not run from web/: ${cwd}" >&2
      exit 1
    fi
    if [ "$cwd" != "$expected" ]; then
      echo "Unexpected control-plane cwd: ${cwd} (expected ${expected})" >&2
      exit 1
    fi
  done < "$log_file"
}

assert_build_cwd() {
  local log_file="$1"
  local expected="${REPOSITORY_ROOT}/web"
  local cwd

  cwd="$(grep '^/' "$log_file" | tail -1)"
  if [ "$cwd" != "$expected" ]; then
    echo "Upload must run from web/, got: ${cwd:-<none>}" >&2
    exit 1
  fi
}

broken_redirect="${REPOSITORY_ROOT}/web/.wrangler/deploy/config.json"
mkdir -p "$(dirname "$broken_redirect")"
cat > "$broken_redirect" <<'EOF'
{"configPath":"..\\..\\dist\\server\\wrangler.json","auxiliaryWorkers":[],"prerenderWorkerConfigPath":"..\\..\\dist\\server\\.prerender\\wrangler.json"}
EOF
rm -rf "${REPOSITORY_ROOT}/web/dist/server/wrangler.json"

log_file="${FIXTURE_DIR}/deploy-split.log"
write_mock_wrangler status "$log_file"
(
  CANARY_WRANGLER_BIN="${FIXTURE_DIR}/mock-wrangler" \
  CLOUDFLARE_API_TOKEN="test-token" \
  CLOUDFLARE_ACCOUNT_ID="test-account" \
    bash "$CANARY_SCRIPT" deploy-split \
      "$NEW_UUID" "$STABLE_UUID" 25 75 "Production canary: 25% traffic"
)
assert_control_plane_cwd "$log_file"
if ! grep -Fxq "${WORKER_NAME}" "${log_file}.worker-name"; then
  echo "deploy-split must pass explicit --name." >&2
  cat "${log_file}.worker-name" >&2 || true
  exit 1
fi
if ! grep -Fxq "${NEW_UUID}@25" "${log_file}.split" \
  || ! grep -Fxq "${STABLE_UUID}@75" "${log_file}.split"; then
  echo "deploy-split must pass exact version percentages." >&2
  cat "${log_file}.split" >&2 || true
  exit 1
fi
if ! grep -Fxq "Production canary: 25% traffic" "${log_file}.message"; then
  echo "deploy-split must pass rollout message." >&2
  exit 1
fi

log_file="${FIXTURE_DIR}/stable.log"
write_mock_wrangler status "$log_file"
(
  CANARY_WRANGLER_BIN="${FIXTURE_DIR}/mock-wrangler" \
  CLOUDFLARE_API_TOKEN="test-token" \
  CLOUDFLARE_ACCOUNT_ID="test-account" \
    bash "$CANARY_SCRIPT" stable-version
) >"${FIXTURE_DIR}/stable.stdout"
assert_control_plane_cwd "$log_file"
if [ "$(tr -d '\n' < "${FIXTURE_DIR}/stable.stdout")" != "$STABLE_UUID" ]; then
  echo "stable-version stdout contract mismatch." >&2
  exit 1
fi

log_file="${FIXTURE_DIR}/status.log"
write_mock_wrangler status "$log_file"
(
  CANARY_WRANGLER_BIN="${FIXTURE_DIR}/mock-wrangler" \
  CLOUDFLARE_API_TOKEN="test-token" \
  CLOUDFLARE_ACCOUNT_ID="test-account" \
    bash "$CANARY_SCRIPT" deployments-status --json >/dev/null
)
assert_control_plane_cwd "$log_file"

log_file="${FIXTURE_DIR}/list.log"
write_mock_wrangler fallback "$log_file"
(
  CANARY_WRANGLER_BIN="${FIXTURE_DIR}/mock-wrangler" \
  CLOUDFLARE_API_TOKEN="test-token" \
  CLOUDFLARE_ACCOUNT_ID="test-account" \
    bash "$CANARY_SCRIPT" list-versions --json >/dev/null
)
assert_control_plane_cwd "$log_file"

log_file="${FIXTURE_DIR}/rollback.log"
write_mock_wrangler status "$log_file"
(
  CANARY_WRANGLER_BIN="${FIXTURE_DIR}/mock-wrangler" \
  CLOUDFLARE_API_TOKEN="test-token" \
  CLOUDFLARE_ACCOUNT_ID="test-account" \
  NEW_VERSION_ID="$NEW_UUID" \
  STABLE_VERSION_ID="$STABLE_UUID" \
    bash "$ROLLBACK_SCRIPT" "test rollback"
)
assert_control_plane_cwd "$log_file"
if ! grep -Fxq "${STABLE_UUID}@100" "${log_file}.split" \
  || ! grep -Fxq "${NEW_UUID}@0" "${log_file}.split"; then
  echo "canary-rollback must restore stable@100/new@0." >&2
  cat "${log_file}.split" >&2 || true
  exit 1
fi

log_file="${FIXTURE_DIR}/upload.log"
write_mock_wrangler status "$log_file"
(
  CANARY_WRANGLER_BIN="${FIXTURE_DIR}/mock-wrangler" \
  CLOUDFLARE_API_TOKEN="test-token" \
  CLOUDFLARE_ACCOUNT_ID="test-account" \
    bash "$CANARY_SCRIPT" upload
) >"${FIXTURE_DIR}/upload.stdout"
assert_build_cwd "$log_file"
if [ "$(tr -d '\n' < "${FIXTURE_DIR}/upload.stdout")" != "$NEW_UUID" ]; then
  echo "upload stdout contract mismatch." >&2
  exit 1
fi

log_file="${FIXTURE_DIR}/invalid.log"
write_mock_wrangler status "$log_file"
if (
  CANARY_WRANGLER_BIN="${FIXTURE_DIR}/mock-wrangler" \
  CLOUDFLARE_API_TOKEN="test-token" \
  CLOUDFLARE_ACCOUNT_ID="test-account" \
    bash "$CANARY_SCRIPT" deploy-split "not-a-uuid" "$STABLE_UUID" 25 75
) >/dev/null 2>&1; then
  echo "Expected invalid version ID to fail before control-plane deploy." >&2
  exit 1
fi
if [ -f "${log_file}.split" ]; then
  echo "Invalid deploy-split must not invoke versions deploy." >&2
  exit 1
fi

if ! grep -q 'rollback-on-remainder-failure' "$WORKFLOW"; then
  echo "deploy-production.yml must define rollback-on-remainder-failure." >&2
  exit 1
fi

if ! grep -q 'needs.canary-promote-remainder.result != .success' "$WORKFLOW"; then
  echo "rollback-on-remainder-failure must guard on remainder job failure." >&2
  exit 1
fi

if ! grep -q 'needs.migrate-and-canary-5.outputs.new_version_id' "$WORKFLOW" \
  || ! grep -q 'needs.migrate-and-canary-5.outputs.stable_version_id' "$WORKFLOW"; then
  echo "rollback-on-remainder-failure must receive immutable version IDs from migrate-and-canary-5." >&2
  exit 1
fi

if ! grep -A40 'rollback-on-remainder-failure:' "$WORKFLOW" | grep -q 'canary-rollback.sh'; then
  echo "rollback-on-remainder-failure must invoke canary-rollback.sh." >&2
  exit 1
fi

if grep -A40 'rollback-on-remainder-failure:' "$WORKFLOW" | grep -Eq 'supabase|migration|db push|versions upload'; then
  echo "rollback-on-remainder-failure must not run migration, upload, or database commands." >&2
  exit 1
fi

echo "cloudflare-worker-canary control-plane tests passed."
