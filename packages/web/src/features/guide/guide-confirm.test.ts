import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message, MessageStatus } from "@mac/shared";
import { findGuidedEchoSettlement } from "./guide-confirm";

/**
 * Build the minimal message projection needed by guided Echo tests.
 * @param seq - Thread sequence
 * @param status - Assistant delivery status
 * @param threadId - Owning thread
 * @returns Complete Message fixture
 */
function assistantMessage(
  seq: number,
  status: MessageStatus,
  threadId = "guided-thread",
): Message {
  return {
    id: `message-${seq}`,
    threadId,
    seq,
    role: "assistant",
    authorId: "echo",
    content: "hello",
    status,
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
  };
}

test("guided Echo ignores old and foreign-thread settlements", () => {
  const scope = { threadId: "guided-thread", baselineSeq: 5 };
  assert.equal(
    findGuidedEchoSettlement(
      [assistantMessage(5, "completed")],
      "guided-thread",
      scope,
    ),
    null,
  );
  assert.equal(
    findGuidedEchoSettlement(
      [assistantMessage(6, "completed", "other")],
      "other",
      scope,
    ),
    null,
  );
});

test("guided Echo distinguishes completion from retryable failure", () => {
  const scope = { threadId: "guided-thread", baselineSeq: 5 };
  assert.equal(
    findGuidedEchoSettlement(
      [assistantMessage(6, "completed")],
      "guided-thread",
      scope,
    ),
    "completed",
  );
  assert.equal(
    findGuidedEchoSettlement(
      [assistantMessage(6, "failed")],
      "guided-thread",
      scope,
    ),
    "failed",
  );
});
