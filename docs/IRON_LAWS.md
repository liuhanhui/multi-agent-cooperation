# Iron Laws

Enforced in agent guidance (`AGENTS.md`) and machine checks (`scripts/check-iron-laws.mjs`).

1. **Data Storage Sanctuary** — Do not delete, flush, or wipe Redis databases, SQLite evidence files, or other persistent stores. Use temporary instances for experiments.
2. **Process Self-Preservation** — Do not kill the parent platform process or change startup config in ways that prevent restart.
3. **Config Immutability** — Runtime config (`.env`, `agent-config.json`, MCP config) is read-only to agents. Humans change config.
4. **Network Boundary** — Do not probe or bind localhost ports that belong to other services. This project defaults to `4010/4011/6410`.

These are agreements the team keeps — not optional style tips.
