import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket } from "ws";
import type { PlatformEvent, Thread } from "@mac/shared";
import { createFakeAgentProvider } from "./agents/fake-provider.js";
import { buildApp } from "./create-app.js";
import { createMemoryStore } from "./store/memory-store.js";

async function listen(agent = createFakeAgentProvider({ delayMs: 0 })) {
  const store = createMemoryStore();
  const app = await buildApp({ store, storeKind: "memory", agent });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  return { app, store, port: address.port };
}

function onceEvent(ws: WebSocket, type: PlatformEvent["type"], timeoutMs = 3000): Promise<PlatformEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const onMessage = (raw: WebSocket.RawData) => {
      const event = JSON.parse(String(raw)) as PlatformEvent | { type: string };
      if (event.type === type) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(event as PlatformEvent);
      }
    };
    ws.on("message", onMessage);
  });
}

test("REST thread CRUD + message append", async () => {
  const { app } = await listen();
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "t1" },
    });
    assert.equal(created.statusCode, 201);
    const { thread } = created.json() as { thread: Thread };

    const listed = await app.inject({ method: "GET", url: "/api/threads" });
    assert.equal(listed.statusCode, 200);
    assert.equal((listed.json() as { threads: Thread[] }).threads.length, 1);

    const msg = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/messages`,
      payload: { content: "hello" },
    });
    assert.equal(msg.statusCode, 201);

    const history = await app.inject({
      method: "GET",
      url: `/api/threads/${thread.id}/messages`,
    });
    assert.equal((history.json() as { messages: unknown[] }).messages.length, 1);
  } finally {
    await app.close();
  }
});

test("two WS clients see the same message.created", async () => {
  const { app, port } = await listen();
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "shared" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;

    const a = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}`);
    const b = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}`);
    await Promise.all([
      onceEvent(a, "thread.hydrated"),
      onceEvent(b, "thread.hydrated"),
    ]);

    const waitA = onceEvent(a, "message.created");
    const waitB = onceEvent(b, "message.created");
    await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages`,
      payload: { content: "ping" },
    });
    const [ea, eb] = await Promise.all([waitA, waitB]);
    assert.equal(ea.type, "message.created");
    assert.equal(eb.type, "message.created");
    if (ea.type === "message.created" && eb.type === "message.created") {
      assert.equal(ea.message.content, "ping");
      assert.equal(ea.message.id, eb.message.id);
    }
    a.close();
    b.close();
  } finally {
    await app.close();
  }
});

test("reconnect hydration restores history after disconnect", async () => {
  const { app, port } = await listen();
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "hydrate" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;

    await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages`,
      payload: { content: "before disconnect" },
    });

    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}`);
    const h1 = await onceEvent(ws1, "thread.hydrated");
    assert.equal(h1.type, "thread.hydrated");
    if (h1.type === "thread.hydrated") {
      assert.equal(h1.messages.length, 1);
      assert.equal(h1.messages[0]?.content, "before disconnect");
    }
    ws1.close();

    await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages`,
      payload: { content: "while away" },
    });

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}&afterSeq=0`);
    const h2 = await onceEvent(ws2, "thread.hydrated");
    assert.equal(h2.type, "thread.hydrated");
    if (h2.type === "thread.hydrated") {
      assert.equal(h2.messages.length, 2);
      assert.deepEqual(
        h2.messages.map((m) => m.content),
        ["before disconnect", "while away"],
      );
    }
    ws2.close();
  } finally {
    await app.close();
  }
});

test("stream-echo emits user message then assistant delta/completed", async () => {
  const { app, port } = await listen();
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "stream" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}`);
    await onceEvent(ws, "thread.hydrated");

    const seen: string[] = [];
    const deltas: string[] = [];
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("stream timeout")), 5000);
      ws.on("message", (raw) => {
        const event = JSON.parse(String(raw)) as PlatformEvent;
        seen.push(event.type);
        if (event.type === "message.created") {
          seen.push(`${event.message.role}:${event.message.status}`);
        }
        if (event.type === "message.delta") deltas.push(event.delta);
        if (event.type === "message.completed") {
          clearTimeout(timer);
          assert.equal(event.message.role, "assistant");
          assert.equal(event.message.content, "abcdefghi");
          assert.equal(event.message.status, "completed");
          resolve();
        }
      });
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/stream-echo`,
      payload: { content: "abcdefghi" },
    });
    assert.equal(res.statusCode, 202);
    const body = res.json() as {
      userMessage: { role: string; content: string };
      assistantMessage: { role: string; status: string };
    };
    assert.equal(body.userMessage.role, "user");
    assert.equal(body.userMessage.content, "abcdefghi");
    assert.equal(body.assistantMessage.role, "assistant");
    assert.equal(body.assistantMessage.status, "pending");

    await done;
    assert.ok(deltas.length >= 1);
    assert.equal(deltas.join(""), "abcdefghi");
    assert.ok(seen.includes("user:completed"));
    assert.ok(seen.includes("assistant:pending"));
    ws.close();
  } finally {
    await app.close();
  }
});

test("invoke streams fake agent reply into assistant bubble", async () => {
  const { app, port } = await listen(
    createFakeAgentProvider({ chunks: ["Hel", "lo"], delayMs: 0 }),
  );
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "invoke" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}`);
    await onceEvent(ws, "thread.hydrated");

    const deltas: string[] = [];
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("invoke timeout")), 5000);
      ws.on("message", (raw) => {
        const event = JSON.parse(String(raw)) as PlatformEvent;
        if (event.type === "message.delta") deltas.push(event.delta);
        if (event.type === "message.completed") {
          clearTimeout(timer);
          assert.equal(event.message.authorId, "fake");
          assert.equal(event.message.content, "Hello");
          resolve();
        }
      });
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "say hi" },
    });
    assert.equal(res.statusCode, 202);
    await done;
    assert.equal(deltas.join(""), "Hello");
    ws.close();
  } finally {
    await app.close();
  }
});

test("invoke surfaces provider failure as message.failed", async () => {
  const { app, port } = await listen(createFakeAgentProvider({ failWith: "provider crashed" }));
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "fail" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}`);
    await onceEvent(ws, "thread.hydrated");

    const failed = onceEvent(ws, "message.failed");
    const res = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "boom" },
    });
    assert.equal(res.statusCode, 202);
    const event = await failed;
    assert.equal(event.type, "message.failed");
    if (event.type === "message.failed") {
      assert.equal(event.error, "provider crashed");
      assert.equal(event.message.status, "failed");
    }
    ws.close();
  } finally {
    await app.close();
  }
});

test("invoke without agent returns 503", async () => {
  const store = createMemoryStore();
  const app = await buildApp({ store, storeKind: "memory" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "no-agent" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;
    const res = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "hi" },
    });
    assert.equal(res.statusCode, 503);
  } finally {
    await app.close();
  }
});
