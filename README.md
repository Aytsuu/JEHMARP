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
