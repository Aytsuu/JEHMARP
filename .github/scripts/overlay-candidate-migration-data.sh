#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TRUSTED_DIR=""
CANDIDATE_DIR=""
VALIDATE_MANIFEST=false

usage() {
  cat <<'EOF'
Usage: overlay-candidate-migration-data.sh --trusted DIR --candidate DIR [options]

Copy only candidate Supabase migration SQL and the approved archived checkpoint into
a trusted automation checkout. Never copies candidate scripts, workflows, or app code.

Options:
  --trusted DIR       Trusted automation checkout root (receives overlays).
  --candidate DIR     Candidate checkout root (source of migration data only).
  --validate-manifest Validate the candidate archive against the trusted manifest.
  -h, --help          Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --trusted)
      TRUSTED_DIR="${2:?--trusted requires a directory}"
      shift 2
      ;;
    --candidate)
      CANDIDATE_DIR="${2:?--candidate requires a directory}"
      shift 2
      ;;
    --validate-manifest)
      VALIDATE_MANIFEST=true
      shift
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

if [ -z "$TRUSTED_DIR" ] || [ -z "$CANDIDATE_DIR" ]; then
  echo "--trusted and --candidate are required." >&2
  usage >&2
  exit 1
fi

TRUSTED_DIR="$(cd "$TRUSTED_DIR" && pwd)"
CANDIDATE_DIR="$(cd "$CANDIDATE_DIR" && pwd)"

if [ ! -d "${TRUSTED_DIR}/.github/scripts" ]; then
  echo "Trusted checkout does not contain automation scripts: ${TRUSTED_DIR}/.github/scripts" >&2
  exit 1
fi

if [ ! -d "${CANDIDATE_DIR}/supabase/migrations" ]; then
  echo "Candidate checkout is missing supabase/migrations." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "${TRUSTED_DIR}/.github/scripts/load-baseline-compaction-manifest.sh"
baseline_compaction_manifest_load "$TRUSTED_DIR"

candidate_checkpoint="${CANDIDATE_DIR}/${BASELINE_COMPACTION_CHECKPOINT_DIRECTORY}"
if [ ! -d "$candidate_checkpoint" ]; then
  echo "Candidate checkout is missing the archived checkpoint: ${BASELINE_COMPACTION_CHECKPOINT_DIRECTORY}" >&2
  exit 1
fi

mkdir -p "${TRUSTED_DIR}/supabase/migrations"
mkdir -p "$(dirname "${TRUSTED_DIR}/${BASELINE_COMPACTION_CHECKPOINT_DIRECTORY}")"

rsync -a --delete "${CANDIDATE_DIR}/supabase/migrations/" "${TRUSTED_DIR}/supabase/migrations/"
rsync -a --delete "${candidate_checkpoint}/" "${TRUSTED_DIR}/${BASELINE_COMPACTION_CHECKPOINT_DIRECTORY}/"

if [ "$VALIDATE_MANIFEST" = true ]; then
  baseline_compaction_validate_checkpoint_directory \
    "${TRUSTED_DIR}/${BASELINE_COMPACTION_CHECKPOINT_DIRECTORY}" \
    "$BASELINE_COMPACTION_ARCHIVED_VERSIONS_PATH"
fi

echo "Overlaid candidate migration data into trusted checkout:"
echo "  migrations -> ${TRUSTED_DIR}/supabase/migrations"
echo "  checkpoint -> ${TRUSTED_DIR}/${BASELINE_COMPACTION_CHECKPOINT_DIRECTORY}"
