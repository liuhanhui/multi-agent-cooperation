/**
 * Callback-auth contracts (M10): short-lived invocation credentials.
 */

export type CallbackAuthFailureReason =
  | "missing"
  | "invalid"
  | "expired"
  | "thread_mismatch";

/** Issued to an agent for a single queue entry / thread callback window. */
export interface InvocationCredential {
  /** Opaque bearer token (never log in full). */
  token: string;
  queueEntryId: string;
  threadId: string;
  /** Cats allowed to author messages under this credential. */
  catIds: string[];
  expiresAt: string;
  createdAt: string;
}

/** One auth denial for telemetry / operator visibility. */
export interface CallbackAuthFailure {
  id: string;
  at: string;
  reason: CallbackAuthFailureReason;
  path: string;
  detail?: string;
}
