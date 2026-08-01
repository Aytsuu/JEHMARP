#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=smoke-lib.sh
source "${SCRIPT_DIR}/smoke-lib.sh"

OBSERVATION_LABEL="${OBSERVATION_LABEL:-canary promotion}"
CANARY_OBSERVE_SECONDS="${CANARY_OBSERVE_SECONDS:-90}"
CANARY_PROBE_INTERVAL_SECONDS="${CANARY_PROBE_INTERVAL_SECONDS:-15}"
CANARY_PROBE_COUNT="${CANARY_PROBE_COUNT:-20}"
CANARY_MAX_ERROR_RATE="${CANARY_MAX_ERROR_RATE:-0.05}"
CANARY_PROBE_FAILURES_MAX="${CANARY_PROBE_FAILURES_MAX:-}"
CANARY_PROBE_PATHS="${CANARY_PROBE_PATHS:-/,/shop,/login,/contact}"
CANARY_GUARD_MODE="${CANARY_GUARD_MODE:-probe}"
NEW_VERSION_ID="${NEW_VERSION_ID:-}"
STABLE_VERSION_ID="${STABLE_VERSION_ID:-}"

usage() {
  cat <<'EOF'
Usage: canary-observe-and-guard.sh

Observe Worker health between canary promotions and roll back to the stable version
when probe failure thresholds are breached.

Environment:
  BASE_URL / PRODUCTION_BASE_URL          Target origin (required).
  NEW_VERSION_ID / STABLE_VERSION_ID      Canary rollback pair (required).
  OBSERVATION_LABEL                       Summary label for logs and rollback reason.
  CANARY_OBSERVE_SECONDS                  Observation window (default: 90).
  CANARY_PROBE_INTERVAL_SECONDS           Poll interval during observation (default: 15).
  CANARY_PROBE_COUNT                      Requests per poll batch (default: 20).
  CANARY_MAX_ERROR_RATE                   Maximum allowed failure rate (default: 0.05).
  CANARY_PROBE_FAILURES_MAX               Optional absolute failure cap per batch.
  CANARY_PROBE_PATHS                      Comma-separated paths to probe.
  CANARY_GUARD_MODE                       probe (default) or analytics (reserved).
EOF
}

canary_compute_allowed_failures() {
  local total="$1"
  local max_error_rate="$2"
  local explicit_max="${3:-}"

  python3 - "$total" "$max_error_rate" "$explicit_max" <<'PY'
import math
import sys

total = int(sys.argv[1])
rate = float(sys.argv[2])
explicit = sys.argv[3].strip()

if explicit:
    print(int(explicit))
    raise SystemExit(0)

print(math.floor(total * rate))
PY
}

probe_once() {
  local path="$1"
  local status

  if [[ "$path" != /* ]]; then
    path="/${path}"
  fi

  status="$(smoke_curl_status "${BASE_URL}${path}" -L --max-redirs 5 || true)"
  if [ "$status" = "200" ]; then
    return 0
  fi

  echo "Probe failure: ${path} returned ${status}" >&2
  return 1
}

run_probe_batch() {
  local paths_csv="$1"
  local probe_count="$2"
  local failures=0
  local total=0
  local path_index=0
  local path

  IFS=',' read -r -a paths <<< "$paths_csv"
  if [ "${#paths[@]}" -eq 0 ]; then
    echo "No probe paths configured." >&2
    return 1
  fi

  for ((i = 0; i < probe_count; i++)); do
    path="${paths[$((path_index % ${#paths[@]}))]}"
    path_index=$((path_index + 1))
    path="${path#"${path%%[![:space:]]*}"}"
    path="${path%"${path##*[![:space:]]}"}"
    [ -z "$path" ] && continue

    total=$((total + 1))
    if ! probe_once "$path"; then
      failures=$((failures + 1))
    fi
  done

  if [ "$total" -eq 0 ]; then
    echo "No probe paths configured." >&2
    return 1
  fi

  printf '%s|%s' "$failures" "$total"
}

write_guard_summary() {
  local outcome="$1"
  local failures="$2"
  local total="$3"
  local allowed_failures="$4"

  if [ -z "${GITHUB_STEP_SUMMARY:-}" ]; then
    return 0
  fi

  {
    echo "### Canary observation (${OBSERVATION_LABEL})"
    echo ""
    echo "| Field | Value |"
    echo "| --- | --- |"
    echo "| Outcome | ${outcome} |"
    echo "| Mode | ${CANARY_GUARD_MODE} |"
    echo "| Window (seconds) | ${CANARY_OBSERVE_SECONDS} |"
    echo "| Probe paths | ${CANARY_PROBE_PATHS} |"
    echo "| Failures / total (final batch) | ${failures} / ${total} |"
    echo "| Allowed failures | ${allowed_failures} |"
    echo "| Max error rate | ${CANARY_MAX_ERROR_RATE} |"
  } >> "$GITHUB_STEP_SUMMARY"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if ! smoke_require_base_url; then
  exit 1
fi

if [ -z "$NEW_VERSION_ID" ] || [ -z "$STABLE_VERSION_ID" ]; then
  echo "NEW_VERSION_ID and STABLE_VERSION_ID are required." >&2
  exit 1
fi

if ! [[ "$CANARY_OBSERVE_SECONDS" =~ ^[0-9]+$ ]] || [ "$CANARY_OBSERVE_SECONDS" -lt 1 ]; then
  echo "CANARY_OBSERVE_SECONDS must be a positive integer." >&2
  exit 1
fi

if ! [[ "$CANARY_PROBE_INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo "CANARY_PROBE_INTERVAL_SECONDS must be a positive integer." >&2
  exit 1
fi

if ! [[ "$CANARY_PROBE_COUNT" =~ ^[1-9][0-9]*$ ]]; then
  echo "CANARY_PROBE_COUNT must be a positive integer." >&2
  exit 1
fi

allowed_failures="$(canary_compute_allowed_failures "$CANARY_PROBE_COUNT" "$CANARY_MAX_ERROR_RATE" "$CANARY_PROBE_FAILURES_MAX")"

echo "Canary observation (${OBSERVATION_LABEL})"
echo "Window: ${CANARY_OBSERVE_SECONDS}s, poll interval: ${CANARY_PROBE_INTERVAL_SECONDS}s"
echo "Guard mode: ${CANARY_GUARD_MODE}"
echo "Allowed probe failures per batch: ${allowed_failures} (rate <= ${CANARY_MAX_ERROR_RATE})"

if [ "$CANARY_GUARD_MODE" = "analytics" ]; then
  echo "CANARY_GUARD_MODE=analytics is not implemented yet; falling back to HTTP probes." >&2
fi

deadline=$((SECONDS + CANARY_OBSERVE_SECONDS))
batch_index=0
final_failures=0
final_total=0

while [ "$SECONDS" -lt "$deadline" ]; do
  batch_index=$((batch_index + 1))
  echo "Probe batch ${batch_index}..."

  batch_result="$(run_probe_batch "$CANARY_PROBE_PATHS" "$CANARY_PROBE_COUNT")"
  final_failures="${batch_result%%|*}"
  final_total="${batch_result#*|}"

  echo "Batch ${batch_index}: failures=${final_failures} total=${final_total}"

  if [ "$final_failures" -gt "$allowed_failures" ]; then
    write_guard_summary "rollback" "$final_failures" "$final_total" "$allowed_failures"
    bash "${SCRIPT_DIR}/canary-rollback.sh" \
      "Probe failure threshold breached during ${OBSERVATION_LABEL} (${final_failures}/${final_total} failures)."
    exit 1
  fi

  remaining=$((deadline - SECONDS))
  if [ "$remaining" -le 0 ]; then
    break
  fi

  sleep_for="$CANARY_PROBE_INTERVAL_SECONDS"
  if [ "$sleep_for" -gt "$remaining" ]; then
    sleep_for="$remaining"
  fi

  sleep "$sleep_for"
done

write_guard_summary "passed" "$final_failures" "$final_total" "$allowed_failures"
echo "Canary observation passed for ${OBSERVATION_LABEL}."
