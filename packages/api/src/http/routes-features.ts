import type { FastifyInstance } from "fastify";
import type { FeatureStage } from "@mac/shared";
import { FEATURE_STAGES } from "@mac/shared";
import type { AppDeps } from "./deps.js";

/**
 * Register Mission Hub feature + bulletin routes (M15).
 * @param app - Fastify instance
 * @param deps - Must include features store
 */
export function registerFeatureRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { features, cats, store } = deps;

  app.get("/api/features", async (_req, reply) => {
    if (!features) return reply.code(503).send({ error: "Feature store not configured" });
    return { features: features.list() };
  });

  app.get("/api/bulletin", async (_req, reply) => {
    if (!features) return reply.code(503).send({ error: "Feature store not configured" });
    return { bulletin: features.bulletin() };
  });

  app.get<{ Params: { id: string } }>("/api/features/:id", async (req, reply) => {
    if (!features) return reply.code(503).send({ error: "Feature store not configured" });
    const feature = features.get(req.params.id);
    if (!feature) return reply.code(404).send({ error: "Feature not found" });
    return { feature };
  });

  app.post<{
    Body: {
      title?: string;
      summary?: string;
      stage?: FeatureStage;
      ballHolderId?: string | null;
      threadIds?: string[];
    };
  }>("/api/features", async (req, reply) => {
    if (!features) return reply.code(503).send({ error: "Feature store not configured" });
    const title = req.body?.title?.trim() ?? "";
    if (!title) return reply.code(400).send({ error: "title required" });

    const ballHolderId =
      req.body?.ballHolderId === undefined ? null : req.body.ballHolderId;
    if (ballHolderId && cats && !cats.get(ballHolderId)) {
      return reply.code(400).send({ error: `Unknown ballHolderId: ${ballHolderId}` });
    }

    const threadIds = req.body?.threadIds ?? [];
    for (const threadId of threadIds) {
      const thread = await store.getThread(threadId);
      if (!thread) return reply.code(400).send({ error: `Unknown threadId: ${threadId}` });
    }

    try {
      const feature = features.create({
        title,
        summary: req.body?.summary,
        stage: req.body?.stage,
        ballHolderId,
        threadIds,
      });
      return reply.code(201).send({ feature });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      summary?: string;
      ballHolderId?: string | null;
      threadIds?: string[];
    };
  }>("/api/features/:id", async (req, reply) => {
    if (!features) return reply.code(503).send({ error: "Feature store not configured" });
    if (req.body?.ballHolderId && cats && !cats.get(req.body.ballHolderId)) {
      return reply.code(400).send({ error: `Unknown ballHolderId: ${req.body.ballHolderId}` });
    }
    if (req.body?.threadIds) {
      for (const threadId of req.body.threadIds) {
        const thread = await store.getThread(threadId);
        if (!thread) return reply.code(400).send({ error: `Unknown threadId: ${threadId}` });
      }
    }
    try {
      const feature = features.update(req.params.id, {
        title: req.body?.title,
        summary: req.body?.summary,
        ballHolderId: req.body?.ballHolderId,
        threadIds: req.body?.threadIds,
      });
      return { feature };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = message.includes("not found") ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  /**
   * Advance along SOP transitions (idea→spec→wip→review→done).
   */
  app.post<{
    Params: { id: string };
    Body: { stage?: FeatureStage };
  }>("/api/features/:id/advance", async (req, reply) => {
    if (!features) return reply.code(503).send({ error: "Feature store not configured" });
    const stage = req.body?.stage;
    if (!stage || !FEATURE_STAGES.includes(stage)) {
      return reply.code(400).send({ error: "valid stage required" });
    }
    try {
      const feature = features.advanceStage(req.params.id, stage);
      return { feature };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = message.includes("not found") ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });

  /**
   * Bind a thread to the feature (Done: feature ↔ thread).
   */
  app.post<{
    Params: { id: string };
    Body: { threadId?: string };
  }>("/api/features/:id/bind-thread", async (req, reply) => {
    if (!features) return reply.code(503).send({ error: "Feature store not configured" });
    const threadId = req.body?.threadId?.trim() ?? "";
    if (!threadId) return reply.code(400).send({ error: "threadId required" });
    const thread = await store.getThread(threadId);
    if (!thread) return reply.code(400).send({ error: `Unknown threadId: ${threadId}` });
    try {
      const feature = features.bindThread(req.params.id, threadId);
      return { feature };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = message.includes("not found") ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  });
}
