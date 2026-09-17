# Setup

This is the source distribution for Multi-Agent Cooperation v1.0.

## 1. Prerequisites

- Git
- Node.js **22.13 or newer** (`node:sqlite` powers the evidence store)
- pnpm **9.x** (`corepack enable` can provide it)

Windows PowerShell and macOS/Linux shells are supported. Docker and Redis are
not required for the first run.

## 2. Clone and build

```powershell
git clone https://github.com/liuhanhui/multi-agent-cooperation.git
cd multi-agent-cooperation
pnpm run setup
```

`pnpm run setup` performs:

1. `pnpm install --frozen-lockfile`
2. Build shared contracts, API, and Web
3. Iron Laws guard and TypeScript checks

It never edits `.env`, `agent-config.json`, or MCP configuration.

## 3. Start without Redis or a real agent

```powershell
pnpm start -- --memory
```

Open:

- Hub: http://127.0.0.1:4011
- API health: http://127.0.0.1:4010/health

Use **Echo** in a thread for the first smoke test. It requires no provider CLI.
The in-product **Bootcamp** button walks through the first five checks.

Verify from another terminal:

```powershell
pnpm run doctor:live
```

Or run the self-contained acceptance smoke (memory store + fake provider):

```powershell
pnpm run smoke
```

It starts only its own API/Web children, creates an in-memory thread, verifies a
fake invocation and Web proxy, then stops those children.

Stop the launcher with `Ctrl+C`. It stops only the API and Web processes it
created.

## 4. Configure a real provider (optional)

Copy the example yourself:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Then edit `.env` and choose one:

### Claude Code

```env
MAC_AGENT_PROVIDER=claude-code
# MAC_CLAUDE_COMMAND=claude
```

### Codex

```env
MAC_AGENT_PROVIDER=codex
# MAC_CODEX_COMMAND=codex
```

### Antigravity

```env
MAC_AGENT_PROVIDER=antigravity
MAC_AGY_COMMAND=/absolute/path/to/agy
```

Restart after changing `.env`. Settings → Accounts shows readiness without
showing secret values.

## 5. Optional Redis mode

Use only a Redis instance dedicated to this project on port **6410**:

```env
MAC_STORE=redis
REDIS_URL=redis://127.0.0.1:6410
```

Never point this project at another application's Redis and never flush
persistent storage. Memory mode remains available with:

```powershell
pnpm start -- --memory
```

## 6. GitHub webhook (optional)

Set an operator-chosen secret:

```env
MAC_GITHUB_WEBHOOK_SECRET=replace-me
```

Configure GitHub to send signed events to:

```text
POST http(s)://YOUR_PUBLIC_HOST/webhooks/github
```

For a local demo without public networking, use the Hub's **GitHub → Simulate
signal** path.

## 7. Troubleshooting

Run:

```powershell
pnpm run doctor
```

Common failures:

- **Node too old** — install Node 22.13+ (`.nvmrc` and `.node-version` are pinned).
- **pnpm major mismatch** — run `corepack prepare pnpm@9.15.0 --activate`.
- **Build output missing** — rerun `pnpm run setup`.
- **401/agent command error** — confirm the provider CLI works in the same
  terminal, then restart.
- **Port already in use** — do not kill an unknown service. Change this
  project's ports in `.env` and keep away from foreign localhost ports.

Continue with [`docs/WALKTHROUGH.md`](./docs/WALKTHROUGH.md).
