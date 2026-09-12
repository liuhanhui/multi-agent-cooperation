import type { FastifyInstance } from "fastify";
import {
  isApprovalProducerId,
  type ApprovalChoice,
  type ApprovalIngress,
} from "@mac/shared";
import type { AppDeps } from "./deps.js";

/**
 * Register Approval Hub routes (M20).
 * @param app - Fastify instance
 * @param deps - Must include approvals when enabled
 */
export function registerApprovalRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { approvals } = deps;

  /**
   * GET /api/approvals/producers — producer catalog.
   */
  app.get("/api/approvals/producers", async (_req, reply) => {
    if (!approvals) return reply.code(503).send({ error: "Approvals not configured" });
    return { producers: approvals.listProducers() };
  });

  /**
   * GET /api/approvals — list ledger (optional ?status=pending).
   */
  app.get("/api/approvals", async (req, reply) => {
    if (!approvals) return reply.code(503).send({ error: "Approvals not configured" });
    const q = req.query as { status?: string; limit?: string };
    const status =
      q.status === "pending" || q.status === "approved" || q.status === "rejected"
        ? q.status
        : undefined;
    const limit = q.limit ? Number(q.limit) : 40;
    return {
      approvals: approvals.list(status, Number.isFinite(limit) ? limit : 40),
    };
  });

  /**
   * POST /api/approvals — producer ingress.
   */
  app.post<{ Body: ApprovalIngress }>("/api/approvals", async (req, reply) => {
    if (!approvals) return reply.code(503).send({ error: "Approvals not configured" });
    const body = req.body;
    if (!body?.producerId || !isApprovalProducerId(body.producerId)) {
      return reply.code(400).send({ error: "producerId must be memory_write|handoff" });
    }
    try {
      const approval = approvals.submit(body);
      return reply.code(201).send({ approval });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/approvals/:id/decide — human approve|reject (only Hub disposition path).
   */
  app.post<{
    Params: { id: string };
    Body: { choice?: ApprovalChoice; actorId?: string; note?: string };
  }>("/api/approvals/:id/decide", async (req, reply) => {
    if (!approvals) return reply.code(503).send({ error: "Approvals not configured" });
    const choice = req.body?.choice;
    if (choice !== "approve" && choice !== "reject") {
      return reply.code(400).send({ error: "choice must be approve|reject" });
    }
    try {
      const approval = approvals.decide(req.params.id, {
        choice,
        actorId: req.body?.actorId ?? "operator",
        note: req.body?.note,
      });
      return { approval };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
