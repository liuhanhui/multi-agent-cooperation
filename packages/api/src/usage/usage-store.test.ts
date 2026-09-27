import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { makeTokenUsage } from "../agents/usage-parse.js";
import { UsageStore } from "./usage-store.js";

/**
 * Build a usage payload with only input/output set.
 * @param provider - Family id
 * @param input - Fresh input tokens
 * @param output - Output tokens
 * @param costUsd - Optional reported cost
 * @returns TokenUsage
 */
function usage(provider: string, input: number, output: number, costUsd: number | null = null) {
  return makeTokenUsage(
    provider,
    { inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0 },
    { costUsd },
  );
}

test("record is first-write-wins per message id", () => {
  const store = new UsageStore({ dbPath: ":memory:" });
  const first = store.record({ messageId: "m1", threadId: "t1", catId: "architect", usage: usage("claude-code", 10, 5) });
  const again = store.record({ messageId: "m1", threadId: "t1", catId: "architect", usage: usage("claude-code", 999, 999) });
  assert.equal(again.id, first.id);
  assert.equal(again.totalTokens, 15);
  assert.equal(store.summary({ now: first.createdAt }).totals.turns, 1);
  store.close();
});

test("summary groups by cat/provider/day, zero-fills days, and scopes by thread", () => {
  const store = new UsageStore({ dbPath: ":memory:" });
  store.record({ messageId: "a", threadId: "t1", catId: "architect", usage: usage("claude-code", 100, 50, 0.02), now: "2026-09-25T10:00:00.000Z" });
  store.record({ messageId: "b", threadId: "t1", catId: "reviewer", usage: usage("codex", 40, 10), now: "2026-09-27T09:00:00.000Z" });
  store.record({ messageId: "c", threadId: "t2", catId: "architect", usage: usage("claude-code", 1, 1, 0.01), now: "2026-09-27T11:00:00.000Z" });
  // Outside a 3-day window ending 2026-09-27.
  store.record({ messageId: "old", threadId: "t1", catId: "architect", usage: usage("claude-code", 9999, 0), now: "2026-09-20T00:00:00.000Z" });

  const all = store.summary({ days: 3, now: "2026-09-27T12:00:00.000Z" });
  assert.deepEqual(all.range, { fromDay: "2026-09-25", toDay: "2026-09-27", days: 3 });
  assert.equal(all.totals.turns, 3);
  assert.equal(all.totals.totalTokens, 202);
  assert.ok(Math.abs(all.totals.costUsd - 0.03) < 1e-9);
  assert.deepEqual(all.byDay.map((d) => [d.key, d.totalTokens]), [
    ["2026-09-25", 150],
    ["2026-09-26", 0],
    ["2026-09-27", 52],
  ]);
  assert.deepEqual(all.byCat.map((b) => [b.key, b.totalTokens]), [
    ["architect", 152],
    ["reviewer", 50],
  ]);
  assert.deepEqual(all.byProvider.map((b) => b.key), ["claude-code", "codex"]);
  assert.deepEqual(all.recent.map((r) => r.messageId), ["c", "b", "a"]);

  const scoped = store.summary({ days: 3, threadId: "t2", now: "2026-09-27T12:00:00.000Z" });
  assert.equal(scoped.threadId, "t2");
  assert.equal(scoped.totals.turns, 1);
  assert.deepEqual(scoped.byCat.map((b) => b.key), ["architect"]);
  store.close();
});

test("byMessageIds joins usage and skips unknown ids", () => {
  const store = new UsageStore({ dbPath: ":memory:" });
  store.record({ messageId: "m1", threadId: "t", catId: "builder", usage: { ...usage("fake", 3, 4), estimated: true } });
  const map = store.byMessageIds(["m1", "missing"]);
  assert.equal(map.size, 1);
  assert.equal(map.get("m1")?.estimated, true);
  assert.equal(map.get("m1")?.totalTokens, 7);
  store.close();
});

test("ledger survives reopen on a file path", () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "mac-usage-")), "usage.sqlite");
  const store = new UsageStore({ dbPath });
  store.record({ messageId: "m1", threadId: "t", catId: "architect", usage: usage("claude-code", 1, 2) });
  store.close();
  const reopened = new UsageStore({ dbPath });
  assert.equal(reopened.byMessageIds(["m1"]).get("m1")?.totalTokens, 3);
  reopened.close();
});
