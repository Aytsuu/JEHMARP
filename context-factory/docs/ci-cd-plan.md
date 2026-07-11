# CI/CD Plan

This document defines the GitHub Actions CI/CD setup for JEHMARP.

The target branch policy is:

- `dev` is the integration branch.
- `main` is production.
- Pull requests from `dev` to `main` must pass validation before merge.
- Pushes to `main` happen only after the PR is accepted and should apply pending Supabase migrations before Vercel's commit-tracked production deploy uses the new code.

## Goals

- Validate Astro application quality before production merge.
- Validate that Supabase migrations are replayable from a clean database.
- Validate that production migration history is not behind or divergent before merge.
- Avoid mutating production during pull request checks.
- Apply pending Supabase migrations automatically after a PR is merged into `main`.
- Keep production secrets inside GitHub Actions secrets and never commit them.

## Workflow Architecture

The CI/CD implementation should be split into these workflows:

1. Feature Branch CI
2. PR Production Validation
3. Push-to-Main Production Migration and Build Pipeline
4. Supabase Migration Safety Pipeline
5. Production Smoke Tests
6. Scheduled DB Health
7. Dependency/Security
8. Backup and rollback workflows

Each workflow has a focused responsibility. Keep database mutation out of general validation workflows, and keep production mutation limited to protected `main` or manual workflows.

### 1. Feature Branch CI

Trigger:

```yaml
on:
  push:
    branches-ignore:
      - main
      - dev
```

Purpose:

- Catch normal coding issues before a pull request is opened.
- Keep feedback fast and independent from production credentials.

Required checks:

1. Install `web/` dependencies with `npm ci`.
2. Run `npm run check`.
3. Run `npm run lint`.
4. Run `npm run test`.
5. Run `npm run build` when `web/**` changes.
6. Run migration replay only when `supabase/migrations/**` changes.

This workflow should not link to production Supabase and should not require production secrets.

### 2. PR Production Validation

Trigger:

```yaml
on:
  pull_request:
    branches:
      - main
```

Purpose:

- Validate `dev -> main` before production merge.
- Prove the application builds against production-like environment variables.
- Prove migrations can be replayed locally and dry-run against production.

Required checks:

1. Run Astro checks, lint, tests, and build.
2. Start local Supabase.
3. Reset local Supabase with local migrations and no production seed.
4. Run Supabase DB lint.
5. Link production Supabase.
6. Run `supabase db push --linked --dry-run`.
7. Print `supabase migration list --linked` for audit output.

This workflow must never apply production migrations.

### 3. Push-to-Main Production Migration and Build Pipeline

Trigger:

```yaml
on:
  push:
    branches:
      - main
```

Purpose:

- Apply pending Supabase migrations after an approved PR is merged.
- Build the production Astro app after the database is ready.
- Let Vercel handle production deployment from its existing commit tracking.

Required steps:

1. Use the protected `production` GitHub environment.
2. Install Supabase CLI.
3. Link the production Supabase project.
4. Apply migrations with `supabase db push --linked`.
5. Print migration status.
6. Install `web/` dependencies.
7. Build Astro.
8. Do not call the Vercel CLI from this workflow unless automated Vercel commit deployments are disabled later.

Database migrations should run before app deployment so new code does not reach production before required columns, functions, or policies exist.

### 4. Supabase Migration Safety Pipeline

Trigger:

```yaml
on:
  pull_request:
    paths:
      - "supabase/**"
  push:
    paths:
      - "supabase/**"
```

Purpose:

- Isolate database validation from normal frontend checks.
- Make risky schema changes visible before merge.

Required checks:

1. Start local Supabase.
2. Run `supabase db reset --local --no-seed`.
3. Run `supabase db lint --local`.
4. Run SQL tests under `supabase/tests/`.
5. Run migration replay against local Supabase for `dev` and feature branches.
6. Run production dry-run only for `dev -> main` promotion checks.
7. Detect risky migration patterns and require manual review.

Risky migration patterns:

- `drop table`
- `drop column`
- `truncate`
- unqualified `delete from`
- `alter column ... set not null`
- RLS policy removal
- grant changes on exposed schemas
- `security definer` functions in exposed schemas

### 5. Production Smoke Tests

Trigger:

```yaml
on:
  workflow_run:
    workflows:
      - Deploy Production
    types:
      - completed
```

Purpose:

- Verify deployed production behavior after build and migration.
- Catch environment variable, adapter, routing, and auth-redirect issues.

Required checks:

1. Public home page returns 200.
2. Shop page returns 200.
3. Contact page returns 200.
4. Login page returns 200.
5. Admin dashboard redirects unauthenticated users.
6. Agent dashboard redirects unauthenticated users.
7. Critical API endpoints reject invalid unauthenticated requests.

Do not use production write tests unless they are explicitly isolated and safe to clean up.

### 6. Scheduled DB Health

Trigger:

```yaml
on:
  schedule:
    - cron: "0 18 * * *"
```

Purpose:

- Detect production database drift or security warnings even when no deployment happens.

Required checks:

1. Link production Supabase.
2. Run Supabase advisors.
3. Print migration status.
4. Check that local migrations are not missing from production.
5. Check exposed-schema RLS expectations.
6. Alert on new critical or high findings.

Schedule time should be adjusted to the team's maintenance window.

### 7. Dependency/Security

Trigger:

```yaml
on:
  schedule:
    - cron: "0 19 * * 1"
  pull_request:
    paths:
      - "web/package.json"
      - "web/package-lock.json"
      - ".github/workflows/**"
```

Purpose:

- Detect vulnerable dependencies, leaked secrets, and risky workflow changes.

Required checks:

1. Run dependency audit.
2. Run GitHub secret scanning and CodeQL if enabled.
3. Verify server-only values are not referenced from browser-exposed variables.
4. Review workflow changes that add permissions, secrets, or deployment access.

Secrets to protect:

- Supabase service role or secret key.
- Supabase database password.
- Resend API key.
- Upstash token.
- Turnstile secret.
- Hosting provider deployment tokens.

### 8. Backup and Rollback Workflows

Trigger:

```yaml
on:
  workflow_dispatch:
```

Purpose:

- Provide manual operational controls for production backup and recovery.
- Avoid automatic destructive rollback.

Required manual workflows:

1. Production database backup before risky migrations.
2. Dashboard data export for admin and agent operational tables.
3. Public content export for `page` and `page_section`.
4. Roll back app deployment through Vercel's deployment history.
5. Run an approved SQL repair script only after manual approval.
6. Document restore-from-backup process for severe production incidents.

Database rollback should be manual. App rollback can usually be automated through the hosting provider, but database rollback needs explicit review because migrations can transform or delete data.

The production database backup operation should create separate artifacts for:

- roles: `supabase db dump --role-only`
- schema: `supabase db dump`
- data: `supabase db dump --data-only --use-copy`
- storage objects: `supabase storage cp --recursive` for project-managed buckets such as `product-images`

The data backup must include public tables used by the admin and agent dashboards. Where supported by the Supabase CLI, include `public`, `auth`, and `storage` schemas and exclude known internal vector tables such as `storage.buckets_vectors` and `storage.vector_indexes`.

The dashboard CSV export should include:

- `profile`
- `admin_role`
- `agent_profile`
- `customer`
- `product`
- `customer_order`
- `customer_order_item`
- `invoice`
- `payment`
- `customer_order_status_history`
- `contact_inquiry`
- `reseller_application`
- `page`
- `page_section`
- `media_asset`
- `analytics_daily`
- `analytics_product_daily`
- `analytics_agent_daily`

Backup artifacts can contain PII, customer records, auth records, payments, commissions, product image files, and internal dashboard data. Treat them as production secrets, download them only when needed, store them off-site securely, and delete local copies when no longer needed.

## Required GitHub Secrets

Add these repository or environment secrets in GitHub:

| Secret | Purpose |
| :-- | :-- |
| `SUPABASE_ACCESS_TOKEN` | Lets the Supabase CLI authenticate in CI. |
| `SUPABASE_PROJECT_REF` | Production Supabase project reference. |
| `SUPABASE_DB_PASSWORD` | Production database password used by `supabase db push`. |
| `PUBLIC_SUPABASE_URL` | Production Supabase URL for Astro build validation. |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production publishable key for Astro build validation. |
| `SUPABASE_SECRET_KEY` | Server-side Supabase key for Astro build validation. |
| `PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key for build-time env validation. |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key for build-time env validation. |
| `UPSTASH_REDIS_REST_URL` | Redis REST URL for build-time env validation. |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST token for build-time env validation. |
| `RESEND_API_KEY` | Required when reseller email workflow is enabled. |
| `RESELLER_PRICE_LIST_FROM` | Required when reseller email workflow is enabled. |
| `RESELLER_ADMIN_EMAIL` | Required when reseller email workflow is enabled. |

Vercel production deployment is already automated through commit tracking, so the CI workflows do not require `VERCEL_TOKEN`, `VERCEL_ORG_ID`, or `VERCEL_PROJECT_ID`.

Use a GitHub environment named `production` for the deployment job. Enable required reviewers for that environment if migrations should require manual approval before production changes.

## Supabase CLI Version

Use `supabase/setup-cli@v3` and pin the CLI version to the version used by local development:

```yaml
- uses: supabase/setup-cli@v3
  with:
    version: 2.101.0
```

This project uses newer `supabase/config.toml` keys such as `auth.oauth_server`, `auth.web3`, `storage.vector`, `storage.analytics`, `storage.s3_protocol`, `db.health_timeout`, `db.network_restrictions`, and `db.migrations.enabled`. Older Supabase CLI versions fail before `supabase link` with config parse errors. If the local CLI is upgraded and `config.toml` changes, update the workflow pin in the same PR.

## Pull Request Validation

Trigger:

```yaml
on:
  pull_request:
    branches:
      - main
```

The validation job should only run for `dev -> main` PRs:

```yaml
if: github.event.pull_request.head.ref == 'dev' && github.event.pull_request.base.ref == 'main'
```

Required validations:

1. Install Node dependencies in `web/`.
2. Run Astro and TypeScript checks.
3. Run ESLint.
4. Run Vitest.
5. Run production Astro build.
6. Install Supabase CLI.
7. Verify migrations replay cleanly with `supabase db reset --local --no-seed`.
8. Run Supabase database lint if available.
9. Link to the production Supabase project.
10. Run a production migration dry run with `supabase db push --linked --dry-run`.
11. Fail the PR if the dry run cannot determine pending migrations or detects migration-history conflicts.

The PR workflow must not run `supabase db push` without `--dry-run`.

### Production Safety Checks

The PR check cannot fully prove a migration is safe against all production data, but it should catch the common failure modes before merge:

- SQL syntax errors.
- Migrations that do not replay from a clean database.
- Missing or duplicated migration history.
- Migrations that the Supabase CLI cannot apply to the linked production project.
- Build failures caused by schema/API drift in application code.

For high-risk migrations, require manual review before merge. High-risk examples:

- Dropping columns or tables.
- Tightening `not null` constraints on populated tables.
- Adding restrictive check constraints to existing data.
- Rewriting RLS policies.
- Changing auth, storage, payment, invoice, or commission tables.
- Large data backfills.

## Push To Main Deployment

Trigger:

```yaml
on:
  push:
    branches:
      - main
```

Required deployment steps:

1. Install Supabase CLI.
2. Link the production Supabase project.
3. Run `supabase db push --linked --password "$SUPABASE_DB_PASSWORD"` to apply pending migrations.
4. Run `supabase migration list --linked` for audit output.
5. Install Node dependencies in `web/`.
6. Run `npm run build`.
7. Let Vercel deploy from `main` through its existing commit tracking.

`supabase db push` is idempotent for already-applied migrations. If there are no pending migrations, it should exit without changing the database.

## Recommended Workflow Files

Create these files when implementing CI/CD:

```text
.github/
  workflows/
    feature-branch-ci.yml
    validate-production-pr.yml
    deploy-production.yml
    supabase-migration-safety.yml
    production-smoke-tests.yml
    scheduled-db-health.yml
    dependency-security.yml
    backup-and-rollback.yml
```

## `validate-production-pr.yml`

```yaml
name: Validate Production PR

on:
  pull_request:
    branches:
      - main

permissions:
  contents: read
  pull-requests: read

jobs:
  validate:
    name: Validate dev to main
    if: github.event.pull_request.head.ref == 'dev' && github.event.pull_request.base.ref == 'main'
    runs-on: ubuntu-latest

    env:
      PUBLIC_SUPABASE_URL: ${{ secrets.PUBLIC_SUPABASE_URL }}
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
      SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
      PUBLIC_TURNSTILE_SITE_KEY: ${{ secrets.PUBLIC_TURNSTILE_SITE_KEY }}
      TURNSTILE_SECRET_KEY: ${{ secrets.TURNSTILE_SECRET_KEY }}
      UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
      UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
      RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
      RESELLER_PRICE_LIST_FROM: ${{ secrets.RESELLER_PRICE_LIST_FROM }}
      RESELLER_ADMIN_EMAIL: ${{ secrets.RESELLER_ADMIN_EMAIL }}
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: web/package-lock.json

      - name: Install web dependencies
        working-directory: web
        run: npm ci

      - name: Astro check
        working-directory: web
        run: npm run check

      - name: Lint
        working-directory: web
        run: npm run lint

      - name: Test
        working-directory: web
        run: npm run test

      - name: Build
        working-directory: web
        run: npm run build

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v3
        with:
          version: 2.101.0

      - name: Start local Supabase
        run: supabase start

      - name: Replay local migrations
        run: supabase db reset --local --no-seed

      - name: Lint local database
        run: supabase db lint --local

      - name: Link production Supabase project
        run: supabase link --project-ref "${{ secrets.SUPABASE_PROJECT_REF }}" --password "$SUPABASE_DB_PASSWORD"

      - name: Check pending production migrations
        run: supabase db push --linked --dry-run --password "$SUPABASE_DB_PASSWORD"

      - name: Show migration status
        run: supabase migration list --linked
```

## `deploy-production.yml`

```yaml
name: Deploy Production

on:
  push:
    branches:
      - main

permissions:
  contents: read

concurrency:
  group: production
  cancel-in-progress: false

jobs:
  migrate-and-build:
    name: Apply migrations and build
    runs-on: ubuntu-latest
    environment: production

    env:
      PUBLIC_SUPABASE_URL: ${{ secrets.PUBLIC_SUPABASE_URL }}
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
      SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
      PUBLIC_TURNSTILE_SITE_KEY: ${{ secrets.PUBLIC_TURNSTILE_SITE_KEY }}
      TURNSTILE_SECRET_KEY: ${{ secrets.TURNSTILE_SECRET_KEY }}
      UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
      UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
      RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
      RESELLER_PRICE_LIST_FROM: ${{ secrets.RESELLER_PRICE_LIST_FROM }}
      RESELLER_ADMIN_EMAIL: ${{ secrets.RESELLER_ADMIN_EMAIL }}
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v3
        with:
          version: 2.101.0

      - name: Link production Supabase project
        run: supabase link --project-ref "${{ secrets.SUPABASE_PROJECT_REF }}" --password "$SUPABASE_DB_PASSWORD"

      - name: Apply pending production migrations
        run: supabase db push --linked --password "$SUPABASE_DB_PASSWORD"

      - name: Show migration status
        run: supabase migration list --linked

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: web/package-lock.json

      - name: Install web dependencies
        working-directory: web
        run: npm ci

      - name: Build
        working-directory: web
        run: npm run build
```

## Notes

- Keep migration application before application deployment. Code that expects a new column or function should not reach production before the database has it.
- Vercel already deploys production from new commits, so the GitHub Actions production workflow should not run `vercel deploy`.
- Do not run seed scripts against production unless a specific seed is designed for production reference data.
- Do not use local-only seed files, local auth users, mock dashboard data, or reset scripts in production workflows.
- Prefer additive migrations when possible. For destructive migrations, split the change into phases: deploy compatible code, backfill or migrate data, then remove old schema only after production is confirmed stable.
- Supabase migration validation should be treated as a gate, not as a replacement for reviewing migration SQL.
