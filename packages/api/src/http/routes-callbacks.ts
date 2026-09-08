import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { InvocationCredential } from "@mac/shared";
import { parseBearerToken } from "../callback-auth/credential-store.js";
import type { AppDeps } from "./deps.js";

type RequestWithCredential = FastifyRequest & {
  invocationCredential?: InvocationCredential;
};

/**
 * Register agent→platform callback routes with credential prehandler (M10 + M13 bridge).
 * @param app - Fastify instance
 * @param deps - store/hub/credentials/tools
 */
export function registerCallbackRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { store, hub, credentials, tools } = deps;

  /**
   * Fastify preHandler: require valid Bearer invocation token.
   * @param req - Incoming request (Authorization header)
   * @param reply - Used to send 401 on failure
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
    (req as RequestWithCredential).invocationCredential = result.credential;
  }

  /**
   * Legacy alias → canonical thread.post_message tool (same executor; not a second semantic).
   * Body: { content, authorId? }
   */
  app.post<{
    Body: { content?: string; authorId?: string };
  }>(
    "/api/callbacks/invocation",
    { preHandler: requireInvocationCredential },
    async (req, reply) => {
      if (!credentials) return reply.code(503).send({ error: "Callback credentials not configured" });
      const credential = (req as RequestWithCredential).invocationCredential;
      if (!credential) {
        return reply.code(401).send({ error: "callback auth missing", code: "callback_auth_missing" });
      }

      // Prefer ToolRegistry when present so HTTP alias cannot diverge from MCP.
      if (tools) {
        const result = await tools.execute(
          "thread.post_message",
          {
            threadId: credential.threadId,
            catIds: credential.catIds,
            queueEntryId: credential.queueEntryId,
          },
          {
            content: req.body?.content ?? "",
            authorId: req.body?.authorId,
          },
        );
        if (!result.ok) {
          if (result.status === 401) {
            credentials.recordFailure("invalid", "/api/callbacks/invocation", result.error);
          }
          return reply.code(result.status).send({ error: result.error, code: result.code });
        }
        return reply.code(201).send({
          message: result.message,
          threadId: result.threadId,
          queueEntryId: credential.queueEntryId,
        });
      }

      // Fallback when tools not wired (should not happen in buildApp).
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
   * Callback bridge: non-Claude (and Claude) families invoke canonical tools by id.
   * Header x-mac-family optional — when set, must be in tool.annotations.families.
   */
  app.post<{
    Params: { toolId: string };
    Body: Record<string, unknown>;
  }>(
    "/api/callbacks/tools/:toolId",
    { preHandler: requireInvocationCredential },
    async (req, reply) => {
      if (!credentials) return reply.code(503).send({ error: "Callback credentials not configured" });
      if (!tools) return reply.code(503).send({ error: "Tool registry not configured" });

      const credential = (req as RequestWithCredential).invocationCredential;
      if (!credential) {
        return reply.code(401).send({ error: "callback auth missing", code: "callback_auth_missing" });
      }

      const familyHeader = req.headers["x-mac-family"];
      const family =
        typeof familyHeader === "string" && familyHeader.trim()
          ? familyHeader.trim()
          : undefined;

      const result = await tools.execute(
        req.params.toolId,
        {
          threadId: credential.threadId,
          catIds: credential.catIds,
          queueEntryId: credential.queueEntryId,
          family,
        },
        req.body ?? {},
      );

      if (!result.ok) {
        if (result.status === 401) {
          credentials.recordFailure(
            "invalid",
            `/api/callbacks/tools/${req.params.toolId}`,
            result.error,
          );
        }
        return reply.code(result.status).send({ error: result.error, code: result.code });
      }

      return reply.code(201).send({
        toolId: req.params.toolId,
        message: result.message,
        threadId: result.threadId,
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
export type { InvocationCredentialStore } from "../callback-auth/credential-store.js";
