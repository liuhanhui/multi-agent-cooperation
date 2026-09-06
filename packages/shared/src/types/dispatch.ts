/**
 * Dispatch cell contracts (M08): queue + per-target turn + cancel.
 * Terminal schemas — extend carefully; do not rename status enums lightly.
 */

/** Lifecycle of one enqueued invoke request (may target multiple cats). */
export type QueueEntryStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * One operator invoke job sitting in / moving through the InvocationQueue.
 * Busy gate is per-thread: at most one `running` entry per threadId.
 */
export interface QueueEntry {
  id: string;
  threadId: string;
  /** Prompt after mention strip (what each cat receives). */
  prompt: string;
  /** Ordered cat targets (serial execution). */
  catIds: string[];
  authorId: string;
  status: QueueEntryStatus;
  /** Higher runs before lower when both queued (default 0 = FIFO among equals). */
  priority: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
  /** Set when cancel is requested (CancelToken projection). */
  cancelRequestedAt?: string;
  cancelReason?: string;
}

/** Lifecycle of one cat attempt inside a QueueEntry. */
export type TurnExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "orphaned";

/**
 * Per-target attempt record — one row per cat invocation within a queue entry.
 */
export interface TurnExecution {
  id: string;
  queueEntryId: string;
  threadId: string;
  catId: string;
  /** Assistant message id once the bubble exists. */
  messageId: string | null;
  attempt: number;
  status: TurnExecutionStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

/**
 * Cancel intent bound to a QueueEntry (AbortController lives in process memory).
 * Persisted fields are the audit trail; live abort is via dispatcher CancelToken handle.
 */
export interface CancelToken {
  queueEntryId: string;
  requestedAt: string;
  reason?: string;
}
