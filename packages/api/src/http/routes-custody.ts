import type { FastifyInstance } from "fastify";
import type {
  AwaitSignalKind,
  BallHolderKind,
  BallSubjectType,
} from "@mac/shared";
import type { AppDeps } from "./deps.js";

const SUBJECT_TYPES = new Set<BallSubjectType>(["thread", "feature"]);
const HOLDER_KINDS = new Set<BallHolderKind>(["cat", "human", "system", "none"]);
const SIGNAL_KINDS = new Set<AwaitSignalKind>([
  "github_pr",
  "human_approval",
  "mock",
]);

/**
 * Register ball-custody + await routes (M19).
 * @param app - Fastify instance
 * @param deps - Must include custody when enabled
 */
export function registerCustodyRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { custody } = deps;

  /**
   * GET /api/custody — list projections (who holds the ball).
   */
  app.get("/api/custody", async (req, reply) => {
    if (!custody) return reply.code(503).send({ error: "Custody not configured" });
    // Soft-expire due waits on read so Hub stays truthful without a cron UI.
    custody.expireDue(new Date().toISOString());
    const limitRaw = (req.query as { limit?: string }).limit;
    const limit = limitRaw ? Number(limitRaw) : 40;
    return { projections: custody.list(Number.isFinite(limit) ? limit : 40) };
  });

  /**
   * GET /api/custody/:subjectType/:subjectId — one projection.
   */
  app.get<{ Params: { subjectType: string; subjectId: string } }>(
    "/api/custody/:subjectType/:subjectId",
    async (req, reply) => {
      if (!custody) return reply.code(503).send({ error: "Custody not configured" });
      const subjectType = req.params.subjectType as BallSubjectType;
      if (!SUBJECT_TYPES.has(subjectType)) {
        return reply.code(400).send({ error: "subjectType must be thread|feature" });
      }
      custody.expireDue(new Date().toISOString());
      return { projection: custody.project(subjectType, req.params.subjectId) };
    },
  );

  /**
   * POST /api/custody/:subjectType/:subjectId/hold — assign holder.
   */
  app.post<{
    Params: { subjectType: string; subjectId: string };
    Body: { holderId?: string | null; holderKind?: BallHolderKind };
  }>("/api/custody/:subjectType/:subjectId/hold", async (req, reply) => {
    if (!custody) return reply.code(503).send({ error: "Custody not configured" });
    const subjectType = req.params.subjectType as BallSubjectType;
    if (!SUBJECT_TYPES.has(subjectType)) {
      return reply.code(400).send({ error: "subjectType must be thread|feature" });
    }
    const holderKind = req.body?.holderKind ?? "cat";
    if (!HOLDER_KINDS.has(holderKind)) {
      return reply.code(400).send({ error: "holderKind must be cat|human|system|none" });
    }
    try {
      const projection = custody.hold({
        subjectType,
        subjectId: req.params.subjectId,
        holderId: req.body?.holderId ?? null,
        holderKind,
      });
      return reply.code(201).send({ projection });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/custody/:subjectType/:subjectId/wait — begin signal wait.
   */
  app.post<{
    Params: { subjectType: string; subjectId: string };
    Body: {
      signalKind?: AwaitSignalKind;
      condition?: string;
      expiresAt?: string | null;
    };
  }>("/api/custody/:subjectType/:subjectId/wait", async (req, reply) => {
    if (!custody) return reply.code(503).send({ error: "Custody not configured" });
    const subjectType = req.params.subjectType as BallSubjectType;
    if (!SUBJECT_TYPES.has(subjectType)) {
      return reply.code(400).send({ error: "subjectType must be thread|feature" });
    }
    const signalKind = req.body?.signalKind ?? "mock";
    if (!SIGNAL_KINDS.has(signalKind)) {
      return reply.code(400).send({
        error: "signalKind must be github_pr|human_approval|mock",
      });
    }
    try {
      const projection = custody.beginWait({
        subjectType,
        subjectId: req.params.subjectId,
        signalKind,
        condition: req.body?.condition ?? "",
        expiresAt: req.body?.expiresAt ?? null,
      });
      return reply.code(201).send({ projection });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/awaits/:awaitId/wake — mock/external wake signal.
   */
  app.post<{
    Params: { awaitId: string };
    Body: Record<string, unknown>;
  }>("/api/awaits/:awaitId/wake", async (req, reply) => {
    if (!custody) return reply.code(503).send({ error: "Custody not configured" });
    try {
      const projection = custody.wake(req.params.awaitId, req.body ?? {});
      return { projection };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/awaits/:awaitId/cancel — cancel open wait.
   */
  app.post<{ Params: { awaitId: string } }>(
    "/api/awaits/:awaitId/cancel",
    async (req, reply) => {
      if (!custody) return reply.code(503).send({ error: "Custody not configured" });
      try {
        const projection = custody.cancelAwait(req.params.awaitId);
        return { projection };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
