# MCP Surface Governance (M13)

Architecture cell: `mcp-surface-governance`  
Map delta: cell status → active

## Canonical registry

One semantic tool → one MCP wire name. Dual exposure of the same semantics is rejected at registry build (`assertCanonicalTools`).

| Semantic id | MCP name | Aspect | Families |
|---|---|---|---|
| `thread.post_message` | `thread_post_message` | messaging | claude-code, codex, antigravity |

## Exposure tiers

- `hub` — listed on `GET /api/tools` / Hub Tools panel
- `agent` — callable from MCP + callback bridge
- `public` — reserved for unauthenticated surfaces (unused in M13)

## Aspect cut-list

Current aspects present in the catalog: **messaging** (future: governance, ops, memory).

## Surfaces (same executor)

1. **MCP** — `createMacMcpServer` / `pnpm --filter @mac/api mcp` (stdio → HTTP bridge)
2. **Callback bridge** — `POST /api/callbacks/tools/:toolId` with Bearer invocation token + optional `x-mac-family`
3. **Legacy alias** — `POST /api/callbacks/invocation` forwards to `thread.post_message` (not a second tool)

## Hub

- `GET /api/tools` — catalog + aspects
- `GET /api/tools/:id` — one entry
- Web right rail: Tools panel under Skills

## Stdio env

```
MAC_API_BASE_URL=http://127.0.0.1:4010
MAC_MCP_CALLBACK_TOKEN=<invocation bearer>
MAC_MCP_FAMILY=codex
```

## Done checklist

| Criterion | Mechanism |
|---|---|
| First-party MCP server | `createMacMcpServer` + stdio entry |
| Tool registry + annotations + tiers | `ToolRegistry` / `CANONICAL_TOOLS` |
| No dual exposure | `assertCanonicalTools` |
| Callback bridge for non-Claude | `/api/callbacks/tools/:toolId` |
| Two families via MCP | `mcp.test.ts` claude-code + codex |
| Hub tool catalog | API + ToolsPanel |
