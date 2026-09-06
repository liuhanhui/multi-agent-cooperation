import type { FastifyInstance } from "fastify";
import type { AppDeps } from "./deps.js";

/**
 * Register Hub browse routes for the skills catalog (M12).
 * @param app - Fastify instance
 * @param deps - Must include skills registry when skills are enabled
 */
export function registerSkillRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { skills } = deps;

  app.get("/api/skills", async (_req, reply) => {
    if (!skills) {
      return reply.code(503).send({ error: "Skills registry not configured" });
    }
    return {
      tokenBudget: skills.tokenBudget,
      skills: skills.list(),
    };
  });

  app.get<{ Params: { id: string } }>("/api/skills/:id", async (req, reply) => {
    if (!skills) {
      return reply.code(503).send({ error: "Skills registry not configured" });
    }
    const skill = skills.get(req.params.id);
    if (!skill) return reply.code(404).send({ error: "Skill not found" });
    return { skill };
  });
}
