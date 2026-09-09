# Code Map — directory ↔ ownership cell

Structure cleanup (`chore/structure-align-cells`): keep Fastify + React; align folders to cells so `create-app` / `App` stay composition roots.

## API (`packages/api/src`)

| Path | Cell | Role |
|---|---|---|
| `create-app.ts` | scaffold | Wire deps + register route modules |
| `http/routes-meta.ts` | scaffold | `/health`, `/` |
| `http/routes-cats.ts` | identity-session | `GET /api/cats` |
| `http/routes-threads.ts` | transport / identity-session | threads + messages REST |
| `http/routes-invoke.ts` | routing-context + dispatch + cli-integration | invoke enqueue, cancel, stream-echo |
| `http/routes-ws.ts` | transport | `/ws` hydrate + subscribe |
| `dispatch/` | dispatch | InvocationDispatcher, TurnExecutionStore, reconcile |
| `callback-auth/` | callback-auth | InvocationCredentialStore + bearer verify |
| `http/routes-callbacks.ts` | callback-auth | Agent callback ingress + auth-failures |
| `routing/` | routing-context | mention → catIds policy |
| `skills/` (repo) + `api/src/skills/` | hub-action-surface | SKILL.md discovery, match, budget injection |
| `http/routes-skills.ts` | hub-action-surface | Hub browse GET /api/skills |
| `http/routes-threads.ts` (+ `/actions`) | hub-action-surface | Message CRUD + Hub block actions |
| shared `content-blocks` | hub-action-surface | Block schema, fence parse, prompt format |
| web `ContentBlocks` / Bubble | hub-action-surface | Render + interactive checklist/decision |
| `mcp/` | mcp-surface-governance | Canonical tool registry, MCP server, executors |
| `http/routes-tools.ts` | mcp-surface-governance | Hub browse GET /api/tools |
| `http/routes-callbacks.ts` | callback-auth + mcp-surface-governance | Invocation alias + tool bridge |
| `cats/` | identity-session | read-only registry load |
| `store/` | scaffold / persistence | memory + redis ports |
| `ws/thread-hub.ts` | transport | fan-out |

## Web (`packages/web/src`)

| Path | Cell | Role |
|---|---|---|
| `app/App.tsx` | scaffold | Shell composition only |
| `api/` | transport (client) | fetch + ws URL helpers |
| `hooks/useWorkspaceData.ts` | thread-navigation + identity | lists, create, default cat |
| `hooks/useThreadSocket.ts` | transport + bubble-pipeline | WS → reducer |
| `chat/` | bubble-pipeline | reducer, avatar, mention re-export |
| `features/session/` | thread-navigation | active thread sessionStorage |
| `components/` | presentation | Sidebar / ChatPanel / Bubble |

## Shared (`packages/shared/src`)

| Path | Role |
|---|---|
| `types/*` | Terminal schemas (health, cat, thread, message, events) |
| `mention.ts` | `parseMentions` (routing authority shared with API) |
| `index.ts` | Barrel re-exports only |

## Rules

1. New HTTP endpoints → add/extend `http/routes-*.ts`, do not grow `create-app.ts`.
2. New chat UX state → hooks or `chat/`, not `App.tsx` inline fetch/WS.
3. Cross-package contracts → `@mac/shared` types or mention parser; no duplicated shapes.
