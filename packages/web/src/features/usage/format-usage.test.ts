import assert from "node:assert/strict";
import { test } from "node:test";
import type { TokenUsage } from "@mac/shared";
import { formatCost, formatTokens, usageChipLabel, usageTooltip } from "./format-usage";

const base: TokenUsage = {
  provider: "claude-code",
  model: "claude-sonnet-4-5",
  inputTokens: 12,
  outputTokens: 340,
  cacheReadTokens: 5000,
  cacheWriteTokens: 0,
  totalTokens: 5352,
  costUsd: 0.004,
  estimated: false,
};

test("formatTokens compacts thousands and millions", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1000), "1k");
  assert.equal(formatTokens(1250), "1.3k");
  assert.equal(formatTokens(3_400_000), "3.4M");
});

test("formatCost handles zero and sub-cent values", () => {
  assert.equal(formatCost(0), "$0");
  assert.equal(formatCost(0.004), "<$0.01");
  assert.equal(formatCost(1.234), "$1.23");
});

test("usageChipLabel marks estimates with ~", () => {
  assert.equal(usageChipLabel(base), "5.4k tok");
  assert.equal(usageChipLabel({ ...base, totalTokens: 40, estimated: true }), "~40 tok");
});

test("usageTooltip lists only non-zero cache fields and flags estimates", () => {
  const tip = usageTooltip(base);
  assert.match(tip, /cache read 5000/);
  assert.doesNotMatch(tip, /cache write/);
  assert.match(tip, /claude-code · claude-sonnet-4-5/);
  assert.match(usageTooltip({ ...base, estimated: true, costUsd: null }), /estimated/);
});
