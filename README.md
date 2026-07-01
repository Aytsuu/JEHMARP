# NMC

## Remote Supabase Test Accounts

Temporary mock accounts for the hosted Supabase Auth project. Replace these
credentials before production use and do not reuse them outside test data.

| Purpose | Email | Temporary password | App role |
| :-- | :-- | :-- | :-- |
| Test admin | `admin@nmc.test` | `NmcTestAdmin!2026` | `admin` |
| Test agent user | `agent@nmc.test` | `NmcTestAgent!2026` | `agent` |

The admin account is mapped through `public.admin_role`. The agent account is
mapped through `public.agent_profile`.

## Vercel Deployment

Deploy the Astro app from the `web/` directory, not the repository root.

Recommended Vercel project settings:

| Setting | Value |
| :-- | :-- |
| Framework Preset | `Astro` |
| Root Directory | `web` |
| Install Command | `npm install` |
| Build Command | `npm run build` |

Required environment variables:

```text
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

The project uses `@astrojs/vercel` for server-rendered Astro routes on Vercel.
