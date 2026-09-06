import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { AgentProvider } from "./agents/types.js";
import type { CatRegistry } from "./cats/load-cat-config.js";
import type { AppDeps } from "./http/deps.js";
import { registerCatRoutes } from "./http/routes-cats.js";
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
}

/**
 * Compose the Fastify app: wire deps, then register cell-aligned route modules.
 * @param opts - store, optional agent/cats, storeKind for /health
 * @returns Ready-to-listen Fastify instance (routes registered, not listening)
 */
export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const hub = new ThreadHub();
  const deps: AppDeps = {
    store: opts.store,
    hub,
    storeKind: opts.storeKind,
    version: opts.version ?? "0.0.1",
    agent: opts.agent,
    cats: opts.cats,
  };

  await app.register(websocket);

  registerMetaRoutes(app, deps);
  registerCatRoutes(app, deps);
  registerThreadRoutes(app, deps);
  registerInvokeRoutes(app, deps);
  registerWsRoutes(app, deps);

  return app;
}
