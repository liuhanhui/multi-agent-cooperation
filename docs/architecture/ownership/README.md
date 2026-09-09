# Architecture Ownership Map

Feature work should cite:

```markdown
Architecture cell: {cell_id}
Map delta: none | update required | new cell required
Why: one sentence
```

## Cells (Wave 0 skeleton)

| Cell | Status | Summary | First milestone |
|------|--------|---------|-----------------|
| `scaffold` | active | Monorepo, health, env, start scripts; thin create-app / App shells | M02 / structure |
| `transport` | active | Local WS ingress + thread subscribe/hydrate; web `api/` + `useThreadSocket` | M03 |
| `bubble-pipeline` | active | Bubble reducer single-writer + streaming merge | M06 |
| `identity-session` | active | Cat registry + thread members/defaultCat | M05 |
| `cli-integration` | active | Claude Code + Codex + Antigravity spawn/stdio → platform events; capability table | M04 / M11 |
| `thread-navigation` | active (thin) | Sidebar thread list + session restore | M06 |
| `routing-context` | active (thin) | @mention parse + serial multi-target route | M07 |
| `dispatch` | active | InvocationQueue, busy gate, cancel, orphan reconcile; A2A handoff trigger | M08 / M09 |
| `callback-auth` | active | Short-lived invocation tokens + callback 401/expiry telemetry | M10 |
| `hub-action-surface` | active | Skills + rich blocks (checklist/decision) + Hub action write-back | M12 / M14 |
| `mcp-surface-governance` | active | MCP tool identity, exposure tiers, callback bridge | M13 |
| `portable-governance` | active | Light SOP / Mission Hub (FeatureStore + bulletin) | M15 |
| `memory` | planned | Evidence + write lanes | M16 / M17 |
| `ball-custody` | planned | Who holds the ball / wait contracts | M19 |
| `approval-index` | planned | Human approval aggregation | M20 |
| `plugin` | planned | Extensibility host | M23 |

Ordinary increments: `Map delta: none`. New boundaries require updating this table before merge.

Directory ↔ cell map: [`../code-map.md`](../code-map.md).
