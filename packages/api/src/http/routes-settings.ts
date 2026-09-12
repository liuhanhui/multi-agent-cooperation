import type { FastifyInstance } from "fastify";
import type { RoutingPolicy } from "@mac/shared";
import type { AppDeps } from "./deps.js";

/**
 * Register Hub Settings routes (M21).
 * @param app - Fastify instance
 * @param deps - Must include settings when enabled
 */
export function registerSettingsRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { settings } = deps;

  /**
   * GET /api/settings — full settings document (nav + sections snapshot).
   */
  app.get("/api/settings", async (_req, reply) => {
    if (!settings) return reply.code(503).send({ error: "Settings not configured" });
    return { settings: settings.getDocument() };
  });

  /**
   * GET /api/settings/routing — current routing policy.
   */
  app.get("/api/settings/routing", async (_req, reply) => {
    if (!settings) return reply.code(503).send({ error: "Settings not configured" });
    return { routing: settings.getRoutingPolicy() };
  });

  /**
   * PATCH /api/settings/routing — mutate policy; next invoke uses it.
   */
  app.patch<{ Body: Partial<RoutingPolicy> }>(
    "/api/settings/routing",
    async (req, reply) => {
      if (!settings) return reply.code(503).send({ error: "Settings not configured" });
      try {
        const routing = settings.updateRoutingPolicy(req.body ?? {});
        return { routing };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
