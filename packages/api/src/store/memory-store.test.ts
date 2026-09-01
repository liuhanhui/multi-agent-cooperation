import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryStore } from "./memory-store.js";

test("createThread assigns id and zero lastSeq", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({ title: "demo" });
  assert.ok(thread.id.length > 0);
  assert.equal(thread.title, "demo");
  assert.equal(thread.status, "active");
  assert.equal(thread.lastSeq, 0);
});

test("appendMessage assigns monotonic seq and updates thread.lastSeq", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({});
  const a = await store.appendMessage({
    threadId: thread.id,
    role: "user",
    authorId: "op",
    content: "hi",
  });
  const b = await store.appendMessage({
    threadId: thread.id,
    role: "assistant",
    authorId: "bot",
    content: "hello",
    status: "streaming",
  });
  assert.equal(a.seq, 1);
  assert.equal(a.status, "completed");
  assert.equal(b.seq, 2);
  assert.equal(b.status, "streaming");
  const refreshed = await store.getThread(thread.id);
  assert.equal(refreshed?.lastSeq, 2);
});

test("listMessages afterSeq supports reconnect hydration gap fill", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({});
  await store.appendMessage({
    threadId: thread.id,
    role: "user",
    authorId: "op",
    content: "one",
  });
  await store.appendMessage({
    threadId: thread.id,
    role: "user",
    authorId: "op",
    content: "two",
  });
  await store.appendMessage({
    threadId: thread.id,
    role: "user",
    authorId: "op",
    content: "three",
  });
  const gap = await store.listMessages(thread.id, 1);
  assert.equal(gap.length, 2);
  assert.deepEqual(
    gap.map((m) => m.content),
    ["two", "three"],
  );
});

test("applyDelta then completeMessage follows streaming transitions", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({});
  const msg = await store.appendMessage({
    threadId: thread.id,
    role: "assistant",
    authorId: "bot",
    content: "",
    status: "pending",
  });
  const mid = await store.applyDelta(msg.id, "Hel");
  assert.equal(mid.status, "streaming");
  assert.equal(mid.content, "Hel");
  const done = await store.completeMessage(msg.id, "Hello");
  assert.equal(done.status, "completed");
  assert.equal(done.content, "Hello");
});

test("cannot applyDelta after completed (invariant)", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({});
  const msg = await store.appendMessage({
    threadId: thread.id,
    role: "user",
    authorId: "op",
    content: "done",
  });
  await assert.rejects(() => store.applyDelta(msg.id, "x"), /terminal|completed|failed/i);
});

test("appendMessage on missing thread fails", async () => {
  const store = createMemoryStore();
  await assert.rejects(
    () =>
      store.appendMessage({
        threadId: "missing",
        role: "user",
        authorId: "op",
        content: "x",
      }),
    /not found/i,
  );
});

test("crash recovery: new store handle reading exported snapshot sees same history", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({ title: "persist" });
  await store.appendMessage({
    threadId: thread.id,
    role: "user",
    authorId: "op",
    content: "remember me",
  });
  const snapshot = store.exportSnapshot();
  const recovered = createMemoryStore(snapshot);
  const messages = await recovered.listMessages(thread.id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.content, "remember me");
  assert.equal((await recovered.getThread(thread.id))?.lastSeq, 1);
});
