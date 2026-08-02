#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/configure-github-protections.sh"

if ! bash "$SCRIPT_PATH" --help >/dev/null; then
  echo "Expected --help to succeed." >&2
  exit 1
fi

if bash "$SCRIPT_PATH" --unknown-flag 2>/dev/null; then
  echo "Expected unknown flag to fail." >&2
  exit 1
fi

if ! output="$(DRY_RUN=true GITHUB_REPOSITORY=octocat/Hello-World bash "$SCRIPT_PATH" --repo octocat/Hello-World 2>&1)"; then
  echo "Expected dry-run to succeed without gh repo resolution." >&2
  exit 1
fi

if ! echo "$output" | grep -q 'DRY_RUN=true'; then
  echo "Expected dry-run output." >&2
  exit 1
fi

if ! echo "$output" | grep -q 'Validate dev to main'; then
  echo "Expected main required check name in summary." >&2
  exit 1
fi

if ! echo "$output" | grep -q 'Web checks'; then
  echo "Expected dev required check name in summary." >&2
  exit 1
fi

echo "configure-github-protections arg/dry-run tests passed."
