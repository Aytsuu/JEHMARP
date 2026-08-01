#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/validate-production-pr.yml"
MIGRATION_SAFETY_WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/supabase-migration-safety.yml"
TRUSTED_DRY_RUN_WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/production-migration-dry-run.yml"

if ! grep -q 'environment: production-validation' "$TRUSTED_DRY_RUN_WORKFLOW"; then
  echo "Trusted production migration dry-run must use production-validation." >&2
  exit 1
fi

if grep -q '^  production-migration-dry-run:$' "$WORKFLOW"; then
  echo "Validate production PR must not define a credentialed dry-run job; use pull_request_target workflow." >&2
  exit 1
fi

if grep -q '^  production-dry-run:$' "$MIGRATION_SAFETY_WORKFLOW"; then
  echo "Supabase migration safety must not define a credentialed production dry-run job." >&2
  exit 1
fi

if ! grep -q "github.event.pull_request.head.repo.full_name == github.repository" "$WORKFLOW"; then
  echo "Production PR validation must not expose validation credentials to fork pull requests." >&2
  exit 1
fi

if ! grep -q '^  validate:$' "$WORKFLOW"; then
  echo "Production PR validation must retain the secret-free validation job." >&2
  exit 1
fi

validation_job="$(sed -n '/^  validate:/,$p' "$WORKFLOW")"
if printf '%s\n' "$validation_job" | grep -Eq 'secrets\.(PUBLIC_SUPABASE|SUPABASE_SECRET_KEY|PUBLIC_TURNSTILE|TURNSTILE_SECRET_KEY|UPSTASH_|RESEND_|RESELLER_|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)'; then
  echo "Secret-free PR validation job must not expose production application or database credentials." >&2
  exit 1
fi

if ! printf '%s\n' "$validation_job" | grep -q 'STAGING_EVIDENCE_WAIT_ATTEMPTS:' \
  || ! printf '%s\n' "$validation_job" | grep -q 'STAGING_EVIDENCE_WAIT_INTERVAL_SECONDS:'; then
  echo "Production PR validation must configure a bounded wait for matching staging evidence." >&2
  exit 1
fi

if ! printf '%s\n' "$validation_job" | grep -q "run.status !== 'completed'" \
  || ! printf '%s\n' "$validation_job" | grep -q 'Waiting .* Deploy Staging workflow run'; then
  echo "Production PR validation must wait for an active matching staging deployment instead of failing early." >&2
  exit 1
fi

if ! printf '%s\n' "$validation_job" | grep -q 'conclusion === .success.' \
  || ! printf '%s\n' "$validation_job" | grep -q 'completed staging workflow run(s) failed'; then
  echo "Production PR validation must accept only successful staging evidence and report completed failures." >&2
  exit 1
fi

if printf '%s\n' "$validation_job" | grep -q "require('@actions/core')"; then
  echo "actions/github-script already injects core; validation must not redeclare it." >&2
  exit 1
fi

if ! grep -q 'SUPABASE_DB_PUSH_DRY_RUN: "true"' "$TRUSTED_DRY_RUN_WORKFLOW"; then
  echo "Trusted production migration dry-run must retain the migration dry-run guard." >&2
  exit 1
fi

for workflow in "$WORKFLOW" "$MIGRATION_SAFETY_WORKFLOW"; do
  if ! grep -q 'list-diff-migration-files.sh' "$workflow"; then
    echo "Migration workflows must derive current scanable files via list-diff-migration-files.sh." >&2
    exit 1
  fi

  if ! grep -q 'scan-changed-migrations-high-risk.sh' "$workflow"; then
    echo "Migration workflows must scan high-risk SQL via scan-changed-migrations-high-risk.sh." >&2
    exit 1
  fi

  if grep -q 'xargs grep -Ein' "$workflow"; then
    echo "Workflow must not inline xargs grep migration scans on unfiltered diff paths." >&2
    exit 1
  fi
done

if ! grep -q 'pull_request_target:' "$TRUSTED_DRY_RUN_WORKFLOW"; then
  echo "Credentialed production migration dry-run must be defined on trusted main via pull_request_target." >&2
  exit 1
fi

echo "validate-production-pr workflow tests passed."
