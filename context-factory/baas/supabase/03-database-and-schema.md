# Supabase — Database & Schema
<!-- agent-doc: v0.1.2 | last-updated: 2026-06 | audience: LLM agents, senior engineers -->

## This Project's Schema (as of Phase 2)

### Core Tables

| Table | Purpose |
|---|---|
| `project` | id, name, description, created_at |
| `project_member` | id, project_id, session_id, role (`creator`\|`approver`\|`member`), can_approve, can_edit |
| `chat_message` | id, project_id, session_id, content, created_at |
| `uploaded_file` | id, project_id, session_id, storage_path, mime_type, created_at |
| `agent_status` | id, project_id, agent (`monitor`\|`analyzer`\|`planner`\|`updater`), status, updated_at |
| `plan_proposal` | id, project_id, status (`pending`\|`approved`\|`rejected`\|`applied`\|`superseded`), changes (jsonb), created_at |
| `project_plan` | id, project_id, content (jsonb), version, finalized_at |
| `plan_version` | id, project_id, content (jsonb), created_at *(max 3 reverts)* |

### Phase 3 Tables

| Table | Purpose |
|---|---|
| `agent_run` | Tracks one pipeline execution; status: `queued`\|`running`\|`completed`\|`failed` |
| `project_memory` | Persistent extracted facts; kind: `decision`\|`task`\|`risk`\|`requirement`\|`summary`\|`detail` |
| `conversation_summary` | Rolling summaries with `last_message_created_at` |
| `agent_artifact` | Monitor/Analyzer/Planner outputs per run |
| `project_llm_usage` | Per-project daily LLM call count; unique on `(project_id, date)` |

---

## Migration Workflow

**Iterate freely with `execute_sql` (MCP) or `supabase db query` (CLI), then commit.**

```bash
# 1. Create the migration file (always use the CLI — never invent a filename)
supabase migration new <descriptive_name>

# 2. Run advisors before committing
supabase db advisors          # CLI v2.81.3+ (or MCP get_advisors)

# 3. Pull the diff into the migration file
supabase db pull <name> --local --yes

# 4. Verify
supabase migration list --local
```

**Do NOT use `apply_migration` to iterate.** It writes a history entry on every call — you cannot iterate, and `db diff` / `db pull` will produce empty or conflicting diffs.

---

## Naming Conventions

- `snake_case` for all identifiers
- Singular table names: `project`, `chat_message`, `plan_version`
- `_at` suffix for `timestamptz` columns
- `_id` suffix for all foreign key columns
- Consistent FK column names across tables (e.g., `project_id` everywhere, not `proj_id` in some)

---

## RLS Rules for This Project

| Table | Who can SELECT | Who can INSERT | Who can UPDATE |
|---|---|---|---|
| `project` | Any session that is a member | Any session (creates membership automatically) | Creator only |
| `chat_message` | Members of the project | Members of the project | Nobody (immutable) |
| `plan_proposal` | Members of the project | AI pipeline (service key) | Approver (approve/reject) |
| `project_plan` | Members of the project | AI pipeline (service key) | AI pipeline after approval |
| `agent_status` | Members of the project | AI pipeline (service key) | AI pipeline (service key) |
| `agent_artifact` | Members of the project | AI pipeline (service key) | Nobody |

> **Hackathon mode:** RLS is simplified — policies check `session_id` via `X-Session-Id` header, not `auth.uid()`. Full RLS with `auth.uid()` is deferred to post-hackathon.

---

## Realtime Subscriptions

Enabled on:

| Table | Who subscribes | Why |
|---|---|---|
| `chat_message` | Frontend (Chat island) | Live message delivery |
| `agent_status` | Frontend (AI Activity panel) | Pipeline status updates |
| `plan_proposal` | Frontend (Plan tab) | Proposal appearance |
| `project_plan` | Frontend (Plan tab) | Plan updates after approval |
| `agent_artifact` | Frontend (AI Activity panel) | Live agent outputs per run |

```typescript
// Pattern for subscribing in a React island
supabase
  .channel(`agent_artifacts:${projectId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'agent_artifact',
    filter: `project_id=eq.${projectId}`,
  }, (payload) => {
    // handle live artifact
  })
  .subscribe()
```

**Rule:** Always unsubscribe in cleanup (`useEffect` return or `onCleanup`).
