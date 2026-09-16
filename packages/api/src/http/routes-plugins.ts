import type { FastifyInstance } from "fastify";
import type { AppDeps } from "./deps.js";

/**
 * Register plugin catalog / lifecycle / call routes (M23).
 * @param app - Fastify instance
 * @param deps - Must include plugins host when enabled
 */
export function registerPluginRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { plugins } = deps;

  /**
   * GET /api/plugins/catalog — official catalog shell.
   */
  app.get("/api/plugins/catalog", async (_req, reply) => {
    if (!plugins) return reply.code(503).send({ error: "Plugins not configured" });
    return { catalog: plugins.listCatalog() };
  });

  /**
   * GET /api/plugins — installed/available records + recent call receipts.
   */
  app.get("/api/plugins", async (req, reply) => {
    if (!plugins) return reply.code(503).send({ error: "Plugins not configured" });
    const limitRaw = (req.query as { limit?: string }).limit;
    const limit = limitRaw ? Number(limitRaw) : 40;
    return {
      plugins: plugins.listPlugins(),
      receipts: plugins.listReceipts(Number.isFinite(limit) ? limit : 40),
    };
  });

  /**
   * POST /api/plugins/:id/install — install from catalog.
   */
  app.post<{ Params: { id: string } }>("/api/plugins/:id/install", async (req, reply) => {
    if (!plugins) return reply.code(503).send({ error: "Plugins not configured" });
    try {
      const plugin = plugins.install(req.params.id);
      return reply.code(201).send({ plugin });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/plugins/:id/uninstall — remove install (must be inactive).
   */
  app.post<{ Params: { id: string } }>(
    "/api/plugins/:id/uninstall",
    async (req, reply) => {
      if (!plugins) return reply.code(503).send({ error: "Plugins not configured" });
      try {
        const plugin = plugins.uninstall(req.params.id);
        return { plugin };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  /**
   * POST /api/plugins/:id/activate — mark active (in-process).
   */
  app.post<{ Params: { id: string } }>(
    "/api/plugins/:id/activate",
    async (req, reply) => {
      if (!plugins) return reply.code(503).send({ error: "Plugins not configured" });
      try {
        const plugin = plugins.activate(req.params.id);
        return { plugin };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  /**
   * POST /api/plugins/:id/deactivate — stop without uninstall.
   */
  app.post<{ Params: { id: string } }>(
    "/api/plugins/:id/deactivate",
    async (req, reply) => {
      if (!plugins) return reply.code(503).send({ error: "Plugins not configured" });
      try {
        const plugin = plugins.deactivate(req.params.id);
        return { plugin };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  /**
   * POST /api/plugins/:id/grants — grant a requested capability.
   */
  app.post<{ Params: { id: string }; Body: { capability?: string } }>(
    "/api/plugins/:id/grants",
    async (req, reply) => {
      if (!plugins) return reply.code(503).send({ error: "Plugins not configured" });
      const capability = req.body?.capability?.trim() ?? "";
      if (!capability) return reply.code(400).send({ error: "capability required" });
      try {
        const plugin = plugins.grant(req.params.id, capability);
        return { plugin };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  /**
   * DELETE /api/plugins/:id/grants/:capability — revoke grant.
   */
  app.delete<{ Params: { id: string; capability: string } }>(
    "/api/plugins/:id/grants/:capability",
    async (req, reply) => {
      if (!plugins) return reply.code(503).send({ error: "Plugins not configured" });
      try {
        const plugin = plugins.revoke(req.params.id, req.params.capability);
        return { plugin };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  /**
   * POST /api/plugins/:id/call — invoke capability; returns settled receipt.
   */
  app.post<{
    Params: { id: string };
    Body: { capability?: string; args?: Record<string, unknown> };
  }>("/api/plugins/:id/call", async (req, reply) => {
    if (!plugins) return reply.code(503).send({ error: "Plugins not configured" });
    const capability = req.body?.capability?.trim() ?? "";
    if (!capability) return reply.code(400).send({ error: "capability required" });
    const receipt = await plugins.call(
      req.params.id,
      capability,
      req.body?.args ?? {},
    );
    // Settlement is durable in-memory; HTTP 200 with receipt.status for Hub UX.
    return { receipt };
  });
}
