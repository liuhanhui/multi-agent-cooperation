import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@mac/shared";
import { bubbleReducer } from "./bubble-reducer.js";

function msg(partial: Partial<Message> & Pick<Message, "id" | "seq">): Message {
  return {
    threadId: "t1",
    role: "assistant",
    authorId: "architect",
    content: "",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("hydrate replaces state and keeps stable ids", () => {
  const a = msg({ id: "m1", seq: 1, content: "hi", status: "completed", role: "user" });
  const b = msg({ id: "m2", seq: 2, content: "yo", status: "completed" });
  const state = bubbleReducer([], { type: "hydrated", messages: [b, a] });
  assert.deepEqual(
    state.map((m) => m.id),
    ["m1", "m2"],
  );
});

test("delta merges into same message id without creating a second bubble", () => {
  let state = bubbleReducer([], {
    type: "event",
    event: { type: "message.created", message: msg({ id: "m1", seq: 1, status: "pending" }) },
  });
  state = bubbleReducer(state, {
    type: "event",
    event: {
      type: "message.delta",
      messageId: "m1",
      threadId: "t1",
      seq: 1,
      delta: "Hel",
    },
  });
  state = bubbleReducer(state, {
    type: "event",
    event: {
      type: "message.delta",
      messageId: "m1",
      threadId: "t1",
      seq: 1,
      delta: "lo",
    },
  });
  assert.equal(state.length, 1);
  assert.equal(state[0]?.id, "m1");
  assert.equal(state[0]?.content, "Hello");
  assert.equal(state[0]?.status, "streaming");
});

test("completed updates same id (no jitter / duplicate)", () => {
  let state = bubbleReducer([], {
    type: "event",
    event: {
      type: "message.created",
      message: msg({ id: "m1", seq: 1, content: "Hel", status: "streaming" }),
    },
  });
  state = bubbleReducer(state, {
    type: "event",
    event: {
      type: "message.completed",
      message: msg({ id: "m1", seq: 1, content: "Hello", status: "completed" }),
    },
  });
  assert.equal(state.length, 1);
  assert.equal(state[0]?.id, "m1");
  assert.equal(state[0]?.content, "Hello");
  assert.equal(state[0]?.status, "completed");
});

test("reset clears bubbles", () => {
  const state = bubbleReducer([msg({ id: "m1", seq: 1 })], { type: "reset" });
  assert.deepEqual(state, []);
});
