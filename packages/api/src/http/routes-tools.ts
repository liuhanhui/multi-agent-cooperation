import type { FastifyInstance } from "fastify";
import type { AppDeps } from "./deps.js";

/**
 * Register Hub browse routes for the canonical tool catalog (M13).
 * @param app - Fastify instance
 * @param deps - Must include tools registry
 */
export function registerToolRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { tools } = deps;

  app.get("/api/tools", async (_req, reply) => {
    if (!tools) {
      return reply.code(503).send({ error: "Tool registry not configured" });
    }
    return {
      aspects: tools.aspects(),
      tools: tools.listForHub(),
    };
  });

  app.get<{ Params: { id: string } }>("/api/tools/:id", async (req, reply) => {
    if (!tools) {
      return reply.code(503).send({ error: "Tool registry not configured" });
    }
    const tool = tools.get(req.params.id);
    if (!tool) return reply.code(404).send({ error: "Tool not found" });
    return { tool };
  });
}
