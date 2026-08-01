#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/validate-production-pr.yml"
MIGRATION_SAFETY_WORKFLOW="${REPOSITORY_ROOT}/.github/workflows/supabase-migration-safety.yml"

if ! grep -q '^    environment: production-validation$' "$WORKFLOW"; then
  echo "Production PR validation must use the non-deploying production-validation environment." >&2
  exit 1
fi

if grep -q '^    environment: production$' "$WORKFLOW"; then
  echo "Production PR validation must not request the protected production environment." >&2
  exit 1
fi

if ! grep -q "github.event.pull_request.head.repo.full_name == github.repository" "$WORKFLOW"; then
  echo "Production PR validation must not expose validation credentials to fork pull requests." >&2
  exit 1
fi

if ! grep -q '^  production-migration-dry-run:$' "$WORKFLOW"; then
  echo "Production migration planning must run in a separate, narrowly scoped job." >&2
  exit 1
fi

validation_job="$(sed -n '/^  validate:/,/^  production-migration-dry-run:/p' "$WORKFLOW")"
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

if ! grep -A 12 '^  production-migration-dry-run:$' "$WORKFLOW" | grep -q '^    needs: validate$'; then
  echo "Production migration dry-run must wait for the secret-free validation job." >&2
  exit 1
fi

dry_run_job="$(sed -n '/^  production-migration-dry-run:/,$p' "$WORKFLOW")"
if printf '%s\n' "$dry_run_job" | grep -Eq 'secrets\.(PUBLIC_SUPABASE|SUPABASE_SECRET_KEY|PUBLIC_TURNSTILE|TURNSTILE_SECRET_KEY|UPSTASH_|RESEND_|RESELLER_|CLOUDFLARE_)'; then
  echo "Production migration dry-run must receive only Supabase migration credentials." >&2
  exit 1
fi

if ! printf '%s\n' "$dry_run_job" | grep -Fq '[ ! -f .github/scripts/validate-migration-phase-metadata.sh ]'; then
  echo "Production migration dry-run must safely handle a trusted base that predates the metadata helper." >&2
  exit 1
fi

for workflow in "$WORKFLOW" "$MIGRATION_SAFETY_WORKFLOW"; do
  if ! grep -q 'path: trusted$' "$workflow" \
    || ! grep -q 'ref: \${{ github.event.pull_request.base.sha }}' "$workflow" \
    || ! grep -q 'path: candidate$' "$workflow" \
    || ! grep -q 'ref: \${{ github.event.pull_request.head.sha }}' "$workflow"; then
    echo "Production migration dry-run must check out trusted automation separately from candidate migrations." >&2
    exit 1
  fi

  if ! grep -q 'rsync -a --delete candidate/supabase/migrations/ trusted/supabase/migrations/' "$workflow"; then
    echo "Production migration dry-run must overlay only candidate migration SQL onto trusted automation." >&2
    exit 1
  fi

  if ! grep -q 'working-directory: trusted' "$workflow"; then
    echo "Production migration dry-run must execute from the trusted checkout." >&2
    exit 1
  fi
done

if ! grep -q 'SUPABASE_DB_PUSH_DRY_RUN: "true"' "$WORKFLOW"; then
  echo "Production PR validation must retain the migration dry-run guard." >&2
  exit 1
fi

if ! grep -q '^    environment: production-validation$' "$MIGRATION_SAFETY_WORKFLOW"; then
  echo "Production migration dry-run must use the non-deploying production-validation environment." >&2
  exit 1
fi

if grep -q '^    environment: production$' "$MIGRATION_SAFETY_WORKFLOW"; then
  echo "Production migration dry-run must not request the protected production environment." >&2
  exit 1
fi

if ! grep -q "github.event.pull_request.head.repo.full_name == github.repository" "$MIGRATION_SAFETY_WORKFLOW"; then
  echo "Production migration dry-run must not expose validation credentials to fork pull requests." >&2
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

echo "validate-production-pr workflow tests passed."
