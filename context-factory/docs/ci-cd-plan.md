# CI/CD Plan

This document defines the target GitHub Actions CI/CD architecture for JEHMARP.
It assumes one **managed Supabase staging project** and one managed Supabase
production project. The Astro application is deployed as a server-rendered
Cloudflare Worker; Vercel is not part of this deployment architecture.

The central deployment rule is:

> A production database schema must remain compatible with every Worker version
> that can still receive production traffic.

Database changes therefore follow the Expand/Contract pattern. Cloudflare
Worker versions provide blue-green/canary delivery for application code, but
there is one production database rather than two independently writable
production databases.

## Goals

- Validate Astro application quality before a change reaches `dev`.
- Validate every migration from a clean local Supabase database.
- Validate `dev` against a persistent, production-like managed Supabase staging
  project before it is promoted to production.
- Prevent destructive schema changes from being applied while old Worker or
  client versions may still depend on the legacy contract.
- Deploy compatible Worker versions gradually, with measurable rollback.
- Keep production mutation limited to protected `main` and a reviewed release.
- Keep environment-specific secrets in GitHub Environments; never commit them.

## Environments and Promotion Flow

```text
feature branch
  │  Feature Branch CI: check, lint, test, build, local Supabase tests
  ▼
dev
  │  Deploy Staging: staging migrations → staging Worker → staging smoke tests
  ▼
dev → main pull request
  │  Production Validation: local replay, staging validation, production dry-run,
  │  migration-phase policy, release approval
  ▼
main
  │  Production release: compatible migration → Worker upload → canary promotion
  ▼
production
```

Supabase staging and production are separate managed projects with separate API
URLs, credentials, Auth settings, Storage buckets, and service keys. Staging
uses synthetic or sanitized data only; production customer data must not be
copied into staging without an approved data-handling process.

### Branch policy

- Feature branches merge into `dev`.
- `dev` is the integration branch and deploys to the managed staging project.
- `main` is production and receives changes only through an approved `dev → main`
  pull request.
- Contract migrations are merged only after their compatibility window has
  completed and the production environment approval is granted.

## Required GitHub Environments and Secrets

Create protected `staging` and `production` GitHub Environments. Production
requires reviewers; staging may use lighter approval.

| Secret | Staging | Production | Purpose |
| :-- | :--: | :--: | :-- |
| `SUPABASE_ACCESS_TOKEN` | Yes | Yes | Authenticates the Supabase CLI. |
| `SUPABASE_PROJECT_REF` | Yes | Yes | Environment-specific Supabase project reference. |
| `SUPABASE_DB_PASSWORD` | Yes | Yes | Environment-specific database password. |
| `SUPABASE_DB_POOLER_URL` | Optional | Optional | Fallback CLI connection path for migration commands. |
| `PUBLIC_SUPABASE_URL` | Yes | Yes | Environment-specific application URL. |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Yes | Environment-specific browser key. |
| `SUPABASE_SECRET_KEY` | Yes | Yes | Server-only key. Never expose it to browser code. |
| `CLOUDFLARE_API_TOKEN` | Yes | Yes | Worker deployment token scoped to the target environment. |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Yes | Cloudflare account identifier. |
| `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Yes | Yes | Environment-specific Turnstile keys. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Yes | Yes | Environment-specific Redis credentials. |
| `RESEND_API_KEY` and reseller email settings | Yes | Yes | Use a staging-safe sender and recipient policy. |
| `STAGING_SESSION_KV_ID` | Yes | No | Cloudflare KV namespace id for the staging Worker `SESSION` binding. |
| `STAGING_BASE_URL` | Yes (after first deploy) | No | Public staging origin, e.g. `https://jehmarp-staging.<account>.workers.dev`. |
| `PRODUCTION_BASE_URL` | No | Yes | Public production origin used by smoke and canary guard probes. |
| `SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD` | Yes | Yes | Dedicated admin dashboard user for authenticated smoke tests. |
| `SMOKE_AGENT_EMAIL` / `SMOKE_AGENT_PASSWORD` | Yes | Yes | Dedicated agent dashboard user for authenticated smoke tests. |
| `SMOKE_TURNSTILE_RESPONSE` | Optional | Optional | Turnstile response token for `/api/login` when Turnstile is enabled. Use Cloudflare test keys or a solved token. |

Staging deploy sets `AUTH_SMOKE_OPTIONAL=true` until smoke users exist. Production
deploy and `production-smoke-tests.yml` fail closed when smoke credentials are missing.

### Canary guard variables (production environment)

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `CANARY_OBSERVE_SECONDS` | `90` | Observation window between promotion steps (raise in production if needed; keep CI-friendly). |
| `CANARY_MAX_ERROR_RATE` | `0.05` | Maximum allowed HTTP probe failure rate per observation batch. |
| `CANARY_PROBE_FAILURES_MAX` | _(derived)_ | Optional absolute failure cap overriding the rate calculation. |
| `VERSION_AFFINITY_REQUIRED` | `false` | When `true`, fail deploy if version affinity cannot be verified automatically. |

Staging deploys to a separate Cloudflare Worker (`jehmarp-staging`) with its own
`SESSION` KV namespace. Before the first staging deploy, create the KV namespace
in Cloudflare, add `STAGING_SESSION_KV_ID` to the GitHub `staging` Environment,
and set `STAGING_BASE_URL` after the first successful deploy. Do not attach
production custom domains to staging.

Use the same secret names in each GitHub Environment so workflow YAML can stay
environment-agnostic. Never reuse production Auth redirects, Storage buckets,
SMTP recipients, OAuth clients, or third-party webhook endpoints in staging.

## Workflow Architecture

The implementation is split into these focused workflows:

1. Feature Branch CI
2. Deploy Staging
3. Validate Production PR
4. Deploy Production
5. Deploy Contract Release
6. Supabase Migration Safety
7. Production Smoke Tests
8. Scheduled DB Health
9. Dependency/Security
10. Backup and Recovery

### 1. Feature Branch CI

**Trigger:** pushes to branches other than `dev` and `main`.

**Purpose:** fast feedback without production or staging credentials.

**Required checks:**

1. `npm ci` in `web/`.
2. `npm run check`.
3. `npm run lint`.
4. `npm run test`.
5. `npm run build` for `web/**` changes.
6. For `supabase/**` changes: start local Supabase, run
   `supabase db reset --local --no-seed`, `supabase db lint --local --fail-on error`,
   and `bash supabase/tests/run.sh`.

This workflow never links a remote Supabase project.

### 2. Deploy Staging

**Trigger:** push to `dev`; use the protected `staging` environment.

**Purpose:** make the current integration branch testable against the managed
staging Supabase project and a staging Cloudflare Worker.

**Required order:**

1. Run the same application and local database checks as Feature Branch CI.
2. Link the managed staging project and run `supabase migration list --linked`.
3. Apply pending **Expand** migrations with `supabase db push`.
4. Verify migration status, database lint/advisors where supported, and the
   staging API/RPC contract tests.
5. Render the staging Worker environment file from staging secrets.
6. Build and deploy the staging Worker.
7. Run authenticated and unauthenticated staging smoke tests, including the
   critical order, payment, admin, agent, Auth, and RLS-dependent flows.

The staging project is the rehearsal environment for locks, migrations,
backfills, RLS policy changes, API/RPC compatibility, and app configuration.
Do not apply Contract migrations automatically merely because `dev` changed.

### 3. Validate Production PR

**Trigger:** `dev → main` pull request only.

**Purpose:** prove that the exact promotion candidate has passed local and
staging validation, and can safely be considered for production.

**Required checks:**

1. Run Astro checks, lint, tests, and a production-mode build.
2. Start local Supabase; replay migrations, lint the schema, and run SQL tests.
3. Verify that staging migration history matches the candidate and that staging
   smoke tests passed for the same commit.
4. Link production read-only for audit and run a dry-run migration check; never
   apply production migrations in this workflow.
5. Validate migration metadata and reject unsafe phase combinations.
6. Generate/verify Supabase TypeScript types and API/RPC contract tests when
   schema-facing code changes.
7. Require the `migration-reviewed` label and production-environment approval
   for Contract or high-risk migrations.

The production dry-run catches migration-history divergence. It is not a
replacement for staging validation and must not mutate production.

### 4. Deploy Production

**Trigger:** approved push to `main`; use the protected `production` environment.

**Purpose:** promote an already-compatible schema and Worker version with an
observable, reversible application rollout.

**Required order:**

1. Confirm the production migration list is clean and backup/recovery evidence
   is available for high-risk releases.
2. Check database locks/blockers and run the production advisor/health preflight.
3. Apply pending eligible migrations using the guarded remote push helper.
4. Recheck migration status and run post-migration database assertions.
5. Build the Worker with production environment values.
6. Upload a new Worker version with `wrangler versions upload`.
7. Deploy it initially at 0% traffic and run version-targeted public **and**
   authenticated smoke tests (`.github/scripts/run-canary-smoke.sh --auth
   --version-targeted`).
8. Promote gradually: 5% → 25% → 50% → 100%. After each promotion run public
   smoke tests, then `canary-observe-and-guard.sh` (HTTP probe failure-rate
   guard with automatic `stable@100%` rollback). Authenticated smoke runs again
   at 100%. Smoke failures also trigger automatic rollback via
   `run-canary-smoke.sh`.
9. Use Cloudflare version affinity during the gradual rollout so a user is not
   served HTML/assets or requests from inconsistent Worker versions.
10. Retain the prior stable Worker version and record its version ID in the
    release summary.

The implementation uses `wrangler versions upload` instead of direct
`wrangler deploy`. Create an inactive version, deploy it at 0% beside the prior
stable version, and smoke-test it with a
`Cloudflare-Workers-Version-Overrides` request header. Promote with explicit
split specifications, for example `new@5% stable@95%`, then `new@25%
stable@75%`, `new@50% stable@50%`, and finally `new@100% stable@0%`. Configure
the `Cloudflare-Workers-Version-Key` through a Cloudflare Transform Rule or
cookie-based affinity key for user-consistent requests during the rollout.

The immediate rollback path is Worker traffic reversal plus feature-flag
reversal. Do not automatically run database down migrations or restore a
database backup to roll back an application deployment.

### 5. Deploy Contract Release

**Trigger:** manual `workflow_dispatch` on `main` only; use the protected
`production` environment (required reviewers).

**Purpose:** apply pending **Contract-phase** database migrations after
non-bypassable evidence gates. This workflow does **not** deploy a Worker.

**Required inputs:**

- `confirm_contract_release=APPLY-CONTRACT` (hard confirmation gate)
- `backup_run_id` from a successful **Backup and Rollback**
  (`backup-production-db`) run whose artifact is downloaded and verified
- `restore_rehearsal_verified=true` (boolean, default `false` — must be explicitly
  set to `true`; non-bypassable)

**Required order:**

1. Require confirmation string `APPLY-CONTRACT`.
2. Require `restore_rehearsal_verified=true` workflow input.
3. Download and verify the backup workflow artifact for `backup_run_id`.
4. Validate backup/restore evidence via `verify-backup-restore-evidence.sh`
   (artifact + restore-rehearsal marker or notes).
5. Validate Contract evidence via `verify-contract-release-evidence.sh`
   (compatibility window complete, legacy usage zero, backup verified).
6. Run lock/advisor preflight via `verify-contract-lock-preflight.sh` when
   `CONTRACT_LOCK_PREFLIGHT=true` (default).
7. Validate pending migrations with `--strict` (no `migration-reviewed` bypass).
8. Refuse if any pending migration is Expand-phase or lacks Contract metadata.
9. Apply migrations with `supabase-db-push-remote.sh`.
10. Recheck migration status and write a Contract release summary with
   forward-repair references and prior Worker version notes.

`deploy-staging.yml` and `deploy-production.yml` continue to block Contract
migrations via `--expand-only`.

### 6. Supabase Migration Safety

**Trigger:** pull requests that modify `supabase/**`.

**Purpose:** make schema-risk classification explicit before a migration reaches
staging or production.

Every production-bound migration starts with metadata such as:

```sql
-- migration-phase: expand
-- owner: platform
-- lock-impact: low
-- backfill: none
-- compatible-with: worker >= 2026.08.0
-- forward-repair: <migration or runbook reference>
```

**New migrations are required** to include complete Expand or Contract metadata.
Copy a template from `supabase/migration-templates/`. CI fails on newly added migration
files without headers; modified legacy migrations are warned instead of failing.

Contract migrations additionally require:

```sql
-- migration-phase: contract
-- compatibility-window-complete: YYYY-MM-DD
-- legacy-usage-confirmed-zero: <dashboard/query/runbook reference>
-- backup-verified: <run or artifact reference>
```

The safety workflow must fail unless a reviewed Contract migration provides the
metadata and an approved `migration-reviewed` label. It should block or require
explicit review for:

- `drop table`, `drop column`, `drop view`, `drop function`, and `cascade`;
- `rename table` or `rename column`;
- `truncate` and broad `delete from`;
- `alter column ... set not null`;
- type changes or rewrite-heavy DDL;
- RLS policy replacement, exposed grants, and `security definer` functions;
- unbounded backfills in a migration file.

It also replays the local database, runs SQL tests, validates the staging
project for `dev`, and runs the production dry-run only for `dev → main`.

### 7. Production Smoke Tests

**Trigger:** successful production deployment and after each canary promotion.

**Required checks:**

1. Public home, shop, contact, and login routes return expected responses
   (`.github/scripts/production-smoke.sh`).
2. Unauthenticated dashboard routes redirect correctly.
3. Critical API endpoints reject invalid unauthenticated input.
4. Authenticated admin and agent smoke users sign in through `/api/login`,
   reach `/admin` and `/agent`, are denied cross-role pages, and admin can read
   `/admin/dashboard-summary.json` while agent receives `403`
   (`.github/scripts/authenticated-smoke.sh`).
5. Critical RPCs and RLS policies work through the deployed Worker and Supabase
   API—not only through direct database SQL (dashboard summary JSON is the
   primary read-only admin RLS probe; agent page load exercises agent-scoped
   data reads).

### 7. Scheduled DB Health

**Trigger:** daily schedule and manual dispatch.

**Required checks:**

1. Link production with bounded retry behavior for transient API failures.
2. Run security and performance advisors.
3. Print migration status and flag divergence.
4. Check exposed-schema RLS expectations.
5. Alert on new error-level findings; track warnings for remediation.

### 8. Dependency/Security

Run on dependency, workflow, or secret-handling changes and on a schedule.
Audit dependencies, scan for secrets, review workflow permissions, and confirm
that server-only values are not exposed through browser-prefixed variables.

### 10. Backup and Recovery

Keep backup and recovery workflows manual and protected. Before a high-risk
Contract release, capture and verify:

- database role, schema, and data backups;
- required Storage objects;
- a restore rehearsal or documented current restore evidence;
- a forward-repair migration and the prior Worker version ID.

Backup artifacts contain PII, payments, Auth data, and application secrets;
store them securely, restrict access, and delete local copies when no longer
needed. Update exports and recovery scripts before Contract migrations remove
legacy views, tables, columns, or RPCs.

## Expand/Contract Release Standard

### Release A — Expand

Apply only additive changes: nullable columns, new tables, indexes, v2 RPCs,
compatibility views/functions, and the minimum triggers needed to keep old and
new writers correct. Existing Worker versions must continue to read and write
successfully.

Avoid table/column renames, drops, `CASCADE`, immediate non-null constraints,
and large data rewrites. CI enforces additive-only SQL for `migration-phase: expand`
files via `.github/scripts/validate-expand-migration-sql.sh`. Add constraints as
deferred/validated-later where appropriate and use a bounded `lock_timeout` for risky DDL.

### Release B — Compatible application

Deploy code that reads the new representation with an old-path fallback, and
uses an idempotent compatibility trigger or dual-write path where needed. Put
the new behavior behind a runtime feature flag; deploy it through the Cloudflare
canary process.

### Release C — Backfill and observe

Backfill outside the deployment migration in resumable, idempotent batches with
checkpoints. Observe row counts, checksums, null/duplicate/FK violations,
dual-write failures, legacy-read counts, and API/Worker errors. Keep the
compatibility layer through the agreed client/session/queue/rollback retention
window, normally at least 7–14 days unless a shorter bound is proven.

### Release D — Contract

Only after legacy reads/writes are observed at zero and the compatibility window
has completed, merge the dedicated Contract pull request. Remove compatibility
objects and legacy data in dependency order. This is a forward-only operation:
if it fails, repair with a new migration or return Worker traffic to a compatible
version; do not assume a destructive database change is safely reversible.

**Apply Contract migrations only via `deploy-contract-release.yml`** (manual
`workflow_dispatch` on `main` with `environment: production` approval). This
workflow does not deploy a Worker; a compatible application must already be at
100% production traffic. Normal `deploy-staging.yml` and `deploy-production.yml`
runs block Contract migrations with `--expand-only`.

#### Contract release sequence

1. Merge Expand and compatible-application changes through `dev` → `main` and
   complete the Worker canary rollout (`deploy-production.yml`).
2. Observe zero legacy usage through the compatibility window recorded in
   migration headers.
3. Run **Backup and Rollback** (`backup-production-db`) and record the workflow
   run id.
4. Add `contract-release` (or `migration-reviewed`) on the `dev → main` PR;
   Validate Production PR must pass.
5. Dispatch **Deploy Contract Release** on `main` with:
   - `confirm_contract_release=APPLY-CONTRACT`
   - `backup_run_id` from step 3
   - `restore_rehearsal_verified=true`
   - optional `prior_worker_version_id` from the latest production release summary
6. On failure, reverse Worker traffic first; repair the database with a forward
   migration — do not auto-restore backups.

## Cloudflare version affinity (operator runbook)

During percentage-based Worker rollouts (`deploy-production.yml`), configure version
affinity so HTML, static assets, and API subrequests stay on one Worker version per user.

### Transform Rule (custom zone route required)

Transform Rules are **not** available on `*.workers.dev`. Production must use a zone
route on a domain you control.

1. Cloudflare dashboard → your zone → **Rules** → **Transform Rules** → **Modify request header**.
2. Create a rule matching production traffic to the Worker route.
3. **Expression** (cookie `cf_worker_version_key` set by the app or session layer):

   ```txt
   http.cookie contains "cf_worker_version_key"
   ```

4. **Operation**: Set dynamic header
   - Header name: `Cloudflare-Workers-Version-Key`
   - Value: `http.request.cookies["cf_worker_version_key"][0]`

5. Alternative for anonymous traffic: use `ip.src` as the key (see Cloudflare docs).
6. Optional: add the [version metadata binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
   and expose `x-worker-version-id` in responses for automated CI verification.

### CI verification

After the 50% canary step, `deploy-production.yml` runs
`.github/scripts/verify-version-affinity.sh` (best-effort). Set repository variable
`VERSION_AFFINITY_REQUIRED=true` to fail the deploy when automatic proof is inconclusive.

Local / operator probe:

```bash
export PRODUCTION_BASE_URL="https://your-production-origin"
bash .github/scripts/verify-version-affinity.sh \
  --base-url "$PRODUCTION_BASE_URL" \
  --worker-name "$(bash .github/scripts/resolve-worker-name.sh)" \
  --version-a "<new-version-id>" \
  --version-b "<stable-version-id>"
```

**Limitation:** Cloudflare does not expose the routed Worker version id in response
headers unless the application uses the version metadata binding. The script compares
response fingerprints (body hash + selected headers) across repeated probes with the
same `Cloudflare-Workers-Version-Key`. When proof is inconclusive it prints the
Transform Rule checklist instead of failing (unless `VERSION_AFFINITY_REQUIRED=true`).

Docs: [Version affinity](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/version-affinity/)

## Contract backup, restore rehearsal, and lock preflight

### Backup artifact

Run **Backup and Rollback** → `backup-production-db` before Contract apply. Record the
workflow run id. After performing a restore rehearsal, re-run backup with:

- `restore_rehearsal_verified=true`
- optional `restore_rehearsal_note` describing validation performed

The artifact must include `restore-rehearsal-notes.md` or `restore-rehearsal-verified.marker`.

### Contract workflow gates

`deploy-contract-release.yml` requires:

| Gate | Enforcement |
| :-- | :-- |
| `restore_rehearsal_verified=true` | Workflow input (default `false`) |
| Backup artifact | `verify-backup-restore-evidence.sh` |
| Contract metadata | `verify-contract-release-evidence.sh` |
| Advisors + locks | `verify-contract-lock-preflight.sh` when `CONTRACT_LOCK_PREFLIGHT=true` |

Set repository variable `CONTRACT_LOCK_PREFLIGHT=false` only for documented exceptions.

### High-risk Expand on `main` push

`deploy-production.yml` detects pending high-risk migrations via
`detect-pending-high-risk-migrations.sh` and writes a summary note. Set repository variable
`REQUIRE_BACKUP_EVIDENCE_FOR_HIGHRISK=true` to fail production deploy when high-risk Expand
migrations are still pending (Contract apply remains the primary path via
`deploy-contract-release.yml`).

## GitHub protections setup

Use `.github/scripts/configure-github-protections.sh` to document and apply environment
policies and repository rulesets. **Default is dry-run** (`DRY_RUN=true`); pass `--apply`
only when intentionally mutating GitHub settings (requires admin rights).

### Required status check names (from workflow job `name:` fields)

| Branch / workflow | Check context |
| :-- | :-- |
| `main` ← `dev` PR | `Validate dev to main` (workflow: Validate Production PR) |
| Feature → `dev` PR | `Web checks`, `Local Supabase checks` (workflow: Feature Branch CI) |

`Feature Branch CI` does not run on `main`; do not require it on `main` protection.

### Operator commands

Dry-run (safe, no mutations):

```bash
cd /path/to/JEHMARP
DRY_RUN=true \
  GITHUB_REPOSITORY="<org>/JEHMARP" \
  GITHUB_PRODUCTION_REVIEWER="<github-user-or-org/team-slug>" \
  bash .github/scripts/configure-github-protections.sh --repo "<org>/JEHMARP"
```

Apply (requires `gh auth login` and repository admin):

```bash
DRY_RUN=false \
  GITHUB_PRODUCTION_REVIEWER="<github-user-or-org/team-slug>" \
  bash .github/scripts/configure-github-protections.sh --apply --repo "<org>/JEHMARP"
```

The script configures:

- **staging** environment: deployment branch policy allowing `dev` only
- **production** environment: required reviewers + deployment branch policy allowing `main` only
- **JEHMARP main protection** ruleset: PR required + `Validate dev to main` status check
- **JEHMARP dev protection** ruleset: PR required + Feature Branch CI job checks

**Tradeoff (`dev`):** requiring PRs from feature branches enforces CI before integration;
maintainers may bypass via org-admin ruleset bypass on `dev` (configured in the script).
Direct push to `dev` is faster for hotfixes but skips Feature Branch CI unless Deploy
Staging is the integration gate.

If `gh api` fails (missing admin rights), the script prints the error; configure environments
and rulesets manually in GitHub Settings → Environments / Rules.

## Operational Guardrails

- Keep `supabase/setup-cli@v3` pinned to `2.109.1` until the repository and
  local development workflow are upgraded together.
- Use the repository retry helpers for remote Supabase link and migration
  commands; retry only known transient failures.
- Never edit already-applied migration files. Create a new migration with
  `supabase migration new <description>`.
- Do not run production seed scripts, local reset scripts, or local test users
  in a remote environment.
- Keep staging and production OAuth redirect URLs, email recipients, webhook
  endpoints, Storage buckets, and third-party credentials separate.
- Record the staging and production migration status, Worker version ID, canary
  metrics, approvals, and rollback decision in every release summary.

## Required Workflow Files

```text
.github/
  workflows/
    feature-branch-ci.yml
    deploy-staging.yml
    validate-production-pr.yml
    deploy-production.yml
    deploy-contract-release.yml
    supabase-migration-safety.yml
    production-smoke-tests.yml
    scheduled-db-health.yml
    dependency-security.yml
    backup-and-rollback.yml
  scripts/
    verify-contract-release-evidence.sh
    production-smoke.sh
    authenticated-smoke.sh
    run-canary-smoke.sh
    canary-observe-and-guard.sh
    canary-rollback.sh
    verify-backup-restore-evidence.sh
    verify-contract-lock-preflight.sh
    verify-version-affinity.sh
    detect-pending-high-risk-migrations.sh
    configure-github-protections.sh
```

## Implementation Sequence

1. Create and secure the managed staging Supabase project; add staging secrets
   to the GitHub `staging` environment.
2. Create `deploy-staging.yml` for `dev`, including staging migrations, Worker
   deployment, and staging smoke tests.
3. Update production validation to consume staging evidence and enforce
   migration-phase metadata.
4. Extend migration safety rules for Expand/Contract requirements.
5. Replace direct all-at-once Worker deployment with version upload, targeted
   smoke tests, gradual promotion, version affinity, and traffic rollback.
6. Add release telemetry, reconciliation checks, and Contract approval evidence.
   (`deploy-contract-release.yml` + `verify-contract-release-evidence.sh`)
7. Rehearse a compatible Worker rollback and a forward database repair before
   the first high-risk Contract release.
