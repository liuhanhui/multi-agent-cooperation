/**
 * Memory write lanes (M17): Decision/Lesson, Profile, Event summary.
 * Each lane is a single writer; conflicts require explicit disposition.
 */

/** Supported write lanes for M17. */
export const WRITE_LANE_IDS = ["decision_lesson", "profile", "event_summary"] as const;

export type WriteLaneId = (typeof WRITE_LANE_IDS)[number];

/** Explicit conflict resolution — required when a subject already has lane evidence. */
export type WriteDispositionChoice = "accept" | "reject";

/** Outcome recorded after a lane write attempt. */
export type WriteDisposition = "accepted" | "rejected";

/**
 * Whether `id` is a known write lane.
 * @param id - Candidate lane id
 * @returns true when id is in WRITE_LANE_IDS
 */
export function isWriteLaneId(id: string): id is WriteLaneId {
  return (WRITE_LANE_IDS as readonly string[]).includes(id);
}

/** Tag helpers shared by writers and conflict lookup. */
export function laneTag(lane: WriteLaneId): string {
  return `lane:${lane}`;
}

/**
 * @param subjectKey - Lane-local subject (e.g. auth.token, cat:architect)
 * @returns Canonical subject tag
 */
export function subjectTag(subjectKey: string): string {
  return `subject:${subjectKey.trim()}`;
}

/** Proposal submitted to a write lane. */
export interface WriteLaneProposal {
  title: string;
  body: string;
  /** Conflict / identity key within the lane (required). */
  subjectKey: string;
  tags?: string[];
  actorId?: string;
  threadId?: string;
  messageId?: string;
  /**
   * Required when an existing evidence row already owns this lane+subject.
   * accept = supersede with a new evidence row; reject = keep old, no write.
   */
  disposition?: WriteDispositionChoice;
}

/** Result of attempting a lane write. */
export interface WriteLaneResult {
  lane: WriteLaneId;
  disposition: WriteDisposition;
  reason: string;
  subjectKey: string;
  evidenceId?: string;
  supersededEvidenceId?: string;
  /** Present when HTTP should respond 409 (conflict, disposition missing). */
  conflict?: {
    existingEvidenceId: string;
    existingTitle: string;
  };
}
