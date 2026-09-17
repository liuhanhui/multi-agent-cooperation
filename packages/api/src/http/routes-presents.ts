import type { FastifyInstance } from "fastify";
import type { UpdatePresentPolicyInput } from "@mac/shared";
import type { AppDeps } from "./deps.js";

/**
 * Register M27 Present policy, activity, and bounded manual-tick routes.
 * @param app - Fastify application
 * @param deps - Must include PresentService when enabled
 * @returns Nothing
 */
export function registerPresentRoutes(
  app: FastifyInstance,
  deps: AppDeps,
): void {
  const { presents } = deps;

  app.get("/api/presents", async (_req, reply) => {
    if (!presents) {
      return reply.code(503).send({ error: "Present loop not configured" });
    }
    return presents.snapshot();
  });

  app.patch<{ Body: UpdatePresentPolicyInput }>(
    "/api/presents/policy",
    async (req, reply) => {
      if (!presents) {
        return reply.code(503).send({ error: "Present loop not configured" });
      }
      try {
        return presents.updatePolicy(req.body ?? {});
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.post<{
    Body: { threadId?: string };
  }>("/api/presents/tick", async (req, reply) => {
    if (!presents) {
      return reply.code(503).send({ error: "Present loop not configured" });
    }
    try {
      const result = await presents.tick({
        threadId: req.body?.threadId?.trim() || undefined,
      });
      return { result, snapshot: presents.snapshot() };
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
