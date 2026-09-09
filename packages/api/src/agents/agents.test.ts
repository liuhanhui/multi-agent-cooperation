import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAntigravityLine } from "./antigravity-stream-parse.js";
import { getProviderCapability, listProviderCapabilities } from "./capabilities.js";
import {
  extractClaudeAssistantText,
  extractClaudeDelta,
  extractClaudeResultText,
} from "./claude-stream-parse.js";
import {
  prependSystemSnippet,
  prepareSpawnArgs,
  quoteWinShellArg,
  resolveWinExecutable,
  shouldUseWinShell,
} from "./cli-line-stream.js";
import { parseCodexLine } from "./codex-stream-parse.js";
import { createFakeAgentProvider } from "./fake-provider.js";
import { createProviderRouter } from "./provider-router.js";
import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "./types.js";

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

test("parseCodexLine reads agent_message item.completed", () => {
  const line = JSON.stringify({
    type: "item.completed",
    item: { id: "item_1", type: "agent_message", text: "LGTM with nits" },
  });
  assert.deepEqual(parseCodexLine(line), { kind: "final", text: "LGTM with nits" });
});

test("parseCodexLine surfaces turn.failed", () => {
  const line = JSON.stringify({
    type: "turn.failed",
    error: { message: "quota exceeded" },
  });
  assert.deepEqual(parseCodexLine(line), { kind: "fail", error: "quota exceeded" });
});

test("parseAntigravityLine reads agent_response text_delta", () => {
  const line = JSON.stringify({
    event: "step_update",
    step_update: {
      step_type: "agent_response",
      state: "ACTIVE",
      text_delta: "ship it",
    },
  });
  assert.deepEqual(parseAntigravityLine(line), { kind: "delta", text: "ship it" });
});

test("parseAntigravityLine reads result.response as final", () => {
  const line = JSON.stringify({
    event: "result",
    result: { status: "SUCCESS", response: "done\n" },
  });
  assert.deepEqual(parseAntigravityLine(line), { kind: "final", text: "done\n" });
});

test("capability table lists three CLI families plus fake", () => {
  const ids = listProviderCapabilities().map((c) => c.id);
  assert.ok(ids.includes("claude-code"));
  assert.ok(ids.includes("codex"));
  assert.ok(ids.includes("antigravity"));
  assert.equal(getProviderCapability("antigravity")?.outputFormat, "stream-json");
});

test("prependSystemSnippet folds identity into prompt", () => {
  assert.equal(prependSystemSnippet("hi"), "hi");
  assert.match(prependSystemSnippet("hi", "Be brief"), /\[System\][\s\S]*Be brief[\s\S]*\[User\]\nhi/);
});

test("quoteWinShellArg wraps prompts that contain spaces", () => {
  assert.equal(quoteWinShellArg("hello"), "hello");
  assert.equal(quoteWinShellArg("hello world"), '"hello world"');
  assert.equal(quoteWinShellArg('say "hi"'), '"say ""hi"""');
  assert.equal(quoteWinShellArg(""), '""');
});

test("prepareSpawnArgs quotes on win32 only", () => {
  const input = ["exec", "--json", "hello world"];
  const out = prepareSpawnArgs(input);
  if (process.platform === "win32") {
    assert.deepEqual(out, ["exec", "--json", '"hello world"']);
  } else {
    assert.deepEqual(out, input);
  }
});

test("shouldUseWinShell is false for absolute exe paths", () => {
  if (process.platform !== "win32") {
    assert.equal(shouldUseWinShell("agy"), false);
    return;
  }
  assert.equal(shouldUseWinShell("agy"), true);
  assert.equal(shouldUseWinShell("C:\\Users\\x\\agy.exe"), false);
  assert.equal(shouldUseWinShell("C:/tools/agy.exe"), false);
});

test("resolveWinExecutable prefers .exe from where.exe on win32", () => {
  if (process.platform !== "win32") {
    assert.equal(resolveWinExecutable("node"), "node");
    return;
  }
  const resolved = resolveWinExecutable("node");
  assert.match(resolved, /\.exe$/i);
  assert.equal(shouldUseWinShell(resolved), false);
  // Already absolute exe stays unchanged.
  assert.equal(resolveWinExecutable(resolved), resolved);
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

/**
 * Tiny stub that records which provider id handled the invoke.
 * @param id - Provider id stamped into completed text
 */
function taggingProvider(id: string): AgentProvider {
  return {
    id,
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      yield { type: "completed", text: `${id}:${input.catId ?? "none"}` };
    },
  };
}

test("provider router selects adapter by catId", async () => {
  const router = createProviderRouter({
    providers: {
      "claude-code": taggingProvider("claude-code"),
      codex: taggingProvider("codex"),
      antigravity: taggingProvider("antigravity"),
    },
    defaultProviderId: "claude-code",
    resolveProviderId: (catId) => {
      if (catId === "reviewer") return "codex";
      if (catId === "builder") return "antigravity";
      return "claude-code";
    },
  });

  const seen: string[] = [];
  for (const catId of ["architect", "reviewer", "builder"]) {
    for await (const e of router.invoke({ prompt: "x", threadId: "t", catId })) {
      if (e.type === "completed") seen.push(e.text);
    }
  }
  assert.deepEqual(seen, [
    "claude-code:architect",
    "codex:reviewer",
    "antigravity:builder",
  ]);
});
