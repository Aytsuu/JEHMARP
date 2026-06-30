# Supabase — Postgres Best Practices
<!-- agent-doc: v0.1.2 | last-updated: 2026-06 | audience: LLM agents, senior engineers -->

Reference: [supabase-postgres-best-practices skill](./../../../.agents/skills/supabase-postgres-best-practices/SKILL.md)

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## Critical Rules for This Project

### Indexes

- Every foreign key column (`project_id`, `session_id`, `run_id`) must have an index.
- Add partial indexes for filtered queries that are common: e.g., `WHERE status = 'pending'` on `plan_proposal`.

```sql
-- Example: index for fetching pending proposals per project
create index plan_proposal_project_pending_idx
  on plan_proposal (project_id)
  where status = 'pending';
```

### Connection Management

- Never open a long-lived Supabase client inside a worker loop. Reuse a single client instance per worker process.
- Use connection pooling (Supabase's built-in PgBouncer) for the Python backend. Set pool mode to `transaction` for stateless API calls.

### JSONB Columns

- `plan_proposal.changes`, `project_plan.content`, `agent_artifact.payload` are all JSONB.
- Do joins and filtering in SQL before deserializing to Python/TypeScript. Do not pull full rows and filter in application code.
- Use `->` (returns JSON) and `->>` (returns text) correctly in queries.

```sql
-- Extract a specific field from jsonb
select id, changes->>'action' as action
from plan_proposal
where project_id = $1
  and status = 'pending';
```

### RLS Performance

- RLS policies are evaluated on every row. Keep policy expressions simple — avoid subqueries that hit large tables on every row evaluation.
- Use `set local` / `current_setting` for passing the session_id from the API to Postgres (via connection headers) rather than joining against an external lookup on every row.

### Avoid

- `SELECT *` in production queries — select only the columns you need.
- Unbounded queries on `chat_message` — always paginate or limit, especially for context assembly in the AI pipeline.
- Calling `count(*)` on large tables without a filter — use `pg_class` estimates for approximate counts.
