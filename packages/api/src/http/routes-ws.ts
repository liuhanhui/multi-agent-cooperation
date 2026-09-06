import type { FastifyInstance } from "fastify";
import type { PlatformEvent } from "@mac/shared";
import type { AppDeps } from "./deps.js";

/**
 * Register the WebSocket hydrate + subscribe endpoint (transport cell).
 * @param app - Fastify instance (must already have @fastify/websocket registered)
 * @param deps - store for hydrate snapshot; hub for live fan-out
 */
export function registerWsRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { store, hub } = deps;

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
}
