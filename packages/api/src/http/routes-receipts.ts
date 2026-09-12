import type { FastifyInstance } from "fastify";
import type { AppDeps } from "./deps.js";

/**
 * Register per-target delivery receipt + freshness routes (M18).
 * @param app - Fastify instance
 * @param deps - Must include receipts when enabled
 */
export function registerReceiptRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { receipts } = deps;

  /**
   * GET /api/threads/:threadId/receipts — recent delivery batches for a thread.
   */
  app.get<{
    Params: { threadId: string };
    Querystring: { limit?: string };
  }>("/api/threads/:threadId/receipts", async (req, reply) => {
    if (!receipts) return reply.code(503).send({ error: "Receipts not configured" });
    const limitRaw = req.query.limit;
    const limit = limitRaw ? Number(limitRaw) : 20;
    const batches = receipts.listBatchesForThread(
      req.params.threadId,
      Number.isFinite(limit) ? limit : 20,
    );
    return { batches };
  });

  /**
   * GET /api/receipts/:receiptId — single target receipt.
   */
  app.get<{ Params: { receiptId: string } }>(
    "/api/receipts/:receiptId",
    async (req, reply) => {
      if (!receipts) return reply.code(503).send({ error: "Receipts not configured" });
      const receipt = receipts.getReceipt(req.params.receiptId);
      if (!receipt) return reply.code(404).send({ error: "Receipt not found" });
      return { receipt };
    },
  );

  /**
   * POST /api/receipts/:receiptId/supplements — append non-authoritative late text.
   */
  app.post<{
    Params: { receiptId: string };
    Body: { content?: string };
  }>("/api/receipts/:receiptId/supplements", async (req, reply) => {
    if (!receipts) return reply.code(503).send({ error: "Receipts not configured" });
    try {
      const receipt = receipts.appendSupplement(
        req.params.receiptId,
        req.body?.content ?? "",
      );
      return reply.code(201).send({ receipt });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/receipts/:receiptId/ack — operator/target ack after delivery.
   */
  app.post<{ Params: { receiptId: string } }>(
    "/api/receipts/:receiptId/ack",
    async (req, reply) => {
      if (!receipts) return reply.code(503).send({ error: "Receipts not configured" });
      try {
        const receipt = receipts.ack(req.params.receiptId);
        return { receipt };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
