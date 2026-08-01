#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/assert-supabase-baseline-ledger-state.sh"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

BASELINE_VERSION="20260802000000"
ARCHIVED_CHECKPOINT="${REPOSITORY_ROOT}/supabase/_archived_migrations/20260802_checkpoint_prebaseline"
mapfile -t ARCHIVED_VERSIONS < <(
  find "$ARCHIVED_CHECKPOINT" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' \
    | sed -nE 's/^([0-9]{14})_.+\.sql$/\1/p' \
    | sort -u
)

if [ "${#ARCHIVED_VERSIONS[@]}" -eq 0 ]; then
  echo "Expected archived checkpoint versions for tests." >&2
  exit 1
fi

write_migration_list_fixture() {
  local output_file="$1"
  shift

  {
    printf '%s\n' "      Local          | Remote         | Time (UTC)"
    printf '%s\n' "  ------------------|----------------|---------------------"
    while [ "$#" -gt 0 ]; do
      printf '   %18s | `%14s` | `%s`\n' "$1" "$1" "2026-08-01 00:00:00"
      shift
    done
  } > "$output_file"
}

write_archived_versions_fixture() {
  local output_file="$1"
  printf '%s\n' "${ARCHIVED_VERSIONS[@]}" > "$output_file"
}

run_guard() {
  local expected_status="$1"
  local connection_args=("${@:2}")
  set +e
  output="$(
  BASELINE_LEDGER_TARGET=staging \
    bash "$SCRIPT_PATH" "${connection_args[@]}" 2>&1
  )"
  status=$?
  set -e

  if [ "$status" -ne "$expected_status" ]; then
    echo "Expected exit ${expected_status}, got ${status} for: ${connection_args[*]}" >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi

  printf '%s' "$output"
}

archived_list_file="${FIXTURE_DIR}/archived-only.txt"
write_migration_list_fixture "$archived_list_file" "${ARCHIVED_VERSIONS[@]}"

output="$(run_guard 1 --linked --migration-list-file "$archived_list_file")"
if ! printf '%s\n' "$output" | grep -Fq "Reconcile Supabase Baseline"; then
  echo "Expected archived-checkpoint rejection to name Reconcile Supabase Baseline." >&2
  printf '%s\n' "$output" >&2
  exit 1
fi
if ! printf '%s\n' "$output" | grep -Fq "target: staging"; then
  echo "Expected archived-checkpoint rejection to name target staging." >&2
  exit 1
fi
if ! printf '%s\n' "$output" | grep -Fq "expected_baseline_version: ${BASELINE_VERSION}"; then
  echo "Expected archived-checkpoint rejection to name baseline version." >&2
  exit 1
fi
if ! printf '%s\n' "$output" | grep -Fq "execution_mode: plan-only"; then
  echo "Expected archived-checkpoint rejection to recommend plan-only." >&2
  exit 1
fi

baseline_list_file="${FIXTURE_DIR}/baseline-only.txt"
write_migration_list_fixture "$baseline_list_file" "$BASELINE_VERSION"

output="$(run_guard 0 --linked --migration-list-file "$baseline_list_file")"
if ! printf '%s\n' "$output" | grep -Fq "Remote migration ledger matches the active baseline (${BASELINE_VERSION})"; then
  echo "Expected baseline-only ledger to permit db push." >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

empty_list_file="${FIXTURE_DIR}/empty.txt"
write_migration_list_fixture "$empty_list_file"

output="$(run_guard 1 --linked --migration-list-file "$empty_list_file")"
if ! printf '%s\n' "$output" | grep -Fq "does not match the archived checkpoint or the single-baseline state"; then
  echo "Expected empty remote ledger to fail closed as drift." >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

mixed_list_file="${FIXTURE_DIR}/mixed.txt"
write_migration_list_fixture "$mixed_list_file" "$BASELINE_VERSION" "${ARCHIVED_VERSIONS[0]}"

output="$(run_guard 1 --linked --migration-list-file "$mixed_list_file")"
if ! printf '%s\n' "$output" | grep -Fq "does not match the archived checkpoint or the single-baseline state"; then
  echo "Expected mixed remote ledger to fail closed as drift." >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

linked_probe="${FIXTURE_DIR}/linked-probe.txt"
write_migration_list_fixture "$linked_probe" "$BASELINE_VERSION"
mock_bin="${FIXTURE_DIR}/bin"
mkdir -p "$mock_bin"
cat > "${mock_bin}/supabase" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "migration" ] && [ "\$2" = "list" ] && [ "\$3" = "--linked" ]; then
  cat "${linked_probe}"
  exit 0
fi
echo "unexpected supabase invocation: \$*" >&2
exit 99
EOF
chmod +x "${mock_bin}/supabase"
output="$(
  PATH="${mock_bin}:$PATH" \
    bash "$SCRIPT_PATH" --linked 2>&1
)"
if ! printf '%s\n' "$output" | grep -Fq "Remote migration ledger matches the active baseline (${BASELINE_VERSION})"; then
  echo "Expected --linked mode to invoke supabase migration list --linked." >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

pooler_probe="${FIXTURE_DIR}/pooler-probe.txt"
write_migration_list_fixture "$pooler_probe" "$BASELINE_VERSION"
cat > "${mock_bin}/supabase" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "migration" ] && [ "\$2" = "list" ] && [ "\$3" = "--db-url" ] && [ "\$4" = "postgresql://example.test/db" ]; then
  cat "${pooler_probe}"
  exit 0
fi
echo "unexpected supabase invocation: \$*" >&2
exit 99
EOF
chmod +x "${mock_bin}/supabase"
output="$(
  PATH="${mock_bin}:$PATH" \
    bash "$SCRIPT_PATH" --db-url "postgresql://example.test/db" 2>&1
)"
if ! printf '%s\n' "$output" | grep -Fq "Remote migration ledger matches the active baseline (${BASELINE_VERSION})"; then
  echo "Expected --db-url mode to invoke supabase migration list --db-url." >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

secret_probe="${FIXTURE_DIR}/secret-probe.txt"
{
  write_migration_list_fixture "$secret_probe" "${ARCHIVED_VERSIONS[@]}"
  printf '%s\n' "postgresql://postgres:secret@db.example.test:6543/postgres" >> "$secret_probe"
} > "${secret_probe}.tmp"
mv "${secret_probe}.tmp" "$secret_probe"

output="$(run_guard 1 --linked --migration-list-file "$secret_probe")"
if printf '%s\n' "$output" | grep -Eiq 'postgresql://|password='; then
  echo "Failure output must not echo secret-bearing fixture content." >&2
  printf '%s\n' "$output" >&2
  exit 1
fi

echo "assert-supabase-baseline-ledger-state tests passed."
