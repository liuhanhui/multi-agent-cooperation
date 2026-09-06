import type { FastifyInstance } from "fastify";
import type { AppDeps } from "./deps.js";

/**
 * Register explicit A2A handoff routes (M09).
 * @param app - Fastify instance
 * @param deps - handoffs service + cats for membership checks
 */
export function registerHandoffRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { store, cats, handoffs } = deps;

  /**
   * Create a structured handoff and deliver it into the thread.
   * Optional triggerReview enqueues @toCat with the five-piece prompt.
   */
  app.post<{
    Params: { id: string };
    Body: {
      fromCatId?: string;
      toCatId?: string;
      kind?: "review" | "general";
      payload?: unknown;
      sourceMessageId?: string;
      triggerReview?: boolean;
    };
  }>("/api/threads/:id/handoffs", async (req, reply) => {
    if (!handoffs) return reply.code(503).send({ error: "Handoff service not configured" });
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });

    const fromCatId = req.body?.fromCatId?.trim() ?? "";
    const toCatId = req.body?.toCatId?.trim() ?? "";
    if (!fromCatId || !toCatId) {
      return reply.code(400).send({ error: "fromCatId and toCatId required" });
    }
    if (cats && (!cats.get(fromCatId) || !cats.get(toCatId))) {
      return reply.code(400).send({ error: "Unknown fromCatId or toCatId" });
    }
    if (thread.memberIds.length > 0) {
      if (!thread.memberIds.includes(fromCatId) || !thread.memberIds.includes(toCatId)) {
        return reply.code(400).send({ error: "Both cats must be thread members" });
      }
    }

    try {
      const handoff = await handoffs.createAndDeliver({
        threadId: thread.id,
        fromCatId,
        toCatId,
        kind: req.body?.kind ?? "review",
        payload: req.body?.payload,
        sourceMessageId: req.body?.sourceMessageId,
        triggerReview: req.body?.triggerReview === true,
        systemSnippetFor: (catId) => cats?.get(catId)?.systemSnippet,
      });
      return reply.code(201).send({ handoff });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get<{ Params: { id: string } }>("/api/threads/:id/handoffs", async (req, reply) => {
    if (!handoffs) return reply.code(503).send({ error: "Handoff service not configured" });
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    return { handoffs: handoffs.list(thread.id) };
  });

  app.get<{ Params: { id: string; handoffId: string } }>(
    "/api/threads/:id/handoffs/:handoffId",
    async (req, reply) => {
      if (!handoffs) return reply.code(503).send({ error: "Handoff service not configured" });
      const thread = await store.getThread(req.params.id);
      if (!thread) return reply.code(404).send({ error: "Thread not found" });
      const handoff = handoffs.get(req.params.handoffId);
      if (!handoff || handoff.threadId !== thread.id) {
        return reply.code(404).send({ error: "Handoff not found" });
      }
      return { handoff };
    },
  );

  /**
   * Explicit receipt: target cat marks handoff as 已接收.
   */
  app.post<{
    Params: { id: string; handoffId: string };
    Body: { byCatId?: string };
  }>("/api/threads/:id/handoffs/:handoffId/ack", async (req, reply) => {
    if (!handoffs) return reply.code(503).send({ error: "Handoff service not configured" });
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const existing = handoffs.get(req.params.handoffId);
    if (!existing || existing.threadId !== thread.id) {
      return reply.code(404).send({ error: "Handoff not found" });
    }
    const byCatId = req.body?.byCatId?.trim() || existing.toCatId;
    const handoff = handoffs.ack(existing.id, byCatId);
    return { handoff };
  });
}
