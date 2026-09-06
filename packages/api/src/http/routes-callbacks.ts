import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { InvocationCredentialStore } from "../callback-auth/credential-store.js";
import { parseBearerToken } from "../callback-auth/credential-store.js";
import type { AppDeps } from "./deps.js";

/**
 * Register agent→platform callback routes with credential prehandler (M10).
 * @param app - Fastify instance
 * @param deps - store/hub/credentials
 */
export function registerCallbackRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { store, hub, credentials } = deps;

  /**
   * Fastify preHandler: require valid Bearer invocation token.
   * @param req - Incoming request (Authorization header)
   * @param reply - Used to send 401 on failure
   * @returns void; attaches credential on req when ok
   */
  async function requireInvocationCredential(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!credentials) {
      await reply.code(503).send({ error: "Callback credentials not configured" });
      return;
    }
    const token = parseBearerToken(req.headers.authorization);
    const path = req.url.split("?")[0] ?? req.url;
    const result = credentials.verify(token);
    if (!result.ok) {
      credentials.recordFailure(result.reason, path, result.detail);
      await reply.code(401).send({
        error: `callback auth ${result.reason}`,
        code: `callback_auth_${result.reason}`,
        detail: result.detail,
      });
      return;
    }
    (req as FastifyRequest & { invocationCredential?: typeof result.credential }).invocationCredential =
      result.credential;
  }

  /**
   * Agent callback: append a completed message into the credential's thread.
   * Body: { content, authorId? } — authorId must be in credential.catIds when provided.
   */
  app.post<{
    Body: { content?: string; authorId?: string };
  }>(
    "/api/callbacks/invocation",
    { preHandler: requireInvocationCredential },
    async (req, reply) => {
      if (!credentials) return reply.code(503).send({ error: "Callback credentials not configured" });
      const credential = (
        req as FastifyRequest & {
          invocationCredential?: {
            threadId: string;
            catIds: string[];
            queueEntryId: string;
          };
        }
      ).invocationCredential;
      if (!credential) {
        return reply.code(401).send({ error: "callback auth missing", code: "callback_auth_missing" });
      }

      const content = req.body?.content?.trim() ?? "";
      if (!content) return reply.code(400).send({ error: "content required" });

      const authorId = req.body?.authorId?.trim() || credential.catIds[0] || "agent";
      if (credential.catIds.length > 0 && !credential.catIds.includes(authorId)) {
        credentials.recordFailure(
          "invalid",
          "/api/callbacks/invocation",
          `authorId ${authorId} not in credential.catIds`,
        );
        return reply.code(401).send({
          error: "callback auth invalid author",
          code: "callback_auth_invalid",
        });
      }

      const thread = await store.getThread(credential.threadId);
      if (!thread) return reply.code(404).send({ error: "Thread not found for credential" });

      const message = await store.appendMessage({
        threadId: credential.threadId,
        role: "assistant",
        authorId,
        content,
        status: "completed",
      });
      hub.publish(credential.threadId, { type: "message.created", message });
      hub.publish(credential.threadId, { type: "message.completed", message });

      return reply.code(201).send({
        message,
        threadId: credential.threadId,
        queueEntryId: credential.queueEntryId,
      });
    },
  );

  /**
   * Operator-visible auth denial telemetry (newest last).
   */
  app.get("/api/callbacks/auth-failures", async (_req, reply) => {
    if (!credentials) return reply.code(503).send({ error: "Callback credentials not configured" });
    return { failures: credentials.listFailures() };
  });
}

/**
 * Expose credentials store type for AppDeps without circular imports in routes.
 */
export type { InvocationCredentialStore };
