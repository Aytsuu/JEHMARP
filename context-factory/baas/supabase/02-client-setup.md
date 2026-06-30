# Supabase — Client Setup
<!-- agent-doc: v0.1.2 | last-updated: 2026-06 | audience: LLM agents, senior engineers -->

## This Project's Client Usage

This project uses **two separate Supabase clients**:

| Client | Used by | Key | Scope |
|---|---|---|---|
| Browser client (anon key) | Frontend (Astro/React islands) | `SUPABASE_URL` + `SUPABASE_ANON_KEY` | Public access, constrained by RLS |
| Service client (service key) | `ai_engine` worker only | `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Bypasses RLS — never in frontend |

**Rule:** `ai_engine` gets its own Supabase client using the service key. No import dependencies between `api` and `ai_engine`.

---

## JavaScript / TypeScript (Frontend)

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Session Identity (hackathon mode — no auth):**
```typescript
// Read session_id from localStorage; pass as X-Session-Id header on all API requests
const sessionId = localStorage.getItem('session_id') ?? crypto.randomUUID()
localStorage.setItem('session_id', sessionId)
```

---

## Python (Backend / ai_engine)

```python
# ai_engine/src/supabase_client.py
from supabase import create_client, Client
from src.config import settings

def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_key)
```

```python
# ai_engine/src/config.py (relevant fields)
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_service_key: str = Field(alias="SUPABASE_SERVICE_KEY")
```

---

## Environment Variables

```env
# .env (never commit)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...          # safe for frontend (PUBLIC_ prefix in Astro)
SUPABASE_SERVICE_KEY=eyJ...       # NEVER in frontend or PUBLIC_ vars
```
