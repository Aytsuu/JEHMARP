# Supabase — Core Principles & Security
<!-- agent-doc: v0.1.2 | last-updated: 2026-06 | audience: LLM agents, senior engineers -->

## Core Principles

**1. Supabase changes frequently — verify before implementing.**
Do not rely on training data. Function signatures, config.toml settings, and API conventions change between versions. Fetch `https://supabase.com/changelog.md`, scan for `breaking-change` tags relevant to your task, and follow the linked page for any that apply.

**2. Verify your work.**
After any fix or migration, run a test query to confirm the change works. A fix without verification is incomplete.

**3. Recover from errors, don't loop.**
If an approach fails after 2–3 attempts, stop, try a different method, and check documentation. The answer is not always in the logs, but logs are worth checking before proceeding.

**4. Exposing tables to the Data API.**
Depending on [Data API settings](https://supabase.com/dashboard/project/_/integrations/data_api/settings), newly created tables may not be automatically exposed via the REST API. `anon` and `authenticated` roles need explicit `GRANT`. This is separate from RLS — RLS controls which *rows* are visible once a table is accessible.

When a SQL-created table is unexpectedly inaccessible, check Data API settings and whether roles have been granted access. When granting public access, always enable RLS too.

---

## Security Checklist

Run through this whenever a task touches auth, RLS, views, storage, or user data.

### Auth & Session Security

- **Never use `user_metadata` claims for authorization.** `raw_user_meta_data` is user-editable and may appear in `auth.jwt()` — unsafe for RLS policies. Use `raw_app_meta_data` / `app_metadata` instead.
- **Deleting a user does not invalidate existing access tokens.** Sign out or revoke sessions first. Keep JWT expiry short for sensitive apps.
- **`app_metadata` and `auth.jwt()` claims may be stale** until the user's token is refreshed.

### API Key & Client Exposure

- **Never expose the `service_role` key in public clients.** Use `anon` keys for frontend code. In Astro/Next.js, any `PUBLIC_` or `NEXT_PUBLIC_` env var is sent to the browser.

### RLS, Views & Privileged Code

- **Enable RLS on every table in any exposed schema** (including `public` by default).
- **Views bypass RLS by default.** In Postgres 15+, use `CREATE VIEW ... WITH (security_invoker = true)`. Otherwise, revoke access from `anon`/`authenticated` or put views in an unexposed schema.
- **UPDATE requires a SELECT policy.** Without a SELECT policy, updates silently return 0 rows — no error, just no change.
- **Do not put `security definer` functions in an exposed schema.** Use a private/unexposed schema.

### Storage Access Control

- **Storage upsert requires INSERT + SELECT + UPDATE.** Granting only INSERT allows new uploads but silently fails on file replacement.

For anything not covered above, fetch: `https://supabase.com/docs/guides/security/product-security.md`
