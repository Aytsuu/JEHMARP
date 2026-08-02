#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CANARY_SCRIPT="${REPOSITORY_ROOT}/.github/scripts/cloudflare-worker-canary.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

# Normalize CRLF from Windows checkouts so Linux CI/Docker runs stay reliable.
find "${REPOSITORY_ROOT}/.github/scripts" -name '*.sh' -print0 | xargs -0 sed -i 's/\r$//' 2>/dev/null || true

STABLE_UUID="d8284273-f9b5-4323-a829-e4a41ca2a3fb"
UPLOAD_UUID="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
FALLBACK_UUID="33333333-3333-3333-3333-333333333333"

write_fixture() {
  local name="$1"
  local content="$2"
  printf '%s' "$content" > "${FIXTURE_DIR}/${name}"
}

assert_exact_stdout_uuid() {
  local label="$1"
  local expected_uuid="$2"
  local stdout_file="$3"

  if [ "$(wc -c < "$stdout_file" | tr -d ' ')" -ne 37 ]; then
    echo "${label}: expected exactly 37 bytes (UUID + newline), got $(wc -c < "$stdout_file")" >&2
    cat -A "$stdout_file" >&2 || true
    exit 1
  fi

  if ! cmp -s <(printf '%s\n' "$expected_uuid") "$stdout_file"; then
    echo "${label}: stdout contract mismatch." >&2
    cat -A "$stdout_file" >&2 || true
    exit 1
  fi
}

write_mock_wrangler() {
  local mode="$1"
  local mock_bin="${FIXTURE_DIR}/bin"
  mkdir -p "$mock_bin"

  cat > "${mock_bin}/npx" <<EOF
#!/usr/bin/env bash
set -euo pipefail

if [ "\$1" != "wrangler" ]; then
  echo "unexpected npx invocation: \$*" >&2
  exit 99
fi
shift

case "\$1" in
  --version)
    echo "4.112.0"
    ;;
  versions)
    shift
    case "\$1" in
      upload)
        echo "Uploading Worker version..." >&1
        if [ -n "\${WRANGLER_OUTPUT_FILE_PATH:-}" ]; then
          printf '%s\n' '{"type":"version-upload","version_id":"${UPLOAD_UUID}"}' > "\$WRANGLER_OUTPUT_FILE_PATH"
        fi
        ;;
      deploy)
        exit 0
        ;;
      list)
        shift
        while [ "\$#" -gt 0 ]; do
          case "\$1" in
            --name)
              shift 2
              ;;
            --json)
              cat "${FIXTURE_DIR}/versions-list.json"
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
    if [ "\$1" = "status" ]; then
      shift
      while [ "\$#" -gt 0 ]; do
        case "\$1" in
          --name)
            shift 2
            ;;
          --json)
            if [ "${mode}" = "fallback" ]; then
              echo "no deployments" >&2
              exit 1
            fi
            cat "${FIXTURE_DIR}/deployment-status.json"
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
  chmod +x "${mock_bin}/npx"
  printf '%s' "$mock_bin"
}

run_with_mock_wrangler() {
  local mode="$1"
  shift
  local mock_bin
  mock_bin="$(write_mock_wrangler "$mode")"

  CLOUDFLARE_API_TOKEN="test-token" \
  CLOUDFLARE_ACCOUNT_ID="test-account" \
  PATH="${mock_bin}:${PATH}" \
    bash "$CANARY_SCRIPT" "$@"
}

write_fixture "deployment-status.json" \
  "$(cat <<EOF
{
  "created_on": "2026-08-02T00:00:00.000Z",
  "versions": [
    { "version_id": "${STABLE_UUID}", "percentage": 100 }
  ]
}
EOF
)"

write_fixture "versions-list.json" \
  "$(cat <<'EOF'
[
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "metadata": { "created_on": "2026-08-01T00:00:00.000Z" }
  },
  {
    "id": "33333333-3333-3333-3333-333333333333",
    "metadata": { "created_on": "2026-08-02T00:00:00.000Z" }
  }
]
EOF
)"

deployment_stable="$(
  # shellcheck source=/dev/null
  source "${CANARY_SCRIPT}"
  parse_deployments_status_json "${FIXTURE_DIR}/deployment-status.json"
)"
if [ "$deployment_stable" != "$STABLE_UUID" ]; then
  echo "Unexpected deployment status stable version: ${deployment_stable}" >&2
  exit 1
fi

list_stable="$(
  # shellcheck source=/dev/null
  source "${CANARY_SCRIPT}"
  parse_latest_version_from_list_json "${FIXTURE_DIR}/versions-list.json"
)"
if [ "$list_stable" != "$FALLBACK_UUID" ]; then
  echo "Unexpected versions list stable version: ${list_stable}" >&2
  exit 1
fi

stdout_file="${FIXTURE_DIR}/stable.stdout"
stderr_file="${FIXTURE_DIR}/stable.stderr"
run_with_mock_wrangler status stable-version >"$stdout_file" 2>"$stderr_file"
assert_exact_stdout_uuid "stable-version" "$STABLE_UUID" "$stdout_file"
if ! grep -Fq "supports versions upload/deploy." "$stderr_file"; then
  echo "Expected wrangler capability confirmation on stderr for stable-version." >&2
  cat "$stderr_file" >&2
  exit 1
fi

stdout_file="${FIXTURE_DIR}/upload.stdout"
stderr_file="${FIXTURE_DIR}/upload.stderr"
run_with_mock_wrangler status upload >"$stdout_file" 2>"$stderr_file"
assert_exact_stdout_uuid "upload" "$UPLOAD_UUID" "$stdout_file"
if ! grep -Fq "Uploading Worker version..." "$stderr_file"; then
  echo "Expected wrangler upload progress on stderr." >&2
  cat "$stderr_file" >&2
  exit 1
fi

stdout_file="${FIXTURE_DIR}/fallback.stdout"
stderr_file="${FIXTURE_DIR}/fallback.stderr"
if ! run_with_mock_wrangler fallback stable-version >"$stdout_file" 2>"$stderr_file"; then
  echo "fallback stable-version failed." >&2
  cat "$stderr_file" >&2
  exit 1
fi
assert_exact_stdout_uuid "stable-version fallback" "$FALLBACK_UUID" "$stdout_file"

# shellcheck source=/dev/null
source "${CANARY_SCRIPT}"
if ( assert_worker_version_id "not-a-uuid" ) >/dev/null 2>&1; then
  echo "Expected invalid Worker version ID to fail closed." >&2
  exit 1
fi

if ( assert_worker_version_id "$(printf 'bad\n%s' "$STABLE_UUID")" ) >/dev/null 2>&1; then
  echo "Expected multiline Worker version ID to fail closed." >&2
  exit 1
fi

github_output="${FIXTURE_DIR}/github-output"
stable_capture="${FIXTURE_DIR}/stable-capture"
run_with_mock_wrangler status stable-version >"$stable_capture"
if ! printf '%s' "$(tr -d '\n' < "$stable_capture")" | grep -Eq '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; then
  echo "Captured stable version is not a valid UUID." >&2
  exit 1
fi
printf 'stable_version_id=%s\n' "$(tr -d '\n' < "$stable_capture")" > "$github_output"
if [ "$(wc -l < "$github_output" | tr -d ' ')" -ne 1 ]; then
  echo "GITHUB_OUTPUT must contain exactly one line for stable_version_id." >&2
  cat "$github_output" >&2
  exit 1
fi
if ! grep -Fxq "stable_version_id=${STABLE_UUID}" "$github_output"; then
  echo "Unexpected GITHUB_OUTPUT stable line." >&2
  cat "$github_output" >&2
  exit 1
fi

upload_capture="${FIXTURE_DIR}/upload-capture"
run_with_mock_wrangler status upload >"$upload_capture"
printf 'new_version_id=%s\n' "$(tr -d '\n' < "$upload_capture")" > "$github_output"
if ! grep -Fxq "new_version_id=${UPLOAD_UUID}" "$github_output"; then
  echo "Unexpected GITHUB_OUTPUT upload line." >&2
  cat "$github_output" >&2
  exit 1
fi

if run_with_mock_wrangler status deploy-split "not-a-uuid" "$STABLE_UUID" 0 100 >/dev/null 2>&1; then
  echo "Expected deploy-split to reject invalid new version IDs." >&2
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

WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/deploy-production.yml"
if ! grep -q 'stable-version must emit exactly one Worker version UUID' "$WORKFLOW" \
  || ! grep -q 'upload must emit exactly one Worker version UUID' "$WORKFLOW" \
  || ! grep -q "printf 'stable_version_id=%s" "$WORKFLOW" \
  || ! grep -q "printf 'new_version_id=%s" "$WORKFLOW"; then
  echo "deploy-production.yml must validate UUID outputs before writing GITHUB_OUTPUT." >&2
  exit 1
fi

echo "cloudflare-worker-canary helper tests passed."
