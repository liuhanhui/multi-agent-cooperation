import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractClaudeAssistantText,
  extractClaudeDelta,
  extractClaudeResultText,
} from "./claude-stream-parse.js";
import { createFakeAgentProvider } from "./fake-provider.js";

test("extractClaudeDelta reads text_delta from stream_event", () => {
  const line = JSON.stringify({
    type: "stream_event",
    event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } },
  });
  assert.equal(extractClaudeDelta(line), "Hi");
});

test("extractClaudeResultText reads result payload", () => {
  const line = JSON.stringify({ type: "result", result: "done" });
  assert.equal(extractClaudeResultText(line), "done");
});

test("extractClaudeAssistantText joins text blocks", () => {
  const line = JSON.stringify({
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "A" },
        { type: "text", text: "B" },
      ],
    },
  });
  assert.equal(extractClaudeAssistantText(line), "AB");
});

test("fake provider yields deltas then completed", async () => {
  const agent = createFakeAgentProvider({ chunks: ["a", "b"], delayMs: 0 });
  const events = [];
  for await (const e of agent.invoke({ prompt: "x", threadId: "t" })) {
    events.push(e);
  }
  assert.deepEqual(events, [
    { type: "delta", text: "a" },
    { type: "delta", text: "b" },
    { type: "completed", text: "ab" },
  ]);
});

test("fake provider can fail", async () => {
  const agent = createFakeAgentProvider({ failWith: "boom" });
  const events = [];
  for await (const e of agent.invoke({ prompt: "x", threadId: "t" })) {
    events.push(e);
  }
  assert.deepEqual(events, [{ type: "failed", error: "boom" }]);
});
