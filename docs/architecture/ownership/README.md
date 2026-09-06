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
| `cli-integration` | active | Claude Code spawn/stdio → platform events | M04 |
| `thread-navigation` | active (thin) | Sidebar thread list + session restore | M06 |
| `routing-context` | active (thin) | @mention parse + serial multi-target route | M07 |
| `dispatch` | planned | Invocation queue, cancel, busy gate | M08 |
| `callback-auth` | planned | Invocation credentials for callbacks | M10 |
| `hub-action-surface` | planned | Rich blocks, Hub actions, skills UI | M12 / M14 |
| `mcp-surface-governance` | planned | MCP tool identity and exposure | M13 |
| `portable-governance` | planned | Light SOP / Mission Hub | M15 |
| `memory` | planned | Evidence + write lanes | M16 / M17 |
| `ball-custody` | planned | Who holds the ball / wait contracts | M19 |
| `approval-index` | planned | Human approval aggregation | M20 |
| `plugin` | planned | Extensibility host | M23 |

Ordinary increments: `Map delta: none`. New boundaries require updating this table before merge.

Directory ↔ cell map: [`../code-map.md`](../code-map.md).
