import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { HealthResponse, PlatformEvent } from "@mac/shared";
import type { AgentProvider } from "./agents/types.js";
import { runInvocation } from "./agents/run-invocation.js";
import type { CatRegistry } from "./cats/load-cat-config.js";
import type { MacStore } from "./store/types.js";
import { ThreadHub } from "./ws/thread-hub.js";

export interface AppOptions {
  store: MacStore;
  storeKind: "memory" | "redis";
  version?: string;
  agent?: AgentProvider;
  cats?: CatRegistry;
}

function chunkText(text: string, size = 3): string[] {
  if (!text) return [""];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const hub = new ThreadHub();
  const version = opts.version ?? "0.0.1";
  const { store } = opts;
  const agent = opts.agent;
  const cats = opts.cats;

  await app.register(websocket);

  app.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    service: "mac-api",
    version,
    store: opts.storeKind,
    timestamp: new Date().toISOString(),
    ...(agent ? { agent: agent.id } : {}),
  }));

  app.get("/", async () => ({
    name: "multi-agent-cooperation",
    docs: ["docs/VISION.md", "build-plan.md"],
    health: "/health",
    api: {
      threads: "/api/threads",
      cats: "/api/cats",
      invoke: "/api/threads/:id/messages/invoke",
      ws: "/ws?threadId=",
    },
  }));

  app.get("/api/cats", async () => {
    return { cats: cats?.list() ?? [] };
  });

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
    Body: { content?: string; authorId?: string; role?: "user" | "assistant" | "system" };
  }>("/api/threads/:id/messages", async (req, reply) => {
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const content = req.body?.content?.trim() ?? "";
    if (!content) return reply.code(400).send({ error: "content required" });
    const message = await store.appendMessage({
      threadId: thread.id,
      role: req.body?.role ?? "user",
      authorId: req.body?.authorId ?? "operator",
      content,
      status: "completed",
    });
    const event: PlatformEvent = { type: "message.created", message };
    hub.publish(thread.id, event);
    return reply.code(201).send({ message });
  });

  /** Invoke the configured AgentProvider and stream assistant output over WS. */
  app.post<{
    Params: { id: string };
    Body: { content?: string; authorId?: string; systemSnippet?: string; catId?: string };
  }>("/api/threads/:id/messages/invoke", async (req, reply) => {
    if (!agent) return reply.code(503).send({ error: "No agent provider configured" });
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const content = req.body?.content?.trim() ?? "";
    if (!content) return reply.code(400).send({ error: "content required" });

    const catId = req.body?.catId ?? thread.defaultCatId;
    if (!catId) {
      return reply.code(400).send({ error: "No default cat configured for this thread" });
    }
    if (thread.memberIds.length > 0 && !thread.memberIds.includes(catId)) {
      return reply.code(400).send({ error: `Cat ${catId} is not a member of this thread` });
    }
    const cat = cats?.get(catId);
    if (cats && !cat) {
      return reply.code(400).send({ error: `Unknown cat id: ${catId}` });
    }

    const result = await runInvocation({
      store,
      hub,
      agent,
      threadId: thread.id,
      prompt: content,
      authorId: req.body?.authorId ?? "operator",
      assistantAuthorId: catId,
      systemSnippet: req.body?.systemSnippet ?? cat?.systemSnippet,
    });
    return reply.code(202).send({ ...result, catId });
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

  app.get<{ Querystring: { threadId?: string; afterSeq?: string } }>(
    "/ws",
    { websocket: true },
    async (socket, req) => {
      const threadId = req.query.threadId;
      if (!threadId) {
        socket.send(JSON.stringify({ type: "error", error: "threadId required" }));
        socket.close();
        return;
      }
      const thread = await store.getThread(threadId);
      if (!thread) {
        socket.send(JSON.stringify({ type: "error", error: "Thread not found" }));
        socket.close();
        return;
      }
      const afterSeq = Number(req.query.afterSeq ?? 0) || 0;
      const messages = await store.listMessages(threadId, afterSeq);
      const hydrated: PlatformEvent = {
        type: "thread.hydrated",
        threadId,
        thread,
        messages,
        serverTime: new Date().toISOString(),
      };
      socket.send(JSON.stringify(hydrated));
      hub.subscribe(threadId, socket, afterSeq);
    },
  );

  return app;
}
