# Multi-Agent Cooperation

Platform layer **above** Agent CLIs so multiple model families work as one team.

> Models set the ceiling. The platform sets the floor.

## Status

**Wave 2 / M10** — callback auth with short-lived invocation tokens (`feat/m10-callback-auth`).

Roadmap: [`build-plan.md`](./build-plan.md) · Vision: [`docs/VISION.md`](./docs/VISION.md) · Decisions: [`docs/DECISIONS.md`](./docs/DECISIONS.md)

## Prerequisites

- Node.js 20+
- pnpm 9+

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm build
pnpm start          # API on http://127.0.0.1:4010
```

In another terminal:

```bash
pnpm --filter @mac/web dev   # Web on http://127.0.0.1:4011 (proxies /health)
```

Or both:

```bash
pnpm dev
```

Check:

```bash
curl -s http://127.0.0.1:4010/health
pnpm check
```

## Packages

| Package | Role |
|---------|------|
| `@mac/shared` | Shared TypeScript contracts |
| `@mac/api` | Fastify API |
| `@mac/web` | Vite + React shell |

Default ports: API `4010`, Web `4011`, Redis `6410` (optional; `MAC_STORE=memory` by default).

## Iron Laws

See [`docs/IRON_LAWS.md`](./docs/IRON_LAWS.md). Agents must not wipe storage, kill the parent process, mutate runtime config, or touch foreign localhost ports.
