# Supabase — CLI & MCP
<!-- agent-doc: v0.1.2 | last-updated: 2026-06 | audience: LLM agents, senior engineers -->

## CLI

Always discover commands via `--help` — never guess. The CLI structure changes between versions.

```bash
supabase --help                    # All top-level commands
supabase <group> --help            # Subcommands (e.g., supabase db --help)
supabase <group> <command> --help  # Flags for a specific command
```

### Known Gotchas

| Issue | Details |
|---|---|
| `supabase db query` | Requires **CLI v2.79.0+** → use MCP `execute_sql` or `psql` as fallback |
| `supabase db advisors` | Requires **CLI v2.81.3+** → use MCP `get_advisors` as fallback |
| New migration files | **Always** create with `supabase migration new <name>`. Never invent a filename. |

```bash
supabase --version   # check current version
```

---

## MCP Server

For setup instructions, see the [MCP setup guide](https://supabase.com/docs/guides/getting-started/mcp).

### Troubleshooting Connection Issues (in order)

1. **Check if the server is reachable:**
   ```bash
   curl -so /dev/null -w "%{http_code}" https://mcp.supabase.com/mcp
   ```
   `401` = server is up (no token). Timeout = server may be down.

2. **Check `.mcp.json`:** Verify the project root has a valid `.mcp.json` pointing to `https://mcp.supabase.com/mcp`.

3. **Authenticate:** Supabase MCP uses OAuth 2.1. Trigger the auth flow in your agent, complete it in the browser, reload the session.

---

## Documentation Access

Before implementing any Supabase feature, look up the current docs in this order:

1. **MCP `search_docs` tool** — preferred, returns relevant snippets directly
2. **Fetch docs as markdown** — append `.md` to any docs URL path
3. **Web search** — when you don't know which page to look at
