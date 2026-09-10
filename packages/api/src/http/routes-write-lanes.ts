import type { FastifyInstance } from "fastify";
import {
  isWriteLaneId,
  type WriteDispositionChoice,
  type WriteLaneProposal,
} from "@mac/shared";
import type { AppDeps } from "./deps.js";

/**
 * Register memory write-lane routes (M17).
 * @param app - Fastify instance
 * @param deps - Must include writeLanes when evidence is enabled
 */
export function registerWriteLaneRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { writeLanes } = deps;

  app.get("/api/memory/lanes", async (_req, reply) => {
    if (!writeLanes) return reply.code(503).send({ error: "Write lanes not configured" });
    return { lanes: writeLanes.listLaneIds() };
  });

  app.get("/api/memory/lanes/dispositions", async (req, reply) => {
    if (!writeLanes) return reply.code(503).send({ error: "Write lanes not configured" });
    const limitRaw = (req.query as { limit?: string }).limit;
    const limit = limitRaw ? Number(limitRaw) : 20;
    return { dispositions: writeLanes.listDispositions(Number.isFinite(limit) ? limit : 20) };
  });

  /**
   * POST /api/memory/lanes/:lane/write — single-writer entry for a lane.
   */
  app.post<{
    Params: { lane: string };
    Body: {
      title?: string;
      body?: string;
      subjectKey?: string;
      tags?: string[];
      actorId?: string;
      threadId?: string;
      messageId?: string;
      disposition?: WriteDispositionChoice;
    };
  }>("/api/memory/lanes/:lane/write", async (req, reply) => {
    if (!writeLanes) return reply.code(503).send({ error: "Write lanes not configured" });
    const lane = req.params.lane;
    if (!isWriteLaneId(lane)) {
      return reply.code(404).send({ error: `Unknown write lane: ${lane}` });
    }

    const proposal: WriteLaneProposal = {
      title: req.body?.title ?? "",
      body: req.body?.body ?? "",
      subjectKey: req.body?.subjectKey ?? "",
      tags: req.body?.tags,
      actorId: req.body?.actorId,
      threadId: req.body?.threadId,
      messageId: req.body?.messageId,
      disposition: req.body?.disposition,
    };

    if (proposal.disposition && proposal.disposition !== "accept" && proposal.disposition !== "reject") {
      return reply.code(400).send({ error: "disposition must be accept|reject" });
    }

    try {
      const result = writeLanes.write(lane, proposal);
      if (result.conflict && !proposal.disposition) {
        return reply.code(409).send({ result });
      }
      return reply.code(result.disposition === "accepted" ? 201 : 200).send({ result });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
