import { randomUUID } from "node:crypto";
import {
  canOverwriteCompletedContent,
  freshnessVerdict,
  type DeliveryBatch,
  type ReceiptSupplement,
  type TargetReceipt,
} from "@mac/shared";

export interface CreateDeliveryBatchInput {
  threadId: string;
  targetCatIds: string[];
  sourceMessageId?: string | null;
  queueEntryId?: string | null;
}

/**
 * In-memory per-target receipt store with freshness policy (M18).
 * Completed body is frozen; supplements append only.
 */
export class ReceiptStore {
  private readonly batches = new Map<string, DeliveryBatch>();
  private readonly receipts = new Map<string, TargetReceipt>();
  /** batchId → receipt ids */
  private readonly byBatch = new Map<string, string[]>();
  /** threadId → batch ids (newest last) */
  private readonly byThread = new Map<string, string[]>();
  /** queueEntryId → batchId */
  private readonly byQueueEntry = new Map<string, string>();

  /**
   * Open a delivery batch with one pending receipt per target cat.
   * @param input - thread + ordered target cat ids
   * @returns Created batch + receipts
   */
  createBatch(input: CreateDeliveryBatchInput): {
    batch: DeliveryBatch;
    receipts: TargetReceipt[];
  } {
    const targetCatIds = unique(input.targetCatIds);
    if (targetCatIds.length === 0) throw new Error("targetCatIds required");
    const now = new Date().toISOString();
    const batch: DeliveryBatch = {
      id: randomUUID(),
      threadId: input.threadId,
      sourceMessageId: input.sourceMessageId ?? null,
      queueEntryId: input.queueEntryId ?? null,
      targetCatIds,
      createdAt: now,
      updatedAt: now,
    };
    this.batches.set(batch.id, batch);
    if (batch.queueEntryId) {
      this.byQueueEntry.set(batch.queueEntryId, batch.id);
    }
    const threadBatches = this.byThread.get(batch.threadId) ?? [];
    threadBatches.push(batch.id);
    this.byThread.set(batch.threadId, threadBatches);

    const receipts: TargetReceipt[] = [];
    const ids: string[] = [];
    for (const targetCatId of targetCatIds) {
      const receipt: TargetReceipt = {
        id: randomUUID(),
        batchId: batch.id,
        threadId: batch.threadId,
        targetCatId,
        status: "pending",
        messageId: null,
        completedContent: null,
        completedAt: null,
        supplements: [],
        createdAt: now,
        updatedAt: now,
      };
      this.receipts.set(receipt.id, receipt);
      ids.push(receipt.id);
      receipts.push(cloneReceipt(receipt));
    }
    this.byBatch.set(batch.id, ids);
    return { batch: cloneBatch(batch), receipts };
  }

  /**
   * @param batchId - Batch id
   * @returns Batch or undefined
   */
  getBatch(batchId: string): DeliveryBatch | undefined {
    const b = this.batches.get(batchId);
    return b ? cloneBatch(b) : undefined;
  }

  /**
   * Look up batch by invoking queue entry (survives dispatcher map cleanup).
   * @param queueEntryId - QueueEntry id
   */
  getBatchByQueueEntry(queueEntryId: string): DeliveryBatch | undefined {
    const id = this.byQueueEntry.get(queueEntryId);
    return id ? this.getBatch(id) : undefined;
  }

  /**
   * Attach the source user message once the invoke user bubble exists.
   * @param batchId - Batch id
   * @param sourceMessageId - User message id
   */
  setSourceMessage(batchId: string, sourceMessageId: string): DeliveryBatch {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error(`Batch not found: ${batchId}`);
    const now = new Date().toISOString();
    batch.sourceMessageId = sourceMessageId;
    batch.updatedAt = now;
    return cloneBatch(batch);
  }

  /**
   * Fail every still-pending receipt in a batch (cancel / chain abort).
   * @param batchId - Batch id
   * @param error - Failure reason
   * @returns Updated receipts that were pending
   */
  failPending(batchId: string, error: string): TargetReceipt[] {
    const out: TargetReceipt[] = [];
    for (const receipt of this.listReceipts(batchId)) {
      if (receipt.status !== "pending") continue;
      out.push(this.markFailed(batchId, receipt.targetCatId, null, error));
    }
    return out;
  }

  /**
   * @param receiptId - Receipt id
   * @returns Receipt or undefined
   */
  getReceipt(receiptId: string): TargetReceipt | undefined {
    const r = this.receipts.get(receiptId);
    return r ? cloneReceipt(r) : undefined;
  }

  /**
   * List receipts for a batch (target order preserved).
   * @param batchId - Batch id
   * @returns TargetReceipt array
   */
  listReceipts(batchId: string): TargetReceipt[] {
    const ids = this.byBatch.get(batchId) ?? [];
    return ids
      .map((id) => this.receipts.get(id))
      .filter((r): r is TargetReceipt => r !== undefined)
      .map(cloneReceipt);
  }

  /**
   * Newest batches for a thread (with nested receipts).
   * @param threadId - Thread id
   * @param limit - Max batches
   */
  listBatchesForThread(
    threadId: string,
    limit = 20,
  ): Array<{ batch: DeliveryBatch; receipts: TargetReceipt[] }> {
    const ids = [...(this.byThread.get(threadId) ?? [])].reverse();
    return ids.slice(0, Math.max(1, Math.min(limit, 50))).map((batchId) => ({
      batch: this.getBatch(batchId)!,
      receipts: this.listReceipts(batchId),
    }));
  }

  /**
   * Mark a target delivered: freeze authoritative completed content immediately.
   * @param batchId - Batch id
   * @param targetCatId - Cat id
   * @param messageId - Assistant message id
   * @param content - Completed body snapshot
   * @returns Updated receipt
   */
  markDelivered(
    batchId: string,
    targetCatId: string,
    messageId: string,
    content: string,
  ): TargetReceipt {
    const receipt = this.requireByTarget(batchId, targetCatId);
    const verdict = freshnessVerdict(receipt, content);
    if (!verdict.ok && !canOverwriteCompletedContent(receipt)) {
      throw new Error(verdict.reason);
    }
    if (!canOverwriteCompletedContent(receipt)) {
      throw new Error("stale: completed content is authoritative; use supplement instead");
    }
    const now = new Date().toISOString();
    receipt.status = "delivered";
    receipt.messageId = messageId;
    receipt.completedContent = content;
    receipt.completedAt = now;
    receipt.updatedAt = now;
    this.touchBatch(batchId, now);
    return cloneReceipt(receipt);
  }

  /**
   * Mark target failed (no authoritative body).
   * @param batchId - Batch id
   * @param targetCatId - Cat id
   * @param messageId - Assistant message if any
   * @param error - Failure reason
   */
  markFailed(
    batchId: string,
    targetCatId: string,
    messageId: string | null,
    error: string,
  ): TargetReceipt {
    const receipt = this.requireByTarget(batchId, targetCatId);
    if (receipt.status === "delivered" || receipt.status === "acked") {
      throw new Error("cannot fail a delivered/acked receipt");
    }
    const now = new Date().toISOString();
    receipt.status = "failed";
    receipt.messageId = messageId;
    receipt.error = error;
    receipt.updatedAt = now;
    this.touchBatch(batchId, now);
    return cloneReceipt(receipt);
  }

  /**
   * Append a non-authoritative supplement; never mutates completedContent.
   * @param receiptId - Receipt id
   * @param content - Late text
   * @returns Updated receipt
   */
  appendSupplement(receiptId: string, content: string): TargetReceipt {
    const receipt = this.receipts.get(receiptId);
    if (!receipt) throw new Error(`Receipt not found: ${receiptId}`);
    const body = content.trim();
    if (!body) throw new Error("supplement content required");
    if (receipt.status === "pending") {
      throw new Error("supplement only allowed after delivered/failed/acked");
    }
    const frozenBefore = receipt.completedContent;
    const now = new Date().toISOString();
    const supplement: ReceiptSupplement = {
      id: randomUUID(),
      content: body,
      createdAt: now,
      authoritative: false,
    };
    receipt.supplements = [...receipt.supplements, supplement];
    receipt.updatedAt = now;
    // INV: completedContent immutable across supplement.
    if (receipt.completedContent !== frozenBefore) {
      throw new Error("invariant violated: completedContent mutated by supplement");
    }
    this.touchBatch(receipt.batchId, now);
    return cloneReceipt(receipt);
  }

  /**
   * Operator/target ack after delivery.
   * @param receiptId - Receipt id
   */
  ack(receiptId: string): TargetReceipt {
    const receipt = this.receipts.get(receiptId);
    if (!receipt) throw new Error(`Receipt not found: ${receiptId}`);
    if (receipt.status !== "delivered" && receipt.status !== "acked") {
      throw new Error(`cannot ack receipt in status ${receipt.status}`);
    }
    const now = new Date().toISOString();
    receipt.status = "acked";
    receipt.updatedAt = now;
    this.touchBatch(receipt.batchId, now);
    return cloneReceipt(receipt);
  }

  /**
   * Attempt to replace completedContent — always rejected once frozen (test helper / guard).
   * @param receiptId - Receipt id
   * @param content - Proposed new body
   */
  tryOverwriteCompleted(receiptId: string, content: string): never {
    const receipt = this.receipts.get(receiptId);
    if (!receipt) throw new Error(`Receipt not found: ${receiptId}`);
    const verdict = freshnessVerdict(receipt, content);
    if (!verdict.ok) throw new Error(verdict.reason);
    throw new Error("stale: completed content is authoritative; use supplement instead");
  }

  /**
   * @param batchId - Batch
   * @param targetCatId - Cat
   * @returns Mutable receipt ref
   */
  private requireByTarget(batchId: string, targetCatId: string): TargetReceipt {
    const ids = this.byBatch.get(batchId) ?? [];
    for (const id of ids) {
      const r = this.receipts.get(id);
      if (r && r.targetCatId === targetCatId) return r;
    }
    throw new Error(`Receipt not found for ${targetCatId} in batch ${batchId}`);
  }

  /**
   * @param batchId - Batch id
   * @param now - ISO timestamp
   */
  private touchBatch(batchId: string, now: string): void {
    const batch = this.batches.get(batchId);
    if (batch) batch.updatedAt = now;
  }
}

/**
 * @param ids - Cat ids
 * @returns Deduped preserving order
 */
function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * @param batch - Source
 * @returns Clone
 */
function cloneBatch(batch: DeliveryBatch): DeliveryBatch {
  return { ...batch, targetCatIds: [...batch.targetCatIds] };
}

/**
 * @param receipt - Source
 * @returns Deep-ish clone
 */
function cloneReceipt(receipt: TargetReceipt): TargetReceipt {
  return {
    ...receipt,
    supplements: receipt.supplements.map((s) => ({ ...s })),
  };
}
