import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@mac/shared";
import type { AppDeps } from "./deps.js";

/**
 * Register meta routes: `/health` and `/` discovery document.
 * @param app - Fastify instance
 * @param deps - version / storeKind / optional agent id for health payload
 */
export function registerMetaRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { version, storeKind, agent } = deps;

  app.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: "mac-api",
    version,
    store: storeKind,
    timestamp: new Date().toISOString(),
    ...(agent ? { agent: agent.id } : {}),
  }));

  app.get("/", async () => ({
    name: "multi-agent-cooperation",
    docs: ["docs/VISION.md", "build-plan.md"],
    health: "/health",
    api: {
      threads: "/api/threads",
      cats: "/api/cats",
      invoke: "/api/threads/:id/messages/invoke",
      ws: "/ws?threadId=",
    },
  }));
}
