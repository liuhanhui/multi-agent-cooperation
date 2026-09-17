import type { FastifyInstance } from "fastify";
import type {
  CaptureFrictionInput,
  EvaluateFrictionInput,
  FrictionStatus,
  RespondFrictionInput,
} from "@mac/shared";
import type { AppDeps } from "./deps.js";

const STATUSES = new Set<FrictionStatus>([
  "captured",
  "evaluated",
  "responded",
]);

/**
 * Register the M25 friction lifecycle routes.
 * @param app - Fastify application
 * @param deps - Must include the single FrictionStore lifecycle owner
 * @returns Nothing; routes are registered on app
 */
export function registerFrictionRoutes(
  app: FastifyInstance,
  deps: AppDeps,
): void {
  const { frictions } = deps;

  /**
   * GET /api/frictions — newest-first lifecycle ledger.
   */
  app.get("/api/frictions", async (req, reply) => {
    if (!frictions) {
      return reply.code(503).send({ error: "Friction harness not configured" });
    }
    const query = req.query as { status?: string; limit?: string };
    if (query.status && !STATUSES.has(query.status as FrictionStatus)) {
      return reply
        .code(400)
        .send({ error: "status must be captured|evaluated|responded" });
    }
    const status = query.status as FrictionStatus | undefined;
    const parsedLimit = query.limit ? Number(query.limit) : 60;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 60;
    return { frictions: frictions.list(status, limit) };
  });

  /**
   * GET /api/frictions/:id — one projection with its ordered audit events.
   */
  app.get<{ Params: { id: string } }>(
    "/api/frictions/:id",
    async (req, reply) => {
      if (!frictions) {
        return reply
          .code(503)
          .send({ error: "Friction harness not configured" });
      }
      const friction = frictions.get(req.params.id);
      if (!friction) {
        return reply.code(404).send({ error: "Friction not found" });
      }
      return { friction };
    },
  );

  /**
   * POST /api/frictions — capture an operator/agent/system friction.
   */
  app.post<{ Body: CaptureFrictionInput }>(
    "/api/frictions",
    async (req, reply) => {
      if (!frictions) {
        return reply
          .code(503)
          .send({ error: "Friction harness not configured" });
      }
      try {
        const friction = frictions.capture(req.body);
        return reply.code(201).send({ friction });
      } catch (error) {
        return reply.code(frictionErrorStatus(error)).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  /**
   * POST /api/frictions/:id/verdict — evaluate once and assign an owner.
   */
  app.post<{ Params: { id: string }; Body: EvaluateFrictionInput }>(
    "/api/frictions/:id/verdict",
    async (req, reply) => {
      if (!frictions) {
        return reply
          .code(503)
          .send({ error: "Friction harness not configured" });
      }
      try {
        const friction = frictions.evaluate(req.params.id, req.body);
        return { friction };
      } catch (error) {
        return reply.code(frictionErrorStatus(error)).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  /**
   * POST /api/frictions/:id/respond — assigned owner responds once.
   */
  app.post<{ Params: { id: string }; Body: RespondFrictionInput }>(
    "/api/frictions/:id/respond",
    async (req, reply) => {
      if (!frictions) {
        return reply
          .code(503)
          .send({ error: "Friction harness not configured" });
      }
      try {
        const friction = frictions.respond(req.params.id, req.body);
        return { friction };
      } catch (error) {
        return reply.code(frictionErrorStatus(error)).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}

/**
 * Map lifecycle conflicts and missing records without hiding validation failures.
 * @param error - Store error
 * @returns HTTP status for the route response
 */
function frictionErrorStatus(error: unknown): 400 | 404 | 409 {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Friction not found:")) return 404;
  if (
    message.startsWith("cannot ") ||
    message.startsWith("response must come from")
  ) {
    return 409;
  }
  return 400;
}
