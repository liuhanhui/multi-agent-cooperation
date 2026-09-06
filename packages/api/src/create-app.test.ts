import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket } from "ws";
import type { PlatformEvent, Thread } from "@mac/shared";
import { createFakeAgentProvider } from "./agents/fake-provider.js";
import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "./agents/types.js";
import { createCatRegistry } from "./cats/load-cat-config.js";
import { buildApp } from "./create-app.js";
import { createMemoryStore } from "./store/memory-store.js";

const demoCats = createCatRegistry([
  {
    id: "architect",
    displayName: "Architect",
    role: "architecture",
    provider: "fake",
    systemSnippet: "sys-architect",
  },
  {
    id: "reviewer",
    displayName: "Reviewer",
    role: "review",
    provider: "fake",
    systemSnippet: "sys-reviewer",
  },
]);

async function listen(agent = createFakeAgentProvider({ delayMs: 0 })) {
  const store = createMemoryStore();
  const app = await buildApp({ store, storeKind: "memory", agent, cats: demoCats });
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
          assert.equal(event.message.authorId, "architect");
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
  const app = await buildApp({ store, storeKind: "memory", cats: demoCats });
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

test("GET /api/cats lists registry", async () => {
  const { app } = await listen();
  try {
    const res = await app.inject({ method: "GET", url: "/api/cats" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { cats: { id: string }[] };
    assert.equal(body.cats.length, 2);
    assert.deepEqual(
      body.cats.map((c) => c.id),
      ["architect", "reviewer"],
    );
  } finally {
    await app.close();
  }
});

test("createThread seeds members from cat registry", async () => {
  const { app } = await listen();
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "with-cats" },
    });
    assert.equal(created.statusCode, 201);
    const thread = (created.json() as { thread: Thread }).thread;
    assert.deepEqual(thread.memberIds, ["architect", "reviewer"]);
    assert.equal(thread.defaultCatId, "architect");
  } finally {
    await app.close();
  }
});

test("switching defaultCatId changes next invoke systemSnippet and author", async () => {
  const calls: AgentInvokeInput[] = [];
  const agent: AgentProvider = {
    id: "fake",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      calls.push(input);
      yield { type: "completed", text: "ok" };
    },
  };
  const { app, port } = await listen(agent);
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "switch-default" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/threads/${threadId}/members`,
      payload: { defaultCatId: "reviewer" },
    });
    assert.equal(patched.statusCode, 200);
    assert.equal((patched.json() as { thread: Thread }).thread.defaultCatId, "reviewer");

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}`);
    await onceEvent(ws, "thread.hydrated");
    const completed = onceEvent(ws, "message.completed");
    const res = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "review please" },
    });
    assert.equal(res.statusCode, 202);
    const event = await completed;
    assert.equal(event.type, "message.completed");
    if (event.type === "message.completed") {
      assert.equal(event.message.authorId, "reviewer");
    }
    assert.equal(calls.at(-1)?.systemSnippet, "sys-reviewer");
    ws.close();
  } finally {
    await app.close();
  }
});

test("@mention routes to named cat only", async () => {
  const calls: AgentInvokeInput[] = [];
  const agent: AgentProvider = {
    id: "fake",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      calls.push(input);
      yield { type: "completed", text: `ok:${input.systemSnippet ?? ""}` };
    },
  };
  const { app, port } = await listen(agent);
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "mention-one" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}`);
    await onceEvent(ws, "thread.hydrated");

    const completed = onceEvent(ws, "message.completed");
    const res = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      // Default cat is architect; @reviewer must win.
      payload: { content: "@reviewer please check" },
    });
    assert.equal(res.statusCode, 202);
    const body = res.json() as { catIds: string[]; catId: string };
    assert.deepEqual(body.catIds, ["reviewer"]);
    assert.equal(body.catId, "reviewer");

    const event = await completed;
    assert.equal(event.type, "message.completed");
    if (event.type === "message.completed") {
      assert.equal(event.message.authorId, "reviewer");
    }
    assert.equal(calls.at(-1)?.systemSnippet, "sys-reviewer");
    assert.equal(calls.at(-1)?.prompt, "please check");
    ws.close();
  } finally {
    await app.close();
  }
});

test("@A @B invokes both cats serially with ordered authors", async () => {
  const calls: AgentInvokeInput[] = [];
  const agent: AgentProvider = {
    id: "fake",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      calls.push(input);
      // Tiny delay so serial ordering is observable if races appear.
      await new Promise((r) => setTimeout(r, 5));
      yield { type: "completed", text: `from:${input.systemSnippet ?? ""}` };
    },
  };
  const { app, port } = await listen(agent);
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "mention-multi" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?threadId=${threadId}`);
    await onceEvent(ws, "thread.hydrated");

    const authors: string[] = [];
    const bothDone = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("multi-mention timeout")), 5000);
      ws.on("message", (raw) => {
        const event = JSON.parse(String(raw)) as PlatformEvent;
        if (event.type === "message.completed" && event.message.role === "assistant") {
          authors.push(event.message.authorId);
          if (authors.length >= 2) {
            clearTimeout(timer);
            resolve();
          }
        }
      });
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "@architect @reviewer please design" },
    });
    assert.equal(res.statusCode, 202);
    const body = res.json() as { catIds: string[]; strategy: string };
    assert.deepEqual(body.catIds, ["architect", "reviewer"]);
    assert.equal(body.strategy, "serial");

    await bothDone;
    assert.deepEqual(authors, ["architect", "reviewer"]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.systemSnippet, "sys-architect");
    assert.equal(calls[1]?.systemSnippet, "sys-reviewer");
    assert.equal(calls[0]?.prompt, "please design");
    assert.equal(calls[1]?.prompt, "please design");
    ws.close();
  } finally {
    await app.close();
  }
});

test("unknown @mention returns 400", async () => {
  const { app } = await listen();
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "bad-mention" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;
    const res = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "@ghost hello" },
    });
    assert.equal(res.statusCode, 400);
    assert.match(String((res.json() as { error: string }).error), /unknown/i);
  } finally {
    await app.close();
  }
});

test("busy thread queues second invoke then drains FIFO", async () => {
  const agent = createFakeAgentProvider({ chunks: ["ok"], delayMs: 50 });
  const { app } = await listen(agent);
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "queue" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;

    const first = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "first" },
    });
    assert.equal(first.statusCode, 202);
    const firstBody = first.json() as { queueEntryId: string; started: boolean; status: string };
    assert.equal(firstBody.started, true);
    assert.equal(firstBody.status, "running");

    const second = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "second" },
    });
    assert.equal(second.statusCode, 202);
    const secondBody = second.json() as { queueEntryId: string; started: boolean; status: string };
    assert.equal(secondBody.started, false);
    assert.equal(secondBody.status, "queued");

    // Poll until both invocations complete.
    const deadline = Date.now() + 5000;
    let statuses: string[] = [];
    while (Date.now() < deadline) {
      const listed = await app.inject({
        method: "GET",
        url: `/api/threads/${threadId}/invocations`,
      });
      const entries = (listed.json() as { entries: { id: string; status: string; prompt: string }[] })
        .entries;
      const a = entries.find((e) => e.id === firstBody.queueEntryId);
      const b = entries.find((e) => e.id === secondBody.queueEntryId);
      statuses = [a?.status ?? "", b?.status ?? ""];
      if (statuses[0] === "completed" && statuses[1] === "completed") break;
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.deepEqual(statuses, ["completed", "completed"]);
  } finally {
    await app.close();
  }
});

test("cancel running invocation stops the agent turn", async () => {
  const agent: AgentProvider = {
    id: "slow",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      yield { type: "delta", text: "x" };
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 5000);
        input.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });
      yield { type: "completed", text: "x" };
    },
  };
  const { app } = await listen(agent);
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "cancel-http" },
    });
    const threadId = (created.json() as { thread: Thread }).thread.id;

    const invoked = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "long job" },
    });
    assert.equal(invoked.statusCode, 202);
    const queueEntryId = (invoked.json() as { queueEntryId: string }).queueEntryId;

    // Wait until a turn row exists (agent has started).
    const deadlineStart = Date.now() + 3000;
    while (Date.now() < deadlineStart) {
      const got = await app.inject({
        method: "GET",
        url: `/api/threads/${threadId}/invocations/${queueEntryId}`,
      });
      const turns = (got.json() as { turns: { messageId: string | null }[] }).turns;
      if (turns.some((t) => t.messageId)) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/invocations/${queueEntryId}/cancel`,
      payload: { reason: "stop" },
    });
    assert.equal(cancelled.statusCode, 200);

    const deadline = Date.now() + 5000;
    let status = "running";
    while (Date.now() < deadline) {
      const got = await app.inject({
        method: "GET",
        url: `/api/threads/${threadId}/invocations/${queueEntryId}`,
      });
      status = (got.json() as { entry: { status: string } }).entry.status;
      if (status === "cancelled") break;
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.equal(status, "cancelled");
  } finally {
    await app.close();
  }
});
