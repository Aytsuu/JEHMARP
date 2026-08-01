#!/usr/bin/env bash
set -euo pipefail

SOURCE_SHA=""
REQUIRE_DEV_BRANCH=true
REMOTE_NAME="origin"
DEV_BRANCH="dev"

usage() {
  cat <<'EOF'
Usage: validate-migration-source-sha.sh --sha FULL_SHA [options]

Validate an immutable candidate migration source reference for trusted reconciliation.

Options:
  --sha FULL_SHA            Forty-character commit SHA to validate.
  --remote NAME             Git remote to inspect (default: origin).
  --dev-branch NAME         Required branch name (default: dev).
  --allow-non-dev           Skip the dev-branch ancestry requirement.
  -h, --help                Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --sha)
      SOURCE_SHA="${2:?--sha requires a value}"
      shift 2
      ;;
    --remote)
      REMOTE_NAME="${2:?--remote requires a value}"
      shift 2
      ;;
    --dev-branch)
      DEV_BRANCH="${2:?--dev-branch requires a value}"
      shift 2
      ;;
    --allow-non-dev)
      REQUIRE_DEV_BRANCH=false
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

if [ -z "$SOURCE_SHA" ]; then
  echo "--sha is required." >&2
  usage >&2
  exit 1
fi

if ! [[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "migration_source_sha must be an immutable forty-character commit SHA." >&2
  exit 1
fi

if ! git cat-file -e "${SOURCE_SHA}^{commit}" 2>/dev/null; then
  echo "migration_source_sha does not resolve to a commit in this repository." >&2
  exit 1
fi

if [ "$REQUIRE_DEV_BRANCH" = true ]; then
  if ! git show-ref --verify --quiet "refs/remotes/${REMOTE_NAME}/${DEV_BRANCH}"; then
    echo "Required remote branch ${REMOTE_NAME}/${DEV_BRANCH} is not available." >&2
    exit 1
  fi

  dev_tip="$(git rev-parse "${REMOTE_NAME}/${DEV_BRANCH}")"
  if ! git merge-base --is-ancestor "$SOURCE_SHA" "$dev_tip"; then
    echo "migration_source_sha must be reachable from ${REMOTE_NAME}/${DEV_BRANCH}." >&2
    exit 1
  fi
fi

printf '%s\n' "$SOURCE_SHA"
