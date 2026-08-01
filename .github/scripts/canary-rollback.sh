#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANARY_SCRIPT="${SCRIPT_DIR}/cloudflare-worker-canary.sh"

NEW_VERSION_ID="${NEW_VERSION_ID:-}"
STABLE_VERSION_ID="${STABLE_VERSION_ID:-}"
ROLLBACK_REASON="${1:-Canary guard triggered automatic traffic reversal.}"

usage() {
  cat <<'EOF'
Usage: canary-rollback.sh [reason]

Reverse production Worker traffic to the prior stable version (stable@100%, new@0%).

Environment:
  NEW_VERSION_ID       Canary Worker version id.
  STABLE_VERSION_ID    Prior stable Worker version id.
  CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
EOF
}

write_rollback_summary() {
  local reason="$1"

  if [ -z "${GITHUB_STEP_SUMMARY:-}" ]; then
    return 0
  fi

  {
    echo "### Canary automatic rollback"
    echo ""
    echo "| Field | Value |"
    echo "| --- | --- |"
    echo "| Reason | ${reason} |"
    echo "| Stable version (restored to 100%) | \`${STABLE_VERSION_ID}\` |"
    echo "| Canary version (set to 0%) | \`${NEW_VERSION_ID}\` |"
    echo ""
    echo "Traffic split command:"
    echo ""
    echo '```bash'
    echo "bash .github/scripts/cloudflare-worker-canary.sh deploy-split \\"
    echo "  \"${STABLE_VERSION_ID}\" \\"
    echo "  \"${NEW_VERSION_ID}\" \\"
    echo "  100 0"
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ -z "$NEW_VERSION_ID" ] || [ -z "$STABLE_VERSION_ID" ]; then
  echo "NEW_VERSION_ID and STABLE_VERSION_ID are required for canary rollback." >&2
  exit 1
fi

if [ "$NEW_VERSION_ID" = "$STABLE_VERSION_ID" ]; then
  echo "NEW_VERSION_ID and STABLE_VERSION_ID must differ for rollback." >&2
  exit 1
fi

echo "Rolling back canary traffic: stable=${STABLE_VERSION_ID}@100% new=${NEW_VERSION_ID}@0%"
echo "Reason: ${ROLLBACK_REASON}"

bash "$CANARY_SCRIPT" deploy-split \
  "$STABLE_VERSION_ID" \
  "$NEW_VERSION_ID" \
  100 0 \
  "Auto rollback: ${ROLLBACK_REASON}"

write_rollback_summary "$ROLLBACK_REASON"
echo "Canary rollback completed."
