import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAutoReviewPayload,
  formatHandoffReviewPrompt,
  parseHandoffFivePiece,
  type Handoff,
} from "./types/handoff.js";

test("parseHandoffFivePiece rejects bare strings and missing fields", () => {
  assert.throws(() => parseHandoffFivePiece("just text"), /object/i);
  assert.throws(
    () => parseHandoffFivePiece({ what: "x", why: "y", tradeoff: "z", open: "o" }),
    /next/i,
  );
});

test("parseHandoffFivePiece accepts full five-piece", () => {
  const payload = parseHandoffFivePiece({
    what: "API sketch",
    why: "need review",
    tradeoff: "speed vs depth",
    open: "auth TBD",
    next: "reviewer pick holes",
  });
  assert.equal(payload.what, "API sketch");
});

test("formatHandoffReviewPrompt embeds all five sections", () => {
  const handoff: Handoff = {
    id: "h1",
    threadId: "t1",
    fromCatId: "architect",
    toCatId: "reviewer",
    kind: "review",
    payload: {
      what: "W",
      why: "Y",
      tradeoff: "T",
      open: "O",
      next: "N",
    },
    sourceMessageId: null,
    sourceQueueEntryId: null,
    status: "delivered",
    receipt: null,
    reviewQueueEntryId: null,
    deliveryMessageId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const prompt = formatHandoffReviewPrompt(handoff);
  assert.match(prompt, /## What\nW/);
  assert.match(prompt, /## Why\nY/);
  assert.match(prompt, /## Tradeoff\nT/);
  assert.match(prompt, /## Open\nO/);
  assert.match(prompt, /## Next\nN/);
  assert.match(prompt, /Handoff-Id: h1/);
});

test("buildAutoReviewPayload wraps producer content", () => {
  const payload = buildAutoReviewPayload("design doc", "architect", "reviewer");
  assert.equal(payload.what, "design doc");
  assert.match(payload.why, /architect/);
  assert.match(payload.why, /reviewer/);
  assert.match(payload.next, /architect/);
});
