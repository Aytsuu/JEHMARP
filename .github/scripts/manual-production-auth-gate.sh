#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANARY_SCRIPT="${SCRIPT_DIR}/cloudflare-worker-canary.sh"

RUN_ID="${RUN_ID:-}"
WORKER_VERSION_ID="${WORKER_VERSION_ID:-}"
STABLE_VERSION_ID="${STABLE_VERSION_ID:-}"
CANARY_STAGE="${CANARY_STAGE:-after-5-percent}"
ATTESTATION_RESULT="${MANUAL_AUTH_ATTESTATION_RESULT:-passed}"

usage() {
  cat <<'EOF'
Usage: manual-production-auth-gate.sh record

Record a manual real-browser production authentication attestation after the
protected production-canary-auth environment is approved.

Environment:
  RUN_ID / GITHUB_RUN_ID              Deployment workflow run identifier.
  WORKER_VERSION_ID                   Canary Worker version under verification.
  STABLE_VERSION_ID                   Prior stable Worker version (rollback target).
  CANARY_STAGE                        Canary stage label (default: after-5-percent).
  MANUAL_AUTH_ATTESTATION_RESULT      passed|failed (default: passed).

The attestation must never include passwords, cookies, Turnstile tokens, o
session values. Operators verify through a real browser after 5% promotion because
plain browsers cannot reach a 0% Worker version without a verified version-affinity
or override mechanism.
EOF
}

assert_uuid() {
  local label="$1"
  local value="$2"

  if ! [[ "$value" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    echo "${label} must be a canonical UUID." >&2
    exit 1
  fi
}

write_attestation_summary() {
  local timestamp_utc
  timestamp_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### Manual production authentication attestation"
      echo ""
      echo "| Field | Value |"
      echo "| --- | --- |"
      echo "| Run ID | \`${RUN_ID}\` |"
      echo "| Canary Worker version | \`${WORKER_VERSION_ID}\` |"
      echo "| Stable rollback target | \`${STABLE_VERSION_ID}\` |"
      echo "| Canary stage | ${CANARY_STAGE} |"
      echo "| Timestamp (UTC) | ${timestamp_utc} |"
      echo "| Result | ${ATTESTATION_RESULT} |"
      echo ""
      echo "Operator verified through the real production \`/login\` page with the"
      echo "dedicated smoke-admin account and confirmed:"
      echo ""
      echo "- \`/dashboard\` -> 200"
      echo "- \`/admin\` -> 200"
      echo "- \`/admin/dashboard-summary.json\` -> 200"
      echo ""
      echo "No password, cookie, Turnstile token, or session value is recorded here."
    } >> "$GITHUB_STEP_SUMMARY"
  fi

  echo "Manual production authentication attestation recorded."
  echo "run_id=${RUN_ID}"
  echo "worker_version_id=${WORKER_VERSION_ID}"
  echo "canary_stage=${CANARY_STAGE}"
  echo "timestamp_utc=${timestamp_utc}"
  echo "result=${ATTESTATION_RESULT}"
}

record_attestation() {
  RUN_ID="${RUN_ID:-${GITHUB_RUN_ID:-}}"
  if [ -z "$RUN_ID" ]; then
    echo "RUN_ID or GITHUB_RUN_ID is required." >&2
    exit 1
  fi

  assert_uuid "WORKER_VERSION_ID" "$WORKER_VERSION_ID"
  assert_uuid "STABLE_VERSION_ID" "$STABLE_VERSION_ID"

  case "$ATTESTATION_RESULT" in
    passed)
      write_attestation_summary
      ;;
    failed)
      echo "Manual production authentication attestation failed." >&2
      write_attestation_summary
      bash "${SCRIPT_DIR}/canary-rollback.sh" \
        "Manual production authentication gate failed at ${CANARY_STAGE}."
      exit 1
      ;;
    *)
      echo "MANUAL_AUTH_ATTESTATION_RESULT must be passed or failed." >&2
      exit 1
      ;;
  esac
}

command="${1:-}"
shift || true

case "$command" in
  record)
    record_attestation
    ;;
  -h|--help|"")
    usage
    ;;
  *)
    echo "Unknown command: ${command}" >&2
    usage >&2
    exit 1
    ;;
esac
