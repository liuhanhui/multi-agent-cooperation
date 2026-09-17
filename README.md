# Multi-Agent Cooperation

Platform layer **above** Agent CLIs so multiple model families work as one team.

> Models set the ceiling. The platform sets the floor.

## Status

**Wave 5 / M24** — v1.0 source distribution, one-line setup, and operator Bootcamp.

Roadmap: [`build-plan.md`](./build-plan.md) · Vision: [`docs/VISION.md`](./docs/VISION.md) · Decisions: [`docs/DECISIONS.md`](./docs/DECISIONS.md)

## Prerequisites

- Node.js 22.13+ (`node:sqlite` is used by evidence memory)
- pnpm 9+

## Quick start

```powershell
pnpm run setup
pnpm start -- --memory
```

Open **http://127.0.0.1:4011**. The API is on **http://127.0.0.1:4010**.

The setup command installs pinned dependencies, builds all packages, and runs
the safety/type checks. It does **not** write `.env`, `agent-config.json`, or MCP
config. Memory mode needs no Redis and is the recommended first run.

Detailed setup: [`SETUP.md`](./SETUP.md)
3–5 minute product tour: [`docs/WALKTHROUGH.md`](./docs/WALKTHROUGH.md)

Check:

```powershell
pnpm run doctor
pnpm run doctor:live
pnpm run smoke
pnpm check
```

Development mode with hot reload:

```powershell
pnpm dev
```

Provider configuration is optional for the Echo smoke path. To invoke real
agents, copy `.env.example` to `.env` yourself and configure Claude Code, Codex,
or Antigravity as described in `SETUP.md`.

## Packages

| Package | Role |
|---------|------|
| `@mac/shared` | Shared TypeScript contracts |
| `@mac/api` | Fastify API |
| `@mac/web` | Vite + React shell |

Default ports: API `4010`, Web `4011`, Redis `6410` (optional; `MAC_STORE=memory` by default).

## Iron Laws

See [`docs/IRON_LAWS.md`](./docs/IRON_LAWS.md). Agents must not wipe storage, kill the parent process, mutate runtime config, or touch foreign localhost ports.
