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
| `receipts/` + `http/routes-receipts.ts` | bubble-pipeline + dispatch | Per-target receipts + freshness (no late overwrite) |
| `custody/` + `http/routes-custody.ts` | ball-custody | Ball projection + AwaitState hold/wait/wake |
| `approval/` + `http/routes-approvals.ts` | approval-index | Approval Hub ingress + decide ledger |
| `settings/` + `http/routes-settings.ts` | hub-action-surface + routing-context | Hub Settings document + routing policy PATCH |
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
| `features/` + `http/routes-features.ts` | portable-governance | FeatureStore, SOP advance, bulletin |
| `sop/feature-lifecycle.yaml` (repo) | portable-governance | Light SOP stages (doc + reference) |
| `memory/` + `http/routes-evidence.ts` | memory | EvidenceStore (SQLite FTS5), retrieve + inject |
| `memory/lanes/` + `http/routes-write-lanes.ts` | memory | Write lanes + conflict disposition |
| `cats/` | identity-session | read-only registry load |
| `store/` | scaffold / persistence | memory + redis ports |
| `ws/thread-hub.ts` | transport | fan-out |

## Web (`packages/web/src`)

| Path | Cell | Role |
|---|---|---|
| `app/App.tsx` | scaffold | Shell composition only |
| `api/` | transport (client) | fetch + ws URL helpers |
| `hooks/useWorkspaceData.ts` | thread-navigation + identity + portable-governance + memory | lists, bulletin, evidence |
| `hooks/useThreadSocket.ts` | transport + bubble-pipeline | WS → reducer |
| `chat/` | bubble-pipeline | reducer, avatar, mention re-export |
| `features/session/` | thread-navigation | active thread sessionStorage |
| `components/MissionBoard.tsx` | portable-governance | Mission columns + create/advance/bind |
| `components/EvidencePanel.tsx` | memory | Evidence write / BM25 search |
| `components/WriteLanesPanel.tsx` | memory | Lane write + conflict disposition |
| `components/ReceiptsPanel.tsx` | bubble-pipeline + dispatch | Per-target receipt browse / supplement / ack |
| `components/BallCustodyPanel.tsx` | ball-custody | Who holds the ball + wait / mock wake |
| `components/ApprovalPanel.tsx` | approval-index | Human approve/reject + producer demos |
| `components/SettingsPanel.tsx` | hub-action-surface + routing-context | Settings nav + accounts + Rules routing |
| `components/` | presentation | Sidebar / ChatPanel / Bubble / Skills / Tools |

## Shared (`packages/shared/src`)

| Path | Role |
|---|---|
| `types/*` | Terminal schemas (health, cat, thread, message, events, feature, evidence) |
| `types/feature.ts` | Feature / FeatureStage / BulletinBoard + SOP transitions |
| `types/evidence.ts` | Evidence + provenance + retrieval result shapes |
| `types/write-lane.ts` | WriteLaneId / proposal / disposition / result |
| `types/receipt.ts` | DeliveryBatch / TargetReceipt / freshness helpers |
| `types/ball-custody.ts` | BallCustodyProjection / AwaitState / custody triple |
| `types/approval.ts` | ApprovalIngress / Request / producer catalog |
| `types/hub-settings.ts` | HubSettingsDocument / RoutingPolicy / provider accounts |
| `mention.ts` | `parseMentions` (routing authority shared with API) |
| `index.ts` | Barrel re-exports only |

## Rules

1. New HTTP endpoints → add/extend `http/routes-*.ts`, do not grow `create-app.ts`.
2. New chat UX state → hooks or `chat/`, not `App.tsx` inline fetch/WS.
3. Cross-package contracts → `@mac/shared` types or mention parser; no duplicated shapes.
