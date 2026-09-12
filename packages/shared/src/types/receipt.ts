/**
 * Per-target delivery receipts + freshness (M18).
 * Completed text is authoritative; late supplements never overwrite it.
 */

/** Lifecycle of one target's receipt inside a delivery batch. */
export type TargetReceiptStatus = "pending" | "delivered" | "failed" | "acked";

/** Non-authoritative late addition after completed delivery. */
export interface ReceiptSupplement {
  id: string;
  content: string;
  createdAt: string;
  /** Always false — supplements are never the authority of record. */
  authoritative: false;
}

/** One target cat's receipt for a multi-target (or single) delivery. */
export interface TargetReceipt {
  id: string;
  batchId: string;
  threadId: string;
  targetCatId: string;
  status: TargetReceiptStatus;
  /** Assistant message id when delivered/failed. */
  messageId: string | null;
  /**
   * Frozen completed body at deliver time (authoritative).
   * Never mutated by supplements.
   */
  completedContent: string | null;
  completedAt: string | null;
  error?: string;
  supplements: ReceiptSupplement[];
  createdAt: string;
  updatedAt: string;
}

/** Batch of per-target receipts for one invoke / user turn. */
export interface DeliveryBatch {
  id: string;
  threadId: string;
  sourceMessageId: string | null;
  queueEntryId: string | null;
  targetCatIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Whether a late write may replace completedContent (always false once set).
 * @param receipt - Current receipt
 * @returns false when completedContent already frozen
 */
export function canOverwriteCompletedContent(receipt: TargetReceipt): boolean {
  return receipt.completedContent == null;
}

/**
 * Freshness verdict for a body candidate against a receipt.
 * @param receipt - Target receipt
 * @param candidate - Proposed authoritative body
 * @returns ok when still open; otherwise stale/forbidden
 */
export function freshnessVerdict(
  receipt: TargetReceipt,
  candidate: string,
): { ok: true } | { ok: false; reason: string } {
  if (receipt.completedContent == null) return { ok: true };
  if (candidate === receipt.completedContent) return { ok: true };
  return {
    ok: false,
    reason: "stale: completed content is authoritative; use supplement instead",
  };
}
