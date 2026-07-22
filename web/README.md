# JEHMARP Web

Astro + React application for the JEHMARP public website plus the admin and agent dashboards.

## Project Structure

Key foundation folders:

```text
/
|-- src/
|   |-- components/
|   |-- config/
|   |-- layouts/
|   |-- lib/
|   |-- pages/
|   |-- styles/
|   `-- test/
|-- astro.config.mjs
`-- package.json
```

## Environment

Copy `.env.example` to `.env`.

Required variables:

```text
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
LOCAL_SUPABASE_URL=
LOCAL_SUPABASE_PUBLISHABLE_KEY=
LOCAL_SUPABASE_SECRET_KEY=
PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Conditionally required variables:

```text
RESEND_API_KEY=
RESELLER_PRICE_LIST_FROM=
RESELLER_ADMIN_EMAIL=
```

Use the conditional variables when the reseller application email workflow is enabled.

Keep all server-only values in non-public variables. Only `PUBLIC_*` values belong in browser-exposed configuration.

In development, the app prefers the local Supabase stack automatically and will use the local CLI defaults at `http://127.0.0.1:55421` unless you override them with `LOCAL_SUPABASE_*`. That prevents `npm run dev` from pointing at production even when `.env` still contains hosted project credentials.

## Local Supabase Data

Schema history lives in `supabase/migrations/` for local and remote environments.

Auth users are not seeded on `supabase db reset`. Create local login accounts in Studio under **Authentication → Users**, then map `public.admin_role` / `public.agent` as needed.

Do not edit already-applied migration files to change local credentials or dashboard fixtures. Use a new migration for production-bound database changes.

## Commands

All commands are run from the root of the web project:

| Command | Action |
| :-- | :-- |
| `npm install` | Installs dependencies |
| `npm run dev` | Starts Astro dev server in background mode |
| `npm run dev:foreground` | Starts Astro dev server in foreground mode |
| `npm run dev:status` | Shows background dev server status |
| `npm run dev:stop` | Stops background dev server |
| `npm run build` | Builds production output to `./dist/` |
| `npm run check` | Runs Astro type checks |
| `npm run lint` | Runs ESLint |
| `npm run test` | Runs Vitest |
| `npm run test:coverage` | Runs Vitest with coverage |
| `npm run preview` | Previews the built site locally |
| `npm run astro -- --help` | Shows Astro CLI help |
| `npx wrangler deploy --dry-run` | Validates the Cloudflare Worker deployment without publishing |
| `npx wrangler deploy` | Deploys the server-rendered app to Cloudflare Workers |

## Deployment

The project is configured for server-rendered Astro output on Cloudflare Workers
through `@astrojs/cloudflare`. It is not a static Cloudflare Pages app; deploying
only a Pages output directory will not serve `/` correctly.

Recommended deployment settings:

| Setting | Value |
| :-- | :-- |
| Root Directory | `web` |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Deploy Command | `npx wrangler deploy` |

Deployment steps:

1. Run all deployment commands from `web/`.
2. Add every required environment variable from `.env.example` to the Cloudflare Worker.
3. Keep `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, and `UPSTASH_REDIS_REST_TOKEN` server-only.
4. Deploy after `npm run test`, `npm run check`, `npm run lint`, and `npm run build` pass locally.
5. Verify the public forms, admin login, agent login, and dashboard routes on the deployed site.
