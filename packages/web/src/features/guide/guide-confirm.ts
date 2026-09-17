import type { Message } from "@mac/shared";

export interface GuidedEchoScope {
  threadId: string;
  baselineSeq: number;
}

/**
 * Find the first new assistant settlement scoped to the armed guided thread.
 * @param messages - Active thread message projection
 * @param activeThreadId - Thread currently represented by messages
 * @param scope - Guided thread and sequence before Echo was requested
 * @returns completed/failed settlement, or null while still waiting
 */
export function findGuidedEchoSettlement(
  messages: Message[],
  activeThreadId: string | null,
  scope: GuidedEchoScope | null,
): "completed" | "failed" | null {
  if (!scope || activeThreadId !== scope.threadId) return null;
  const message = messages.find(
    (candidate) =>
      candidate.seq > scope.baselineSeq &&
      candidate.role === "assistant" &&
      (candidate.status === "completed" || candidate.status === "failed"),
  );
  return message?.status === "completed" || message?.status === "failed"
    ? message.status
    : null;
}
