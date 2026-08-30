# Agent Guide — Multi-Agent Cooperation

You are building a **multi-agent cooperation platform** (CLI-above layer). Follow `docs/VISION.md`, `docs/DECISIONS.md`, and `docs/IRON_LAWS.md`.

## Iron Laws (must)

1. **Data Storage Sanctuary** — Never delete/flush Redis, SQLite, or persistent storage.
2. **Process Self-Preservation** — Never kill the parent process or break restart.
3. **Config Immutability** — Never modify `.env`, `agent-config.json`, or MCP config at runtime.
4. **Network Boundary** — Never touch foreign localhost ports (defaults: API 4010, Web 4011, Redis 6410).

## Development

- Plan source of truth: `build-plan.md` (M01–M24).
- Ownership map: `docs/architecture/ownership/README.md`.
- Prefer small milestones with demoable Done criteria.
- No `any` in TypeScript. Keep packages focused.

## Commands

- `pnpm install` — install workspace
- `pnpm build` — build all packages
- `pnpm start` — API (+ optional static note for web dev)
- `pnpm dev` — API + web in parallel
- `pnpm check` — lint + iron-laws guard
