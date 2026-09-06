import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeAgentProvider } from "../agents/fake-provider.js";
import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "../agents/types.js";
import { createMemoryStore } from "../store/memory-store.js";
import { ThreadHub } from "../ws/thread-hub.js";
import { InvocationDispatcher } from "./dispatcher.js";
import { reconcileOrphanMessages } from "./reconcile.js";
import { TurnExecutionStore } from "./turn-execution-store.js";

/**
 * Wait until a predicate is true or timeout.
 * @param pred - Condition
 * @param timeoutMs - Max wait
 */
async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
}

test("second invoke on busy thread is queued then runs after first completes", async () => {
  const store = createMemoryStore();
  const hub = new ThreadHub();
  const executions = new TurnExecutionStore();
  const agent = createFakeAgentProvider({ chunks: ["ok"], delayMs: 40 });
  const dispatcher = new InvocationDispatcher({ store, hub, agent, executions });

  const thread = await store.createThread({
    title: "q",
    memberIds: ["architect"],
    defaultCatId: "architect",
  });

  const first = dispatcher.enqueue({
    threadId: thread.id,
    prompt: "one",
    catIds: ["architect"],
    systemSnippetFor: () => "sys",
  });
  assert.equal(first.started, true);
  assert.equal(first.entry.status, "running");

  const second = dispatcher.enqueue({
    threadId: thread.id,
    prompt: "two",
    catIds: ["architect"],
    systemSnippetFor: () => "sys",
  });
  assert.equal(second.started, false);
  assert.equal(second.entry.status, "queued");

  await waitFor(() => dispatcher.getEntry(first.entry.id)?.status === "completed");
  await waitFor(() => dispatcher.getEntry(second.entry.id)?.status === "completed");

  const messages = await store.listMessages(thread.id);
  const users = messages.filter((m) => m.role === "user");
  assert.equal(users.length, 2);
  assert.equal(users[0]?.content, "one");
  assert.equal(users[1]?.content, "two");
});

test("cancel aborts a running invocation", async () => {
  const store = createMemoryStore();
  const hub = new ThreadHub();
  const executions = new TurnExecutionStore();

  const agent: AgentProvider = {
    id: "slow",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      yield { type: "delta", text: "x" };
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 2000);
        input.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });
      yield { type: "completed", text: "x" };
    },
  };

  const dispatcher = new InvocationDispatcher({ store, hub, agent, executions });
  const thread = await store.createThread({
    title: "cancel",
    memberIds: ["architect"],
    defaultCatId: "architect",
  });

  const { entry } = dispatcher.enqueue({
    threadId: thread.id,
    prompt: "long",
    catIds: ["architect"],
    systemSnippetFor: () => undefined,
  });
  assert.equal(entry.status, "running");

  await waitFor(() => executions.listTurnsByEntry(entry.id).some((t) => t.messageId));

  const cancelled = dispatcher.cancel(entry.id, "user cancel");
  assert.ok(cancelled);
  assert.ok(cancelled.cancelRequestedAt);

  await waitFor(() => dispatcher.getEntry(entry.id)?.status === "cancelled");

  const turns = dispatcher.listTurns(entry.id);
  assert.ok(turns.length >= 1);
  assert.ok(turns.every((t) => t.status === "cancelled" || t.status === "failed"));
});

test("reconcileOrphanMessages fails pending/streaming bubbles", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({ title: "orphan" });
  const pending = await store.appendMessage({
    threadId: thread.id,
    role: "assistant",
    authorId: "architect",
    content: "",
    status: "pending",
  });
  const streaming = await store.appendMessage({
    threadId: thread.id,
    role: "assistant",
    authorId: "architect",
    content: "hi",
    status: "pending",
  });
  await store.applyDelta(streaming.id, "!");

  const result = await reconcileOrphanMessages(store);
  assert.ok(result.recoveredIds.includes(pending.id));
  assert.ok(result.recoveredIds.includes(streaming.id));

  const p = await store.getMessage(pending.id);
  const s = await store.getMessage(streaming.id);
  assert.equal(p?.status, "failed");
  assert.equal(s?.status, "failed");
  assert.match(p?.error ?? "", /orphan-recovered/);
});

test("cancel queued entry without starting it", () => {
  const store = createMemoryStore();
  const hub = new ThreadHub();
  const executions = new TurnExecutionStore();
  const agent = createFakeAgentProvider({ delayMs: 100 });
  const dispatcher = new InvocationDispatcher({ store, hub, agent, executions });

  // Force busy by putting a fake running entry.
  executions.putEntry({
    id: "blocker",
    threadId: "t1",
    prompt: "x",
    catIds: ["architect"],
    authorId: "operator",
    status: "running",
    priority: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const { entry, started } = dispatcher.enqueue({
    threadId: "t1",
    prompt: "wait",
    catIds: ["architect"],
    systemSnippetFor: () => undefined,
  });
  assert.equal(started, false);
  assert.equal(entry.status, "queued");

  const cancelled = dispatcher.cancel(entry.id);
  assert.equal(cancelled?.status, "cancelled");
});
