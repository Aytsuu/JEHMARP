# Supabase — Anti-Patterns
<!-- agent-doc: v0.1.2 | last-updated: 2026-06 | audience: LLM agents, senior engineers -->

Agents must refuse to generate code matching these patterns.

| Anti-Pattern | Why | Fix |
|---|---|---|
| `service_role` key in any frontend code or `PUBLIC_` env var | Bypasses all RLS — full database access exposed to browser | Use `anon` key in frontend; service key only in `ai_engine` worker |
| `user_metadata` / `raw_user_meta_data` in RLS policies | User-editable — anyone can escalate privileges | Use `app_metadata` / `raw_app_meta_data` for authorization data |
| `CREATE VIEW` without `security_invoker = true` (Postgres 15+) | View runs as owner, bypasses RLS on underlying tables | Add `WITH (security_invoker = true)` or revoke public access |
| UPDATE policy without a SELECT policy | Updates silently return 0 rows — no error, no change | Always pair UPDATE policies with a SELECT policy |
| `security definer` function in the `public` schema | Exposed via Data API, escalates to function owner's permissions | Move to a private schema |
| `apply_migration` for iterative schema changes | Writes history on every call, breaks `db diff` / `db pull` workflow | Use `execute_sql` (MCP) or `supabase db query` to iterate |
| Inventing migration filenames manually | Wrong format causes Alembic/Supabase CLI to reject or misorder | Always use `supabase migration new <name>` |
| Subscribing to Realtime without unsubscribing | Memory leak in long-lived React islands | Always call `.unsubscribe()` in cleanup / `useEffect` return |
| `SELECT *` in agent context queries | Pulls unnecessary columns into LLM context, wastes tokens | Select only the columns the agent needs |
| Unbounded `chat_message` query | Will exceed context window in long projects | Always add `LIMIT` or paginate; use summaries for history |
| Storing sensitive data in Realtime payload | Realtime broadcasts to all subscribers on that channel | Filter sensitive fields before writing to Realtime-enabled tables |
| Reusing the service-key client in the API layer | The API should use session-scoped access, not bypass RLS | Service key belongs only in `ai_engine`; API uses anon + session headers |
