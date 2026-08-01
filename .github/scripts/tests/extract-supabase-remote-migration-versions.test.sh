#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="${REPOSITORY_ROOT}/.github/scripts/extract-supabase-remote-migration-versions.sh"
FIXTURE="$(mktemp)"
trap 'rm -f "$FIXTURE"' EXIT

cat > "$FIXTURE" <<'EOF'
      Local          | Remote         | Time (UTC)
  ------------------|----------------|---------------------
                     | `20260727130000` | `2026-07-27 13:00:00`
`20260802000000`     |                | `2026-08-02 00:00:00`
EOF

output="$(bash "$SCRIPT" "$FIXTURE" | sort -u)"
if [ "$output" != "20260727130000" ]; then
  echo "Expected only the remote column version to be extracted." >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

echo "extract-supabase-remote-migration-versions tests passed."
