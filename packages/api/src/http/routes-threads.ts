import type { FastifyInstance } from "fastify";
import type { HubBlockAction, PlatformEvent } from "@mac/shared";
import {
  applyHubBlockAction,
  validateContentBlocks,
} from "@mac/shared";
import type { AppDeps } from "./deps.js";

/**
 * Register thread + message REST routes (transport / identity / Hub actions).
 * @param app - Fastify instance
 * @param deps - store, hub, cats for membership validation
 */
export function registerThreadRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { store, hub, cats } = deps;

  app.get("/api/threads", async () => {
    const threads = await store.listThreads();
    return { threads };
  });

  app.post<{ Body: { title?: string; memberIds?: string[]; defaultCatId?: string | null } }>(
    "/api/threads",
    async (req, reply) => {
      const registryIds = cats?.list().map((c) => c.id) ?? [];
      const memberIds = req.body?.memberIds ?? registryIds;
      const defaultCatId =
        req.body?.defaultCatId !== undefined
          ? req.body.defaultCatId
          : (cats?.defaultCatId() ?? memberIds[0] ?? null);
      for (const id of memberIds) {
        if (cats && !cats.get(id)) {
          return reply.code(400).send({ error: `Unknown cat id: ${id}` });
        }
      }
      if (defaultCatId && cats && !cats.get(defaultCatId)) {
        return reply.code(400).send({ error: `Unknown defaultCatId: ${defaultCatId}` });
      }
      try {
        const thread = await store.createThread({
          title: req.body?.title,
          memberIds,
          defaultCatId,
        });
        return reply.code(201).send({ thread });
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  app.get<{ Params: { id: string } }>("/api/threads/:id", async (req, reply) => {
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    return { thread };
  });

  app.patch<{
    Params: { id: string };
    Body: { memberIds?: string[]; defaultCatId?: string | null };
  }>("/api/threads/:id/members", async (req, reply) => {
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const memberIds = req.body?.memberIds ?? thread.memberIds;
    const defaultCatId =
      req.body?.defaultCatId !== undefined ? req.body.defaultCatId : thread.defaultCatId;
    for (const id of memberIds) {
      if (cats && !cats.get(id)) {
        return reply.code(400).send({ error: `Unknown cat id: ${id}` });
      }
    }
    if (defaultCatId && cats && !cats.get(defaultCatId)) {
      return reply.code(400).send({ error: `Unknown defaultCatId: ${defaultCatId}` });
    }
    try {
      const updated = await store.updateThreadMembers({
        threadId: thread.id,
        memberIds,
        defaultCatId,
      });
      return { thread: updated };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { afterSeq?: string } }>(
    "/api/threads/:id/messages",
    async (req, reply) => {
      const thread = await store.getThread(req.params.id);
      if (!thread) return reply.code(404).send({ error: "Thread not found" });
      const afterSeq = Number(req.query.afterSeq ?? 0) || 0;
      const messages = await store.listMessages(req.params.id, afterSeq);
      return { messages };
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      content?: string;
      authorId?: string;
      role?: "user" | "assistant" | "system";
      blocks?: unknown;
    };
  }>("/api/threads/:id/messages", async (req, reply) => {
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const content = req.body?.content?.trim() ?? "";
    let blocks;
    try {
      blocks =
        req.body?.blocks !== undefined ? validateContentBlocks(req.body.blocks) : undefined;
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!content && !(blocks && blocks.length > 0)) {
      return reply.code(400).send({ error: "content or blocks required" });
    }
    const message = await store.appendMessage({
      threadId: thread.id,
      role: req.body?.role ?? "user",
      authorId: req.body?.authorId ?? "operator",
      content,
      status: "completed",
      blocks,
    });
    const event: PlatformEvent = { type: "message.created", message };
    hub.publish(thread.id, event);
    return reply.code(201).send({ message });
  });

  /**
   * Hub action callback: toggle checklist items / select decisions (M14 Done path).
   */
  app.post<{
    Params: { id: string; messageId: string };
    Body: HubBlockAction;
  }>("/api/threads/:id/messages/:messageId/actions", async (req, reply) => {
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const message = await store.getMessage(req.params.messageId);
    if (!message || message.threadId !== thread.id) {
      return reply.code(404).send({ error: "Message not found" });
    }
    if (!message.blocks?.length) {
      return reply.code(400).send({ error: "Message has no interactive blocks" });
    }
    const action = req.body;
    if (!action || typeof action !== "object" || !("type" in action)) {
      return reply.code(400).send({ error: "action body required" });
    }
    try {
      const nextBlocks = applyHubBlockAction(message.blocks, action);
      const updated = await store.updateMessageBlocks(message.id, nextBlocks);
      hub.publish(thread.id, { type: "message.updated", message: updated });
      return { message: updated };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
