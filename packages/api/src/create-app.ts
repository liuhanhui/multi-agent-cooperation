import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { AgentProvider } from "./agents/types.js";
import type { CatRegistry } from "./cats/load-cat-config.js";
import { InvocationDispatcher } from "./dispatch/dispatcher.js";
import { reconcileOrphanMessages } from "./dispatch/reconcile.js";
import { TurnExecutionStore } from "./dispatch/turn-execution-store.js";
import { HandoffService } from "./handoff/handoff-service.js";
import { HandoffStore } from "./handoff/handoff-store.js";
import type { AppDeps } from "./http/deps.js";
import { registerCatRoutes } from "./http/routes-cats.js";
import { registerHandoffRoutes } from "./http/routes-handoffs.js";
import { registerInvokeRoutes } from "./http/routes-invoke.js";
import { registerMetaRoutes } from "./http/routes-meta.js";
import { registerThreadRoutes } from "./http/routes-threads.js";
import { registerWsRoutes } from "./http/routes-ws.js";
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
}

/**
 * Compose the Fastify app: wire deps, reconcile orphans, register route modules.
 * @param opts - store, optional agent/cats, storeKind for /health
 * @returns Ready-to-listen Fastify instance (routes registered, not listening)
 */
export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const hub = new ThreadHub();
  const executions = new TurnExecutionStore();
  const handoffStore = new HandoffStore();

  const dispatcher = opts.agent
    ? new InvocationDispatcher({
        store: opts.store,
        hub,
        agent: opts.agent,
        executions,
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
  registerWsRoutes(app, deps);

  return app;
}
