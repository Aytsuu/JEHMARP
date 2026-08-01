#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=migration-diff-lib.sh
source "${SCRIPT_DIR}/migration-diff-lib.sh"
# shellcheck source=migration-baseline-compaction.sh
source "${SCRIPT_DIR}/migration-baseline-compaction.sh"

REPOSITORY_ROOT="$(migration_diff_lib_repository_root)"
DIFF_BASE=""
POLICY="production-pr"
GITHUB_STEP_SUMMARY="${GITHUB_STEP_SUMMARY:-}"

usage() {
  cat <<'EOF'
Usage: scan-changed-migrations-high-risk.sh --diff-base REF [--policy production-pr|migration-safety]

Scan current (added/modified) migration SQL for high-risk patterns. Deleted historical
migration paths are reported for audit only and are never opened for SQL inspection.

Environment:
  MIGRATION_REVIEWED=true     Acknowledge high-risk / compaction-baseline promotion review.
  CONTRACT_RELEASE=true       Allow contract migrations on production PR promotions.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --diff-base)
      DIFF_BASE="${2:?--diff-base requires a git ref}"
      shift 2
      ;;
    --policy)
      POLICY="${2:?--policy requires production-pr or migration-safety}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$DIFF_BASE" ]; then
  echo "--diff-base is required." >&2
  usage >&2
  exit 1
fi

if [ "$POLICY" != "production-pr" ] && [ "$POLICY" != "migration-safety" ]; then
  echo "Invalid --policy '${POLICY}'." >&2
  exit 1
fi

migration_diff_lib_assert_git_ref "$REPOSITORY_ROOT" "$DIFF_BASE"

mapfile -t audit_files < <(migration_diff_lib_all_changed_paths "$REPOSITORY_ROOT" "$DIFF_BASE" | sed '/^$/d')
mapfile -t current_files < <(migration_diff_lib_emit_current_scanable_paths "$REPOSITORY_ROOT" "$DIFF_BASE" | sed '/^$/d')

if [ "${#audit_files[@]}" -eq 0 ]; then
  echo "No migration directory changes detected since ${DIFF_BASE}."
  exit 0
fi

if [ "${#audit_files[@]}" -gt 0 ]; then
  echo "Migration audit paths (all statuses):"
  printf '  %s\n' "${audit_files[@]}"
fi

if [ "${#current_files[@]}" -eq 0 ]; then
  echo "No current scanable migration files in this diff (deletions-only or audit-only change)."
  exit 0
fi

echo "Current scanable migration files:"
printf '  %s\n' "${current_files[@]}"

blocking_pattern='drop[[:space:]]+(table|column|view|function)|truncate[[:space:]]|delete[[:space:]]+from|rename[[:space:]]+(table|column)|cascade'
review_pattern='alter[[:space:]]+column.*set[[:space:]]+not[[:space:]]+null|alter[[:space:]]+column.*(type|set[[:space:]]+data[[:space:]]+type)|drop[[:space:]]+policy|replace[[:space:]]+policy|security[[:space:]]+definer|grant[[:space:]]+'
destructive_reviewed_marker='migration-safety:[[:space:]]*destructive-reviewed'
unbounded_update_pattern='^[[:space:]]*update[[:space:]]+[^;[:space:]]+[[:space:]]+set[[:space:]]+'

legacy_files=()
contract_files=()
compaction_files=()

for file in "${current_files[@]}"; do
  abs_file="${REPOSITORY_ROOT}/${file}"

  if migration_baseline_compaction_is_verified_file "$REPOSITORY_ROOT" "$file"; then
    compaction_files+=("$abs_file")
    continue
  fi

  if head -n 20 "$abs_file" | grep -Eiq '^[[:space:]]*--[[:space:]]*migration-phase:[[:space:]]*contract'; then
    contract_files+=("$abs_file")
    continue
  fi

  if head -n 20 "$abs_file" | grep -Eiq '^[[:space:]]*--[[:space:]]*migration-phase:[[:space:]]*expand'; then
    continue
  fi

  legacy_files+=("$abs_file")
done

blocking_matches=""
review_matches=""
backfill_matches=""

if [ "${#legacy_files[@]}" -gt 0 ]; then
  blocking_matches="$(printf '%s\n' "${legacy_files[@]}" | xargs grep -Ein "${blocking_pattern}" || true)"
  review_matches="$(printf '%s\n' "${legacy_files[@]}" | xargs grep -Ein "${review_pattern}" || true)"
  backfill_matches="$(printf '%s\n' "${legacy_files[@]}" | xargs grep -Ein "${unbounded_update_pattern}" | grep -Eiv 'where' || true)"
fi

if [ "${#contract_files[@]}" -gt 0 ]; then
  review_matches="${review_matches}$(printf '%s\n' "${contract_files[@]}" | xargs grep -Ein "${review_pattern}" || true)"
  backfill_matches="${backfill_matches}$(printf '%s\n' "${contract_files[@]}" | xargs grep -Ein "${unbounded_update_pattern}" | grep -Eiv 'where' || true)"
fi

unreviewed_blocking_matches=""
if [ -n "$blocking_matches" ]; then
  while IFS= read -r match_line; do
    [ -z "$match_line" ] && continue
    file="${match_line%%:*}"
    if head -n 10 "$file" | grep -Eiq "${destructive_reviewed_marker}"; then
      echo "Acknowledged destructive SQL in ${file}"
      continue
    fi
    unreviewed_blocking_matches="${unreviewed_blocking_matches}${match_line}"$'\n'
  done <<< "$blocking_matches"
fi

unreviewed_backfill_matches=""
if [ -n "$backfill_matches" ]; then
  while IFS= read -r match_line; do
    [ -z "$match_line" ] && continue
    file="${match_line%%:*}"
    if head -n 10 "$file" | grep -Eiq "${destructive_reviewed_marker}"; then
      echo "Acknowledged backfill SQL in ${file}"
      continue
    fi
    unreviewed_backfill_matches="${unreviewed_backfill_matches}${match_line}"$'\n'
  done <<< "$backfill_matches"
fi

if [ "${#compaction_files[@]}" -gt 0 ]; then
  echo "Verified history-compaction baseline file(s) detected (excluded from legacy destructive scan):"
  printf '  %s\n' "${compaction_files[@]}"
fi

if [ "$POLICY" = "migration-safety" ]; then
  if [ -n "$review_matches" ] || [ -n "$unreviewed_backfill_matches" ]; then
    echo "Migration review recommended:"
    [ -n "$review_matches" ] && echo "$review_matches"
    [ -n "$unreviewed_backfill_matches" ] && echo "$unreviewed_backfill_matches"
    if [ -n "$GITHUB_STEP_SUMMARY" ]; then
      {
        echo "### Migration review recommended"
        echo ""
        echo "The following patterns were found in changed migrations:"
        echo "- \`alter column ... set not null\` or type changes"
        echo "- RLS policy replacement (\`drop policy\`, \`replace policy\`)"
        echo "- \`security definer\` functions"
        echo "- \`grant\` statements"
        echo "- Possible unbounded \`update ... set\` backfills without \`where\`"
        echo ""
        echo "These are expected for some RPC and RLS migrations, but should still be reviewed."
        echo "Add the \`migration-reviewed\` label after manual review if you want this noted on the PR."
      } >> "$GITHUB_STEP_SUMMARY"
    fi
  fi

  if [ -n "$unreviewed_blocking_matches" ]; then
    echo "Blocking migration SQL detected in legacy migrations:"
    echo "$unreviewed_blocking_matches"
    if [ -n "$GITHUB_STEP_SUMMARY" ]; then
      {
        echo "### Blocking migration SQL detected"
        echo ""
        echo "Destructive SQL was found in legacy migrations without \`migration-phase\` headers:"
        echo "- \`drop table\`, \`drop column\`, \`drop view\`, \`drop function\`"
        echo "- \`rename table\` or \`rename column\`"
        echo "- \`truncate\`"
        echo "- broad \`delete from\`"
        echo "- \`cascade\`"
        echo ""
        echo "Add Expand/Contract metadata to new migrations, or mark reviewed legacy files with"
        echo "\`-- migration-safety: destructive-reviewed\` near the top after manual review."
      } >> "$GITHUB_STEP_SUMMARY"
    fi

    if [ "${MIGRATION_REVIEWED:-}" != "true" ]; then
      exit 1
    fi
  elif [ -n "$blocking_matches" ]; then
    echo "Destructive SQL found only in migrations marked destructive-reviewed."
  fi

  if [ "${#compaction_files[@]}" -gt 0 ] && [ "${MIGRATION_REVIEWED:-}" != "true" ]; then
    echo "History-compaction baseline promotion requires the migration-reviewed label." >&2
    exit 1
  fi

  exit 0
fi

high_risk=false
if [ -n "$unreviewed_blocking_matches" ]; then
  high_risk=true
fi
if [ -n "$review_matches" ] || [ -n "$backfill_matches" ]; then
  high_risk=true
fi
if [ "${#contract_files[@]}" -gt 0 ]; then
  high_risk=true
  echo "Contract migrations in this promotion:"
  printf '%s\n' "${contract_files[@]}"
fi
if [ "${#compaction_files[@]}" -gt 0 ]; then
  high_risk=true
  echo "History-compaction baseline migration requires explicit PR review before merge."
fi

if [ -n "$GITHUB_STEP_SUMMARY" ]; then
  {
    echo "### Migration review policy"
    echo ""
    if [ "$high_risk" = true ]; then
      echo "This promotion includes Contract, history-compaction baseline, and/or high-risk migration SQL."
      echo "Required before merge:"
      if [ "${#contract_files[@]}" -gt 0 ]; then
        echo "- Add the \`contract-release\` or \`migration-reviewed\` label after manual review."
        echo "- Contract migrations are **not** auto-applied on \`main\` push; apply them only via \`deploy-contract-release.yml\` after backup evidence and production approval."
      else
        echo "- Add the \`migration-reviewed\` label after manual review."
      fi
      if [ "${#compaction_files[@]}" -gt 0 ]; then
        echo "- History-compaction baseline SQL is excluded from deleted-path scanning but still requires \`migration-reviewed\`."
      fi
      echo "- Obtain production environment approval when the protected \`production\` environment gate runs."
    else
      echo "No Contract or blocking high-risk migration patterns detected in current changed files."
    fi
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$high_risk" = true ]; then
  review_ok=false
  if [ "${MIGRATION_REVIEWED:-}" = "true" ]; then
    review_ok=true
  fi
  if [ "${#contract_files[@]}" -gt 0 ] && [ "${CONTRACT_RELEASE:-}" = "true" ]; then
    review_ok=true
  fi

  if [ "$review_ok" != true ]; then
    if [ -n "$unreviewed_blocking_matches" ]; then
      echo "Blocking migration SQL detected without migration-reviewed label:"
      echo "$unreviewed_blocking_matches"
    fi
    if [ "${#contract_files[@]}" -gt 0 ]; then
      echo "Contract migrations require the contract-release or migration-reviewed label."
      echo "Contract apply happens only via deploy-contract-release.yml (not automatic on main push)."
    fi
    if [ -n "$review_matches" ] || [ -n "$backfill_matches" ]; then
      echo "High-risk migration patterns require the migration-reviewed label."
    fi
    if [ "${#compaction_files[@]}" -gt 0 ]; then
      echo "History-compaction baseline promotion requires the migration-reviewed label."
    fi
    exit 1
  fi
fi

echo "High-risk migration scan passed."
