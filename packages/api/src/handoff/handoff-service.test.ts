import assert from "node:assert/strict";
import { test } from "node:test";
import type { Handoff } from "@mac/shared";
import { createFakeAgentProvider } from "../agents/fake-provider.js";
import { InvocationDispatcher } from "../dispatch/dispatcher.js";
import { TurnExecutionStore } from "../dispatch/turn-execution-store.js";
import { createMemoryStore } from "../store/memory-store.js";
import { ThreadHub } from "../ws/thread-hub.js";
import { HandoffService } from "./handoff-service.js";
import { HandoffStore } from "./handoff-store.js";

async function waitFor(pred: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
}

test("explicit handoff delivers structured message and ack receipt", async () => {
  const store = createMemoryStore();
  const hub = new ThreadHub();
  const thread = await store.createThread({
    title: "h",
    memberIds: ["architect", "reviewer"],
    defaultCatId: "architect",
  });

  const service = new HandoffService({
    store,
    hub,
    handoffs: new HandoffStore(),
  });

  const handoff = await service.createAndDeliver({
    threadId: thread.id,
    fromCatId: "architect",
    toCatId: "reviewer",
    payload: {
      what: "API v1",
      why: "need holes punched",
      tradeoff: "thin vs complete",
      open: "auth",
      next: "review",
    },
    triggerReview: false,
  });

  assert.equal(handoff.status, "delivered");
  assert.ok(handoff.deliveryMessageId);

  const msg = await store.getMessage(handoff.deliveryMessageId!);
  assert.equal(msg?.role, "system");
  assert.match(msg?.content ?? "", /"what": "API v1"/);

  const acked = service.ack(handoff.id, "reviewer");
  assert.equal(acked?.status, "acked");
  assert.equal(acked?.receipt?.status, "received");
  assert.equal(acked?.receipt?.byCatId, "reviewer");
});

test("triggerReview enqueues reviewer with structured prompt", async () => {
  const store = createMemoryStore();
  const hub = new ThreadHub();
  const executions = new TurnExecutionStore();
  const agent = createFakeAgentProvider({ chunks: ["LGTM"], delayMs: 0 });
  const dispatcher = new InvocationDispatcher({ store, hub, agent, executions });
  const handoffs = new HandoffService({
    store,
    hub,
    handoffs: new HandoffStore(),
    dispatcher,
  });
  dispatcher.attachHandoffs(handoffs);

  const thread = await store.createThread({
    title: "review",
    memberIds: ["architect", "reviewer"],
    defaultCatId: "architect",
  });

  const handoff = await handoffs.createAndDeliver({
    threadId: thread.id,
    fromCatId: "architect",
    toCatId: "reviewer",
    payload: {
      what: "design",
      why: "ship",
      tradeoff: "n/a",
      open: "none",
      next: "review please",
    },
    triggerReview: true,
    systemSnippetFor: () => "sys-reviewer",
  });

  assert.equal(handoff.status, "acked");
  assert.equal(handoff.receipt?.status, "received");
  assert.ok(handoff.reviewQueueEntryId);

  await waitFor(() => dispatcher.getEntry(handoff.reviewQueueEntryId!)?.status === "completed");

  const messages = await store.listMessages(thread.id);
  const reviewUser = messages.find((m) => m.role === "user" && m.authorId === "handoff");
  assert.ok(reviewUser);
  assert.match(reviewUser.content, /## What\ndesign/);
  assert.match(reviewUser.content, /## Next\nreview please/);
});

test("autoReview after producer completes creates handoff for B", async () => {
  const store = createMemoryStore();
  const hub = new ThreadHub();
  const executions = new TurnExecutionStore();
  const agent = createFakeAgentProvider({ chunks: ["Plan A"], delayMs: 0 });
  const dispatcher = new InvocationDispatcher({ store, hub, agent, executions });
  const handoffStore = new HandoffStore();
  const handoffs = new HandoffService({ store, hub, handoffs: handoffStore, dispatcher });
  dispatcher.attachHandoffs(handoffs);

  const thread = await store.createThread({
    title: "auto",
    memberIds: ["architect", "reviewer"],
    defaultCatId: "architect",
  });

  const { entry } = dispatcher.enqueue({
    threadId: thread.id,
    prompt: "design it",
    catIds: ["architect"],
    autoReview: { toCatId: "reviewer" },
    systemSnippetFor: (id) => (id === "reviewer" ? "sys-r" : "sys-a"),
  });

  await waitFor(() => dispatcher.getEntry(entry.id)?.status === "completed");
  await waitFor(() => handoffStore.listByThread(thread.id).length >= 1);

  const list = handoffStore.listByThread(thread.id);
  assert.equal(list.length, 1);
  const h = list[0] as Handoff;
  assert.equal(h.fromCatId, "architect");
  assert.equal(h.toCatId, "reviewer");
  assert.equal(h.payload.what, "Plan A");
  assert.equal(h.receipt?.status, "received");
  assert.ok(h.reviewQueueEntryId);

  await waitFor(() => dispatcher.getEntry(h.reviewQueueEntryId!)?.status === "completed");
});
