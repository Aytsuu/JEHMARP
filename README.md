# JEHMARP

## Local Supabase Auth

Auth users are **not** seeded automatically. After `supabase start` / `supabase db reset`, create accounts in local Studio:

1. Open http://127.0.0.1:55423
2. Go to **Authentication → Users → Add user**
3. Map roles in the database as needed:
   - Admin access: row in `public.admin_role` for the user's auth id
   - Agent access: row in `public.agent` for the user's auth id

## Required Environment Variables

For the Astro application in `web/`, configure these values in local `.env` files
and in the deployment platform:

```text
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RESEND_API_KEY=
RESELLER_PRICE_LIST_FROM=
RESELLER_ADMIN_EMAIL=
```

`RESEND_API_KEY`, `RESELLER_PRICE_LIST_FROM`, and `RESELLER_ADMIN_EMAIL` are required
for the reseller application email workflow. The remaining variables are required
for the current public form and dashboard protections.

## Cloudflare Deployment

Deploy the Astro app from the `web/` directory, not the repository root. This
project uses server-rendered Astro routes, so the supported Cloudflare target is
Cloudflare Workers with static assets, not a static Cloudflare Pages deployment.

Recommended Cloudflare settings:

| Setting | Value |
| :-- | :-- |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Deploy Command | `npx wrangler deploy` |

Recommended deployment checklist:

1. Run all commands from `web/`.
2. Configure all required environment variables before the first production deploy.
3. Apply Supabase migrations to the linked project before deploying the app.
4. Verify that Turnstile, Upstash Redis, and Resend credentials are production values.
5. Run `npm run test`, `npm run check`, `npm run lint`, and `npm run build` from `web/`.
6. Run `npx wrangler deploy` to publish the Cloudflare Worker.

The project uses `@astrojs/cloudflare` for server-rendered Astro routes on
Cloudflare Workers. Cloudflare Pages static output will not serve this app
correctly because the root page and API routes are rendered by the server
adapter.
