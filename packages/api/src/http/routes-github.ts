import type { FastifyInstance, FastifyRequest } from "fastify";
import type { GithubResourceRef } from "@mac/shared";
import type { AppDeps } from "./deps.js";
import { verifyGithubSignature } from "../github/verify-signature.js";

type ReqWithRaw = FastifyRequest & { rawBody?: Buffer };

/**
 * Register GitHub binding + webhook routes (M22).
 * @param app - Fastify instance
 * @param deps - bindings + github router (+ custody/store/hub)
 */
export function registerGithubRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { githubBindings, githubSignals } = deps;

  /**
   * GET /api/github/bindings — list thread↔PR/issue bindings.
   */
  app.get("/api/github/bindings", async (req, reply) => {
    if (!githubBindings) {
      return reply.code(503).send({ error: "GitHub bindings not configured" });
    }
    const q = req.query as { threadId?: string; limit?: string };
    if (q.threadId?.trim()) {
      return { bindings: githubBindings.listByThread(q.threadId) };
    }
    const limit = q.limit ? Number(q.limit) : 40;
    return { bindings: githubBindings.list(Number.isFinite(limit) ? limit : 40) };
  });

  /**
   * POST /api/github/bindings — bind active thread to a PR/issue (+ optional await).
   */
  app.post<{
    Body: {
      threadId?: string;
      ref?: GithubResourceRef;
      awaitId?: string | null;
    };
  }>("/api/github/bindings", async (req, reply) => {
    if (!githubBindings) {
      return reply.code(503).send({ error: "GitHub bindings not configured" });
    }
    const threadId = req.body?.threadId?.trim() ?? "";
    if (!threadId) return reply.code(400).send({ error: "threadId required" });
    if (!req.body?.ref) return reply.code(400).send({ error: "ref required" });
    try {
      const binding = githubBindings.bind({
        threadId,
        ref: req.body.ref,
        awaitId: req.body.awaitId,
      });
      return reply.code(201).send({ binding });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /api/github/signals/simulate — Hub/dev ingress without GitHub HMAC.
   * Uses the same ConnectorRouter path as the real webhook.
   */
  app.post<{
    Body: {
      event?: string;
      action?: string | null;
      ref?: GithubResourceRef;
      summary?: string;
      deliveryId?: string;
    };
  }>("/api/github/signals/simulate", async (req, reply) => {
    if (!githubSignals) {
      return reply.code(503).send({ error: "GitHub signals not configured" });
    }
    if (!req.body?.ref) return reply.code(400).send({ error: "ref required" });
    if (!req.body?.event?.trim()) {
      return reply.code(400).send({ error: "event required" });
    }
    try {
      const result = await githubSignals.handleSimulated({
        event: req.body.event.trim(),
        action: req.body.action ?? null,
        ref: req.body.ref,
        summary: req.body.summary,
        deliveryId: req.body.deliveryId,
      });
      return { result };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Scoped parser so only the webhook sees raw bytes for HMAC (GitHub signs the body).
  void app.register(async (scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (req, body, done) => {
        const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
        (req as ReqWithRaw).rawBody = buf;
        try {
          const json = JSON.parse(buf.toString("utf8")) as unknown;
          done(null, json);
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

    /**
     * POST /webhooks/github — inbound GitHub App/webhook (HMAC required).
     */
    scope.post("/webhooks/github", async (req, reply) => {
      if (!githubSignals) {
        return reply.code(503).send({ error: "GitHub signals not configured" });
      }
      const secret = process.env.MAC_GITHUB_WEBHOOK_SECRET ?? "";
      const signature = req.headers["x-hub-signature-256"];
      const raw = (req as ReqWithRaw).rawBody;
      if (!raw) {
        return reply.code(400).send({ error: "raw body required for signature verify" });
      }
      const sigHeader = Array.isArray(signature) ? signature[0] : signature;
      if (!verifyGithubSignature(raw, sigHeader, secret)) {
        return reply.code(401).send({ error: "invalid GitHub signature" });
      }

      const eventHeader = req.headers["x-github-event"];
      const deliveryHeader = req.headers["x-github-delivery"];
      const event = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader;
      const delivery = Array.isArray(deliveryHeader)
        ? deliveryHeader[0]
        : deliveryHeader;
      if (!event) return reply.code(400).send({ error: "X-GitHub-Event required" });

      const body =
        req.body && typeof req.body === "object"
          ? (req.body as Record<string, unknown>)
          : {};
      try {
        const result = await githubSignals.handleWebhook(
          event,
          delivery ?? "",
          body,
        );
        return { result };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  });
}
