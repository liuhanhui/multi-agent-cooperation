import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAntigravityLine } from "./antigravity-stream-parse.js";
import { extractClaudeUsage } from "./claude-stream-parse.js";
import { parseCodexLine } from "./codex-stream-parse.js";
import { createFakeAgentProvider } from "./fake-provider.js";
import type { AgentStreamEvent } from "./types.js";
import { makeTokenUsage, readUsageCounts, sumTokenUsage } from "./usage-parse.js";

test("extractClaudeUsage reads result usage, cost, and model", () => {
  const line = JSON.stringify({
    type: "result",
    result: "done",
    total_cost_usd: 0.0123,
    usage: {
      input_tokens: 12,
      output_tokens: 340,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 800,
    },
    modelUsage: { "claude-sonnet-4-5": { inputTokens: 12 } },
  });
  assert.deepEqual(extractClaudeUsage(line), {
    provider: "claude-code",
    model: "claude-sonnet-4-5",
    inputTokens: 12,
    outputTokens: 340,
    cacheReadTokens: 5000,
    cacheWriteTokens: 800,
    totalTokens: 6152,
    costUsd: 0.0123,
    estimated: false,
  });
});

test("extractClaudeUsage ignores non-result lines and result without usage", () => {
  assert.equal(extractClaudeUsage(JSON.stringify({ type: "assistant", usage: { input_tokens: 1 } })), null);
  assert.equal(extractClaudeUsage(JSON.stringify({ type: "result", result: "x" })), null);
  assert.equal(extractClaudeUsage("not json"), null);
});

test("parseCodexLine splits cached input out of turn.completed usage", () => {
  const line = JSON.stringify({
    type: "turn.completed",
    usage: { input_tokens: 1000, cached_input_tokens: 600, output_tokens: 50 },
  });
  const parsed = parseCodexLine(line);
  assert.equal(parsed.kind, "usage");
  if (parsed.kind !== "usage") return;
  assert.equal(parsed.usage.provider, "codex");
  assert.equal(parsed.usage.inputTokens, 400);
  assert.equal(parsed.usage.cacheReadTokens, 600);
  assert.equal(parsed.usage.outputTokens, 50);
  assert.equal(parsed.usage.totalTokens, 1050);
  assert.equal(parsed.usage.costUsd, null);
});

test("parseAntigravityLine attaches usage to final only when present", () => {
  const withUsage = parseAntigravityLine(
    JSON.stringify({
      event: "result",
      result: { status: "OK", response: "hi", usage: { inputTokens: 7, outputTokens: 3 } },
    }),
  );
  assert.equal(withUsage.kind, "final");
  if (withUsage.kind === "final") assert.equal(withUsage.usage?.totalTokens, 10);

  const without = parseAntigravityLine(
    JSON.stringify({ event: "result", result: { status: "OK", response: "hi" } }),
  );
  assert.deepEqual(without, { kind: "final", text: "hi" });
});

test("readUsageCounts returns null when every counter is zero or missing", () => {
  assert.equal(readUsageCounts({}, false), null);
  assert.equal(readUsageCounts({ input_tokens: 0 }, false), null);
  assert.equal(readUsageCounts(null, false), null);
});

test("sumTokenUsage adds counts, keeps last model, and nulls cost only when none reported", () => {
  const a = makeTokenUsage("codex", { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 });
  const b = makeTokenUsage(
    "codex",
    { inputTokens: 3, outputTokens: 4, cacheReadTokens: 5, cacheWriteTokens: 0 },
    { model: "gpt-5", costUsd: 0.5 },
  );
  const sum = sumTokenUsage([a, b]);
  assert.equal(sum.inputTokens, 4);
  assert.equal(sum.outputTokens, 6);
  assert.equal(sum.totalTokens, 15);
  assert.equal(sum.model, "gpt-5");
  assert.equal(sum.costUsd, 0.5);
  assert.equal(sumTokenUsage([a]).costUsd, null);
});

test("fake provider emits an estimated usage event before completed when enabled", async () => {
  const agent = createFakeAgentProvider({ chunks: ["abcd", "efgh"], delayMs: 0, estimateUsage: true });
  const events: AgentStreamEvent[] = [];
  for await (const e of agent.invoke({ prompt: "12345678", threadId: "t" })) events.push(e);
  assert.deepEqual(
    events.map((e) => e.type),
    ["delta", "delta", "usage", "completed"],
  );
  const usage = events.find((e) => e.type === "usage");
  assert.ok(usage && usage.type === "usage");
  assert.equal(usage.usage.estimated, true);
  assert.equal(usage.usage.inputTokens, 2);
  assert.equal(usage.usage.outputTokens, 2);
});
