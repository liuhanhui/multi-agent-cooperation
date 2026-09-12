/**
 * Ball custody + await contracts (M19).
 * Projection answers 「球在谁手上」; awaits are signal-driven (not cron UI).
 *
 * Custody triple (强制三件套) on every BallCustodyProjection:
 *   1. holder (who)
 *   2. mode (active | waiting | idle)
 *   3. awaitState (wait contract or null)
 */

/** Who may hold the ball. */
export type BallHolderKind = "cat" | "human" | "system" | "none";

/** Custody mode for Hub display. */
export type BallCustodyMode = "active" | "waiting" | "idle";

/** Subject the ball is attached to. */
export type BallSubjectType = "thread" | "feature";

/**
 * External wake signal kinds.
 * github_pr / human_approval are first-class; mock is for Hub/dev wake.
 */
export type AwaitSignalKind = "github_pr" | "human_approval" | "mock";

/** Lifecycle of one await contract. */
export type AwaitStatus = "waiting" | "woken" | "expired" | "cancelled";

/**
 * Condition wait — wake when a matching signal arrives (or expire/cancel).
 * Not a scheduled-task UI: condition + signalKind are the contract.
 */
export interface AwaitState {
  id: string;
  subjectType: BallSubjectType;
  subjectId: string;
  signalKind: AwaitSignalKind;
  /** Human-readable wait condition (e.g. "PR #42 review approved"). */
  condition: string;
  status: AwaitStatus;
  /** Optional soft deadline; expiry is checked, not "run at time X". */
  expiresAt: string | null;
  wakePayload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  wokenAt?: string;
  cancelledAt?: string;
  expiredAt?: string;
}

/**
 * Read model answering 「球在谁手上」for one subject.
 * Always includes the custody triple: holder + mode + awaitState.
 */
export interface BallCustodyProjection {
  subjectType: BallSubjectType;
  subjectId: string;
  /** Triple 1 — who holds the ball (null + holderKind none ⇒ unassigned). */
  holderId: string | null;
  holderKind: BallHolderKind;
  /** Triple 2 — active work vs waiting vs idle. */
  mode: BallCustodyMode;
  /** Triple 3 — current wait contract when mode === waiting (else null). */
  awaitState: AwaitState | null;
  since: string;
  updatedAt: string;
}

/**
 * Derive custody mode from holder + open await.
 * @param holderKind - Current holder kind
 * @param awaitState - Open or terminal await (only waiting counts)
 * @returns Mode for Hub projection
 */
export function deriveCustodyMode(
  holderKind: BallHolderKind,
  awaitState: AwaitState | null,
): BallCustodyMode {
  if (awaitState?.status === "waiting") return "waiting";
  if (holderKind === "none" || holderIdIsEmpty(holderKind)) return "idle";
  return "active";
}

/**
 * @param holderKind - Holder kind
 * @returns true when no real holder
 */
function holderIdIsEmpty(holderKind: BallHolderKind): boolean {
  return holderKind === "none";
}

/**
 * Assert the custody triple is present on a projection (fail closed).
 * @param projection - Candidate projection
 * @throws Error when any of the three legs is missing/incoherent
 */
export function assertCustodyTriple(projection: BallCustodyProjection): void {
  if (!projection.subjectType || !projection.subjectId) {
    throw new Error("custody triple requires subjectType + subjectId");
  }
  if (projection.holderKind === undefined) {
    throw new Error("custody triple requires holderKind");
  }
  if (!projection.mode) {
    throw new Error("custody triple requires mode");
  }
  if (projection.mode === "waiting" && projection.awaitState?.status !== "waiting") {
    throw new Error("custody triple: mode waiting requires awaitState.status=waiting");
  }
  if (projection.mode !== "waiting" && projection.awaitState?.status === "waiting") {
    throw new Error("custody triple: open await requires mode waiting");
  }
}
