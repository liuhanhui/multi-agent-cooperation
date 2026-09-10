import {
  isWriteLaneId,
  WRITE_LANE_IDS,
  type WriteLaneId,
  type WriteLaneProposal,
  type WriteLaneResult,
} from "@mac/shared";
import type { EvidenceStore } from "../evidence-store.js";
import { retrieveEvidenceForPrompt } from "../retrieve-evidence.js";
import { decisionLessonLane } from "./decision-lesson-lane.js";
import { eventSummaryLane } from "./event-summary-lane.js";
import type { WriteLane } from "./lane-writer.js";
import { profileLane } from "./profile-lane.js";

/**
 * Registry of single-writer lanes + consume helper (M17).
 */
export class WriteLaneService {
  private readonly lanes: ReadonlyMap<WriteLaneId, WriteLane>;
  private readonly history: WriteLaneResult[] = [];

  /**
   * @param evidence - Shared EvidenceStore (accept path writes here)
   */
  constructor(private readonly evidence: EvidenceStore) {
    this.lanes = new Map<WriteLaneId, WriteLane>([
      [decisionLessonLane.id, decisionLessonLane],
      [profileLane.id, profileLane],
      [eventSummaryLane.id, eventSummaryLane],
    ]);
  }

  /**
   * @returns Known lane ids in plan order
   */
  listLaneIds(): WriteLaneId[] {
    return [...WRITE_LANE_IDS];
  }

  /**
   * Route a proposal to the named lane's single writer.
   * @param laneId - WriteLaneId
   * @param proposal - Proposal body
   * @returns WriteLaneResult (may include conflict needing disposition)
   */
  write(laneId: string, proposal: WriteLaneProposal): WriteLaneResult {
    if (!isWriteLaneId(laneId)) {
      throw new Error(`Unknown write lane: ${laneId}`);
    }
    const lane = this.lanes.get(laneId);
    if (!lane) throw new Error(`Write lane not registered: ${laneId}`);
    const result = lane.write(this.evidence, proposal);
    // Only record terminal dispositions (not "needs disposition" soft rejects with conflict).
    if (!(result.conflict && !proposal.disposition)) {
      this.history.unshift(result);
    } else {
      // Still audit the conflict ping so Hub can show last conflicts.
      this.history.unshift(result);
    }
    if (this.history.length > 100) this.history.length = 100;
    return result;
  }

  /**
   * Recent disposition outcomes (in-memory audit for Hub).
   * @param limit - Max rows
   * @returns Newest-first results
   */
  listDispositions(limit = 20): WriteLaneResult[] {
    return this.history.slice(0, Math.max(1, Math.min(limit, 100)));
  }

  /**
   * Consume path: BM25 retrieve should surface accepted lane evidence.
   * @param cue - Free-text recall cue
   * @returns injected ids + injection text
   */
  consume(cue: string): { injectedIds: string[]; injection: string } {
    const result = retrieveEvidenceForPrompt(this.evidence, cue);
    return { injectedIds: result.injectedIds, injection: result.injection };
  }
}
