/**
 * Structured A2A handoff contract (M09).
 * Bare free-text alone is not a valid handoff — all five fields required.
 */

/** Five-piece handoff body (What / Why / Tradeoff / Open / Next). */
export interface HandoffFivePiece {
  what: string;
  why: string;
  tradeoff: string;
  open: string;
  next: string;
}

/** Receipt proving the target side acknowledged delivery. */
export interface HandoffReceipt {
  /** Minimal Done receipt: target has received the handoff. */
  status: "received";
  at: string;
  byCatId: string;
}

export type HandoffKind = "review" | "general";

export type HandoffStatus = "created" | "delivered" | "acked" | "failed";

/**
 * Persisted agent→agent handoff record.
 * Delivered into a thread as a structured system message + platform event.
 */
export interface Handoff {
  id: string;
  threadId: string;
  fromCatId: string;
  toCatId: string;
  kind: HandoffKind;
  payload: HandoffFivePiece;
  /** Producer assistant message that motivated this handoff, when known. */
  sourceMessageId: string | null;
  /** Queue entry that produced the source work, when known. */
  sourceQueueEntryId: string | null;
  status: HandoffStatus;
  receipt: HandoffReceipt | null;
  /** Invoke queued for the reviewer (toCatId), when triggerReview ran. */
  reviewQueueEntryId: string | null;
  /** Thread message id that carries the structured handoff body. */
  deliveryMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

/**
 * Validate and normalize a five-piece payload.
 * @param raw - Unknown JSON body
 * @returns Normalized HandoffFivePiece
 * @throws Error when any required field is missing/blank (fail closed)
 */
export function parseHandoffFivePiece(raw: unknown): HandoffFivePiece {
  if (!raw || typeof raw !== "object") {
    throw new Error("handoff payload must be an object with What/Why/Tradeoff/Open/Next");
  }
  const obj = raw as Record<string, unknown>;
  const requireField = (key: keyof HandoffFivePiece): string => {
    const value = obj[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`handoff payload.${key} is required (non-empty string)`);
    }
    return value.trim();
  };
  return {
    what: requireField("what"),
    why: requireField("why"),
    tradeoff: requireField("tradeoff"),
    open: requireField("open"),
    next: requireField("next"),
  };
}

/**
 * Render a review prompt for the target cat from a structured handoff.
 * @param handoff - Delivered handoff record
 * @returns Prompt text embedding the five pieces (not a bare string contract alone)
 */
export function formatHandoffReviewPrompt(handoff: Handoff): string {
  const { payload, fromCatId, toCatId, kind } = handoff;
  return [
    `# ${kind === "review" ? "Review request" : "Handoff"} (structured)`,
    ``,
    `From: @${fromCatId}`,
    `To: @${toCatId}`,
    `Handoff-Id: ${handoff.id}`,
    ``,
    `## What`,
    payload.what,
    ``,
    `## Why`,
    payload.why,
    ``,
    `## Tradeoff`,
    payload.tradeoff,
    ``,
    `## Open`,
    payload.open,
    ``,
    `## Next`,
    payload.next,
    ``,
    `Respond with your review findings. Do not ignore the structured sections above.`,
  ].join("\n");
}

/**
 * Build a minimal auto-review five-piece from a completed producer message.
 * @param producerContent - Assistant output from cat A
 * @param fromCatId - Producer cat id
 * @param toCatId - Reviewer cat id
 */
export function buildAutoReviewPayload(
  producerContent: string,
  fromCatId: string,
  toCatId: string,
): HandoffFivePiece {
  const body = producerContent.trim() || "(empty producer output)";
  return {
    what: body,
    why: `Auto review after @${fromCatId} completed; requesting @${toCatId}.`,
    tradeoff: "(not provided by producer — review requested automatically)",
    open: "(not provided by producer)",
    next: `Please review @${fromCatId}'s work and call out risks, gaps, and required follow-ups.`,
  };
}
