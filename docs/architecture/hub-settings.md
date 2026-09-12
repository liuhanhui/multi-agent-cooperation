# Hub Settings (M21)

Architecture cell: `hub-action-surface` (+ thin `routing-context` / `identity-session` / `cli-integration`)  
Map delta: update required (settings surface under hub-action-surface)

## Idea

Operators configure the lounge from **Settings** without editing code. Secrets never leave `.env` / the secret store — Hub only shows readiness and setup hints (Iron Law: Config Immutability at runtime).

## Nav (product tree)

| Section | Content |
|---------|---------|
| Members | Cat registry identities |
| Accounts | 3 CLI providers readiness checklist |
| Skills | Catalog count + token budget |
| MCP | Tool count + aspects |
| System | Version / ports / store / `MAC_AGENT_PROVIDER` |
| Rules | Routing policy (strategy, fallback, maxTargets) |
| Ops | Soft invoke / approval counters |

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/settings` | Full settings document |
| GET | `/api/settings/routing` | Current routing policy |
| PATCH | `/api/settings/routing` | Mutate policy; **next invoke** uses it |

## Routing immediacy

`PATCH` updates in-memory `HubSettingsStore`. `POST …/messages/invoke` reads `settings.getRoutingPolicy()` when the body omits `strategy`. Body fields still win for one-shot overrides.

## Configure 3 providers (non-dev)

Edit `.env` **offline** (never via Hub):

1. **Claude Code** — install `claude` or set `MAC_CLAUDE_COMMAND`; default `MAC_AGENT_PROVIDER=claude-code`.
2. **Codex** — install `codex` or set `MAC_CODEX_COMMAND`.
3. **Antigravity** — set `MAC_AGY_COMMAND` to your `agy` binary path.

Smoke without CLIs: `MAC_AGENT_PROVIDER=fake`. Restart API after `.env` changes. Settings → Accounts shows ready / needs setup.

## Done criteria

- Settings nav covers members / accounts / skills / mcp / system / rules / ops
- Secrets only in env; Hub never writes them
- Quota/usage panel (Ops)
- Non-dev can configure 3 providers via this doc
- Routing policy change takes effect on the next Send / invoke
