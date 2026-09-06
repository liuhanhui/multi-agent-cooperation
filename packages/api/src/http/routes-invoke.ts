import type { FastifyInstance } from "fastify";
import type { MentionRoutingStrategy } from "@mac/shared";
import { runRoutedInvocation } from "../agents/run-invocation.js";
import { resolveMentionRoute } from "../routing/resolve-route.js";
import { chunkText } from "./chunk-text.js";
import type { AppDeps } from "./deps.js";

/**
 * Register invoke + stream-echo routes (routing-context + cli-integration entry).
 * @param app - Fastify instance
 * @param deps - store/hub/agent/cats for routed invocation
 */
export function registerInvokeRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { store, hub, agent, cats } = deps;

  /**
   * Invoke one or more cats via @mention routing (M07).
   * Body.content may include a leading `@A @B …` run; server parses targets.
   * Without mentions, uses body.catId then thread.defaultCatId.
   */
  app.post<{
    Params: { id: string };
    Body: {
      content?: string;
      authorId?: string;
      systemSnippet?: string;
      /** Legacy single-target hint when content has no leading mentions. */
      catId?: string;
      strategy?: MentionRoutingStrategy;
    };
  }>("/api/threads/:id/messages/invoke", async (req, reply) => {
    if (!agent) return reply.code(503).send({ error: "No agent provider configured" });
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const content = req.body?.content?.trim() ?? "";
    if (!content) return reply.code(400).send({ error: "content required" });

    // Registry list is required for @token resolution; empty → default/explicit only.
    const catList = cats?.list() ?? [];
    const route = resolveMentionRoute({
      content,
      thread,
      cats: catList,
      explicitCatId: req.body?.catId,
      strategy: req.body?.strategy ?? "serial",
    });
    if (!route.ok) {
      return reply.code(400).send({ error: route.error });
    }

    const result = await runRoutedInvocation({
      store,
      hub,
      agent,
      threadId: thread.id,
      prompt: route.prompt,
      catIds: route.catIds,
      authorId: req.body?.authorId ?? "operator",
      systemSnippetFor: (catId) =>
        // Body systemSnippet is a single-target escape hatch; multi-target uses each cat's snippet.
        (route.catIds.length === 1 ? req.body?.systemSnippet : undefined) ??
        cats?.get(catId)?.systemSnippet,
    });

    return reply.code(202).send({
      userMessage: result.userMessage,
      // Back-compat for M04/M05 clients that read a single assistantMessage.
      assistantMessage: result.assistantMessages[0],
      assistantMessages: result.assistantMessages,
      catIds: result.catIds,
      catId: result.catIds[0],
      strategy: route.strategy,
    });
  });

  /**
   * Demo stream without an agent adapter:
   * 1) append the operator message
   * 2) stream an assistant echo via message.delta → message.completed
   */
  app.post<{
    Params: { id: string };
    Body: { content?: string; authorId?: string };
  }>("/api/threads/:id/messages/stream-echo", async (req, reply) => {
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const content = req.body?.content?.trim() ?? "";
    if (!content) return reply.code(400).send({ error: "content required" });

    const userMessage = await store.appendMessage({
      threadId: thread.id,
      role: "user",
      authorId: req.body?.authorId ?? "operator",
      content,
      status: "completed",
    });
    hub.publish(thread.id, { type: "message.created", message: userMessage });

    const assistantMessage = await store.appendMessage({
      threadId: thread.id,
      role: "assistant",
      authorId: "echo",
      content: "",
      status: "pending",
    });
    hub.publish(thread.id, { type: "message.created", message: assistantMessage });

    void (async () => {
      try {
        for (const delta of chunkText(content)) {
          const updated = await store.applyDelta(assistantMessage.id, delta);
          hub.publish(thread.id, {
            type: "message.delta",
            messageId: updated.id,
            threadId: thread.id,
            seq: updated.seq,
            delta,
          });
          await new Promise((r) => setTimeout(r, 60));
        }
        const completed = await store.completeMessage(assistantMessage.id);
        hub.publish(thread.id, { type: "message.completed", message: completed });
      } catch (err) {
        const failed = await store.failMessage(
          assistantMessage.id,
          err instanceof Error ? err.message : String(err),
        );
        hub.publish(thread.id, {
          type: "message.failed",
          message: failed,
          error: failed.error ?? "stream failed",
        });
      }
    })();

    return reply.code(202).send({ userMessage, assistantMessage });
  });
}
