# Supabase — Quick Reference
<!-- agent-doc: v0.1.2 | last-updated: 2026-06 | audience: LLM agents, senior engineers -->

| Scenario | Solution |
|---|---|
| New table needs REST API access | `GRANT SELECT, INSERT, UPDATE ON table TO anon, authenticated;` + enable RLS |
| Table inaccessible after SQL creation | Check Data API settings + role grants |
| RLS UPDATE silently returns 0 rows | Add a SELECT policy alongside the UPDATE policy |
| View bypasses RLS | `CREATE VIEW ... WITH (security_invoker = true)` (Postgres 15+) |
| Service key in frontend | Stop — move to backend/worker only |
| New migration file | `supabase migration new <descriptive_name>` — never invent a filename |
| Iterate on schema changes | `execute_sql` (MCP) or `supabase db query` — not `apply_migration` |
| Commit schema changes | Run advisors → `supabase db pull <name> --local --yes` → verify list |
| Realtime not firing | Check table is in `supabase_realtime` publication + correct channel filter |
| Subscribe to live table changes | `supabase.channel(name).on('postgres_changes', {...}).subscribe()` |
| Unsubscribe on cleanup | `supabase.removeChannel(channel)` in `useEffect` return |
| Signed upload URL for files | `supabase.storage.createSignedUploadUrl(bucket, path)` — issue from API, not frontend |
| Storage upsert silently fails | Check bucket policy grants INSERT + SELECT + UPDATE |
| CLI command not found | Run `supabase <group> --help` — never guess; structure changes between versions |
| MCP server unreachable | `curl -so /dev/null -w "%{http_code}" https://mcp.supabase.com/mcp` → 401 = up |

## Realtime Tables (this project)

`chat_message` · `agent_status` · `plan_proposal` · `project_plan` · `agent_artifact`

## Service Key Locations (this project)

✅ `ai_engine/src/config.py` → `SUPABASE_SERVICE_KEY`
❌ `web/` (any file) — never
❌ Any `PUBLIC_` env var — never
