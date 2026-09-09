import type { FastifyInstance } from "fastify";
import type { EvidenceProvenance } from "@mac/shared";
import { retrieveEvidenceForPrompt } from "../memory/retrieve-evidence.js";
import type { AppDeps } from "./deps.js";

/**
 * Register evidence write/search routes (M16 memory cell).
 * Static paths (`/search`, `/retrieve`) register before `/:id`.
 * @param app - Fastify instance
 * @param deps - Must include evidence store when enabled
 */
export function registerEvidenceRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { evidence } = deps;

  app.get("/api/evidence", async (req, reply) => {
    if (!evidence) return reply.code(503).send({ error: "Evidence store not configured" });
    const limitRaw = (req.query as { limit?: string }).limit;
    const limit = limitRaw ? Number(limitRaw) : 50;
    return { evidence: evidence.list(Number.isFinite(limit) ? limit : 50) };
  });

  app.get("/api/evidence/search", async (req, reply) => {
    if (!evidence) return reply.code(503).send({ error: "Evidence store not configured" });
    const q = String((req.query as { q?: string }).q ?? "").trim();
    if (!q) return reply.code(400).send({ error: "q required" });
    const limitRaw = (req.query as { limit?: string }).limit;
    const limit = limitRaw ? Number(limitRaw) : 8;
    const hits = evidence.search(q, Number.isFinite(limit) ? limit : 8);
    return { query: q, hits };
  });

  /**
   * Preview retrieval + injection for a cue (Hub / debugging).
   */
  app.post<{ Body: { prompt?: string; budgetTokens?: number } }>(
    "/api/evidence/retrieve",
    async (req, reply) => {
      if (!evidence) return reply.code(503).send({ error: "Evidence store not configured" });
      const prompt = req.body?.prompt?.trim() ?? "";
      if (!prompt) return reply.code(400).send({ error: "prompt required" });
      const result = retrieveEvidenceForPrompt(evidence, prompt, {
        budgetTokens: req.body?.budgetTokens,
      });
      return { retrieval: result };
    },
  );

  app.get<{ Params: { id: string } }>("/api/evidence/:id", async (req, reply) => {
    if (!evidence) return reply.code(503).send({ error: "Evidence store not configured" });
    const row = evidence.get(req.params.id);
    if (!row) return reply.code(404).send({ error: "Evidence not found" });
    return { evidence: row };
  });

  app.post<{
    Body: {
      title?: string;
      body?: string;
      tags?: string[];
      provenance?: EvidenceProvenance;
    };
  }>("/api/evidence", async (req, reply) => {
    if (!evidence) return reply.code(503).send({ error: "Evidence store not configured" });
    const title = req.body?.title?.trim() ?? "";
    const body = req.body?.body?.trim() ?? "";
    if (!title) return reply.code(400).send({ error: "title required" });
    if (!body) return reply.code(400).send({ error: "body required" });
    if (!req.body?.provenance?.source?.trim()) {
      return reply.code(400).send({ error: "provenance.source required" });
    }
    try {
      const row = evidence.create({
        title,
        body,
        tags: req.body.tags,
        provenance: req.body.provenance,
      });
      return reply.code(201).send({ evidence: row });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
