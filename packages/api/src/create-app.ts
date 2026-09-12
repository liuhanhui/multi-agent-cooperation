import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { AgentProvider } from "./agents/types.js";
import { InvocationCredentialStore } from "./callback-auth/credential-store.js";
import type { CatRegistry } from "./cats/load-cat-config.js";
import { InvocationDispatcher } from "./dispatch/dispatcher.js";
import { reconcileOrphanMessages } from "./dispatch/reconcile.js";
import { TurnExecutionStore } from "./dispatch/turn-execution-store.js";
import { HandoffService } from "./handoff/handoff-service.js";
import { HandoffStore } from "./handoff/handoff-store.js";
import type { AppDeps } from "./http/deps.js";
import { registerCallbackRoutes } from "./http/routes-callbacks.js";
import { registerCatRoutes } from "./http/routes-cats.js";
import { registerEvidenceRoutes } from "./http/routes-evidence.js";
import { registerFeatureRoutes } from "./http/routes-features.js";
import { registerHandoffRoutes } from "./http/routes-handoffs.js";
import { registerInvokeRoutes } from "./http/routes-invoke.js";
import { registerMetaRoutes } from "./http/routes-meta.js";
import { registerSkillRoutes } from "./http/routes-skills.js";
import { registerThreadRoutes } from "./http/routes-threads.js";
import { registerToolRoutes } from "./http/routes-tools.js";
import { registerWriteLaneRoutes } from "./http/routes-write-lanes.js";
import { registerReceiptRoutes } from "./http/routes-receipts.js";
import { registerCustodyRoutes } from "./http/routes-custody.js";
import { registerApprovalRoutes } from "./http/routes-approvals.js";
import { registerWsRoutes } from "./http/routes-ws.js";
import { ApprovalStore } from "./approval/approval-store.js";
import { BallCustodyStore } from "./custody/ball-custody-store.js";
import { FeatureStore } from "./features/feature-store.js";
import { EvidenceStore } from "./memory/evidence-store.js";
import { WriteLaneService } from "./memory/lanes/write-lane-service.js";
import { ToolRegistry } from "./mcp/tool-registry.js";
import { ReceiptStore } from "./receipts/receipt-store.js";
import {
  loadSkillRegistry,
  resolveSkillsRoot,
  type SkillRegistry,
} from "./skills/skill-registry.js";
import type { MacStore } from "./store/types.js";
import { ThreadHub } from "./ws/thread-hub.js";

export interface AppOptions {
  store: MacStore;
  storeKind: "memory" | "redis";
  version?: string;
  agent?: AgentProvider;
  cats?: CatRegistry;
  /** Skip orphan reconcile (unit tests that seed pending messages intentionally). */
  skipReconcile?: boolean;
  /** Public base URL for agent callbackUrl (default http://127.0.0.1:$MAC_API_PORT). */
  publicBaseUrl?: string;
  /** Optional preloaded skills registry (tests). */
  skills?: SkillRegistry;
  /** Skills directory override (default repo skills/ or MAC_SKILLS_DIR). */
  skillsDir?: string;
  /** Disable skills load (tests that do not need the catalog). */
  disableSkills?: boolean;
  /** Optional prebuilt tool registry (tests). */
  tools?: ToolRegistry;
  /** Disable canonical tools (rare; tests). */
  disableTools?: boolean;
  /** Optional FeatureStore (tests). */
  features?: FeatureStore;
  /** Disable Mission Hub features (rare; tests). */
  disableFeatures?: boolean;
  /** Optional EvidenceStore (tests often pass `:memory:`). */
  evidence?: EvidenceStore;
  /** Evidence SQLite path override (ignored when `evidence` is provided). */
  evidenceDbPath?: string;
  /** Disable evidence memory (rare; tests). */
  disableEvidence?: boolean;
  /** Optional WriteLaneService (tests). */
  writeLanes?: WriteLaneService;
  /** Optional ReceiptStore (tests). */
  receipts?: ReceiptStore;
  /** Disable receipt tracking (rare; tests). */
  disableReceipts?: boolean;
  /** Optional BallCustodyStore (tests). */
  custody?: BallCustodyStore;
  /** Disable ball custody (rare; tests). */
  disableCustody?: boolean;
  /** Optional ApprovalStore (tests). */
  approvals?: ApprovalStore;
  /** Disable approval hub (rare; tests). */
  disableApprovals?: boolean;
}

/**
 * Compose the Fastify app: wire deps, reconcile orphans, register route modules.
 * @param opts - store, optional agent/cats/skills, storeKind for /health
 * @returns Ready-to-listen Fastify instance (routes registered, not listening)
 */
export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const hub = new ThreadHub();
  const executions = new TurnExecutionStore();
  const handoffStore = new HandoffStore();
  const credentials = new InvocationCredentialStore();
  const publicBaseUrl =
    opts.publicBaseUrl ??
    process.env.MAC_PUBLIC_BASE_URL ??
    `http://127.0.0.1:${process.env.MAC_API_PORT ?? "4010"}`;

  const budgetEnv = process.env.MAC_SKILLS_TOKEN_BUDGET;
  const tokenBudgetOverride =
    budgetEnv && Number(budgetEnv) > 0 ? Number(budgetEnv) : undefined;

  const skills =
    opts.skills ??
    (opts.disableSkills
      ? undefined
      : loadSkillRegistry(opts.skillsDir ?? resolveSkillsRoot(), {
          tokenBudgetOverride,
        }));

  const tools =
    opts.tools ??
    (opts.disableTools ? undefined : new ToolRegistry({ store: opts.store, hub }));

  const featureStore =
    opts.features ?? (opts.disableFeatures ? undefined : new FeatureStore());

  const evidenceStore =
    opts.evidence ??
    (opts.disableEvidence
      ? undefined
      : new EvidenceStore({
          // Tests omit path → in-memory. Production `index.ts` passes a durable path.
          dbPath: opts.evidenceDbPath ?? process.env.MAC_EVIDENCE_DB ?? ":memory:",
        }));

  const writeLaneService =
    opts.writeLanes ?? (evidenceStore ? new WriteLaneService(evidenceStore) : undefined);

  const receiptStore =
    opts.receipts ?? (opts.disableReceipts ? undefined : new ReceiptStore());

  const custodyStore =
    opts.custody ?? (opts.disableCustody ? undefined : new BallCustodyStore());

  const approvalStore =
    opts.approvals ??
    (opts.disableApprovals ? undefined : new ApprovalStore(custodyStore));

  const dispatcher = opts.agent
    ? new InvocationDispatcher({
        store: opts.store,
        hub,
        agent: opts.agent,
        executions,
        credentials,
        publicBaseUrl,
        receipts: receiptStore,
      })
    : undefined;

  const handoffs = dispatcher
    ? new HandoffService({
        store: opts.store,
        hub,
        handoffs: handoffStore,
        dispatcher,
      })
    : undefined;

  // Break construct cycle: dispatcher auto-review calls back into handoffs.
  if (dispatcher && handoffs) {
    dispatcher.attachHandoffs(handoffs);
  }

  const deps: AppDeps = {
    store: opts.store,
    hub,
    storeKind: opts.storeKind,
    version: opts.version ?? "0.0.1",
    agent: opts.agent,
    cats: opts.cats,
    dispatcher,
    handoffs,
    credentials,
    publicBaseUrl,
    skills,
    tools,
    features: featureStore,
    evidence: evidenceStore,
    writeLanes: writeLaneService,
    receipts: receiptStore,
    custody: custodyStore,
    approvals: approvalStore,
  };

  // Restart safety: pending/streaming bubbles → failed(orphan-recovered).
  if (!opts.skipReconcile) {
    await reconcileOrphanMessages(opts.store, hub);
  }

  await app.register(websocket);

  registerMetaRoutes(app, deps);
  registerCatRoutes(app, deps);
  registerThreadRoutes(app, deps);
  registerInvokeRoutes(app, deps);
  registerHandoffRoutes(app, deps);
  registerCallbackRoutes(app, deps);
  registerSkillRoutes(app, deps);
  registerToolRoutes(app, deps);
  registerFeatureRoutes(app, deps);
  registerEvidenceRoutes(app, deps);
  registerWriteLaneRoutes(app, deps);
  registerReceiptRoutes(app, deps);
  registerCustodyRoutes(app, deps);
  registerApprovalRoutes(app, deps);
  registerWsRoutes(app, deps);

  return app;
}
