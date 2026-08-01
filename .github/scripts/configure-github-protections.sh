#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="${DRY_RUN:-true}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-}"
GITHUB_PRODUCTION_REVIEWER="${GITHUB_PRODUCTION_REVIEWER:-}"
STAGING_BRANCH="${STAGING_BRANCH:-dev}"
PRODUCTION_BRANCH="${PRODUCTION_BRANCH:-main}"

# Required status check contexts (workflow job `name:` fields).
MAIN_REQUIRED_CHECKS=(
  "Validate dev to main"
)

DEV_REQUIRED_CHECKS=(
  "Web checks"
  "Local Supabase checks"
)

usage() {
  cat <<'EOF'
Usage: configure-github-protections.sh [options]

Configure GitHub Environments and repository rulesets for JEHMARP CI/CD branch policy.

Options:
  --dry-run              Print planned gh api calls without applying (default: true).
  --apply                Set DRY_RUN=false and apply changes (requires admin rights).
  --repo OWNER/NAME      Target repository (default: gh repo view --json nameWithOwner).
  --production-reviewer USER_OR_TEAM
                         Required reviewer for production environment (GITHUB_PRODUCTION_REVIEWER).

Environment:
  DRY_RUN=true|false     Default true — must set DRY_RUN=false or pass --apply to mutate GitHub.
  GITHUB_PRODUCTION_REVIEWER  Username or team slug for production approvals.

This script is idempotent: it updates existing environments/rulesets when found by name.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --apply)
      DRY_RUN=false
      shift
      ;;
    --repo)
      GITHUB_REPOSITORY="${2:?--repo requires OWNER/NAME}"
      shift 2
      ;;
    --production-reviewer)
      GITHUB_PRODUCTION_REVIEWER="${2:?--production-reviewer requires a value}"
      shift 2
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

if [ -z "$GITHUB_REPOSITORY" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI is required to resolve repository (set GITHUB_REPOSITORY or install gh)." >&2
    exit 1
  fi
  GITHUB_REPOSITORY="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
fi

OWNER="${GITHUB_REPOSITORY%%/*}"
REPO="${GITHUB_REPOSITORY#*/}"

api_json() {
  local method="$1"
  local endpoint="$2"
  local payload="${3:-}"

  if [ "$DRY_RUN" = true ]; then
    echo "[DRY_RUN] gh api --method ${method} ${endpoint}"
    if [ -n "$payload" ]; then
      echo "[DRY_RUN] payload: ${payload}"
    fi
    return 0
  fi

  if [ -n "$payload" ]; then
    gh api --method "$method" "$endpoint" --input - <<<"$payload"
  else
    gh api --method "$method" "$endpoint"
  fi
}

api_get() {
  local endpoint="$1"
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY_RUN] gh api ${endpoint}"
    return 0
  fi
  gh api "$endpoint"
}

resolve_reviewer_payload() {
  local reviewer="$1"
  if [ -z "$reviewer" ]; then
    echo "GITHUB_PRODUCTION_REVIEWER is required for production environment reviewers." >&2
    return 1
  fi

  if [[ "$reviewer" == */* ]]; then
    org="${reviewer%%/*}"
    team_slug="${reviewer#*/}"
    if [ "$DRY_RUN" = true ]; then
      echo "[DRY_RUN] resolve team ${org}/${team_slug}" >&2
      printf '{"reviewers":[{"type":"Team","id":0}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
      return 0
    fi
    team_id="$(gh api "orgs/${org}/teams/${team_slug}" -q .id)"
    printf '{"reviewers":[{"type":"Team","id":%s}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' "$team_id"
    return 0
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "[DRY_RUN] resolve user ${reviewer}" >&2
    printf '{"reviewers":[{"type":"User","id":0}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
    return 0
  fi

  user_id="$(gh api "users/${reviewer}" -q .id)"
  printf '{"reviewers":[{"type":"User","id":%s}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' "$user_id"
}

ensure_deployment_branch_policy() {
  local environment="$1"
  local branch_pattern="$2"

  local endpoint="repos/${OWNER}/${REPO}/environments/${environment}/deployment-branch-policies"
  local existing_id=""

  if [ "$DRY_RUN" = false ]; then
    existing_id="$(gh api "$endpoint" --jq ".branch_policies[] | select(.name == \"${branch_pattern}\") | .id" 2>/dev/null | head -1 || true)"
  else
    echo "[DRY_RUN] list deployment branch policies for ${environment}"
  fi

  if [ -n "$existing_id" ]; then
    echo "Deployment branch policy '${branch_pattern}' already exists for ${environment} (id ${existing_id})."
    return 0
  fi

  payload="$(printf '{"name":"%s","type":"branch"}' "$branch_pattern")"
  api_json POST "$endpoint" "$payload"
  echo "Created deployment branch policy '${branch_pattern}' for ${environment}."
}

configure_environment() {
  local environment="$1"
  local payload="$2"

  endpoint="repos/${OWNER}/${REPO}/environments/${environment}"
  api_json PUT "$endpoint" "$payload"
  echo "Configured environment: ${environment}"
}

build_ruleset_payload() {
  local name="$1"
  local branch_ref="$2"
  local checks_csv="$3"
  local include_admin="${4:-false}"

  local checks_json=""
  local check
  local IFS=','

  for check in $checks_csv; do
    check="$(echo "$check" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [ -z "$check" ] && continue
    checks_json="${checks_json}{\"context\":\"${check}\"},"
  done
  checks_json="[${checks_json%,}]"

  local bypass_json="[]"
  if [ "$include_admin" = "true" ]; then
    bypass_json='[{"actor_id":1,"actor_type":"OrganizationAdmin","bypass_mode":"always"}]'
  fi

  printf '{"name":"%s","target":"branch","enforcement":"active","conditions":{"ref_name":{"include":["refs/heads/%s"],"exclude":[]}},"bypass_actors":%s,"rules":[{"type":"pull_request","parameters":{"required_approving_review_count":1,"dismiss_stale_reviews_on_push":true,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false}},{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":true,"required_checks":%s}}]}' \
    "$name" "$branch_ref" "$bypass_json" "$checks_json"
}

upsert_ruleset() {
  local name="$1"
  local branch_ref="$2"
  local checks_csv="$3"
  local include_admin="${4:-false}"

  local ruleset_id=""
  if [ "$DRY_RUN" = false ]; then
    ruleset_id="$(gh api "repos/${OWNER}/${REPO}/rulesets" --jq ".[] | select(.name == \"${name}\") | .id" 2>/dev/null | head -1 || true)"
  else
    echo "[DRY_RUN] list rulesets to find '${name}'"
  fi

  payload="$(build_ruleset_payload "$name" "$branch_ref" "$checks_csv" "$include_admin")"

  if [ -n "$ruleset_id" ]; then
    api_json PUT "repos/${OWNER}/${REPO}/rulesets/${ruleset_id}" "$payload"
    echo "Updated ruleset '${name}' (id ${ruleset_id})."
  else
    api_json POST "repos/${OWNER}/${REPO}/rulesets" "$payload"
    echo "Created ruleset '${name}'."
  fi
}

echo "Repository: ${OWNER}/${REPO}"
echo "DRY_RUN=${DRY_RUN}"
echo "Staging branch policy target: ${STAGING_BRANCH}"
echo "Production branch policy target: ${PRODUCTION_BRANCH}"

if [ "$DRY_RUN" = false ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI is required for --apply." >&2
    exit 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "gh is not authenticated. Run 'gh auth login' before --apply." >&2
    exit 1
  fi
elif ! command -v gh >/dev/null 2>&1; then
  echo "Note: gh CLI not found — dry-run will print planned API calls only."
fi

staging_payload="$(printf '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}')"
if ! configure_environment "staging" "$staging_payload"; then
  echo "Failed to configure staging environment (admin rights required)." >&2
fi
if ! ensure_deployment_branch_policy "staging" "$STAGING_BRANCH"; then
  echo "Failed to configure staging deployment branch policy." >&2
fi

if [ -n "$GITHUB_PRODUCTION_REVIEWER" ]; then
  if ! production_payload="$(resolve_reviewer_payload "$GITHUB_PRODUCTION_REVIEWER")"; then
    echo "Failed to resolve production reviewer '${GITHUB_PRODUCTION_REVIEWER}'." >&2
    exit 1
  fi
else
  production_payload='{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
  echo "Note: GITHUB_PRODUCTION_REVIEWER not set — production reviewers will not be configured."
fi

if ! configure_environment "production" "$production_payload"; then
  echo "Failed to configure production environment (admin rights required)." >&2
fi
if ! ensure_deployment_branch_policy "production" "$PRODUCTION_BRANCH"; then
  echo "Failed to configure production deployment branch policy." >&2
fi

main_checks_csv="Validate dev to main"
dev_checks_csv="Web checks,Local Supabase checks"

upsert_ruleset "JEHMARP main protection" "$PRODUCTION_BRANCH" "$main_checks_csv" false
upsert_ruleset "JEHMARP dev protection" "$STAGING_BRANCH" "$dev_checks_csv" true

cat <<EOF

Summary:
- staging environment: deployment branch policy allows '${STAGING_BRANCH}' only.
- production environment: deployment branch policy allows '${PRODUCTION_BRANCH}' only.
- production reviewers: ${GITHUB_PRODUCTION_REVIEWER:-<not configured>}
- main ruleset: require PR + status checks ${MAIN_REQUIRED_CHECKS[*]}
- dev ruleset: require PR + Feature Branch CI checks ${DEV_REQUIRED_CHECKS[*]} (org admins may bypass)

Tradeoff (dev): requiring PRs from feature branches improves CI enforcement but slows maintainer hotfixes.
Documented alternative: allow direct push to dev for maintainers and rely on Deploy Staging as integration gate.

To apply: DRY_RUN=false GITHUB_PRODUCTION_REVIEWER=<user-or-org/team> bash .github/scripts/configure-github-protections.sh --apply
EOF
