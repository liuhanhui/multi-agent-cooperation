import type { WriteLaneProposal, WriteLaneResult } from "@mac/shared";
import type { EvidenceStore } from "../evidence-store.js";
import { commitLaneWrite, type WriteLane } from "./lane-writer.js";

/**
 * Decision / Lesson lane — durable tradeoff or learning notes (M17).
 * Single writer for subject keys like `auth.token`.
 */
export const decisionLessonLane: WriteLane = {
  id: "decision_lesson",

  /**
   * Require subjectKey + non-trivial body for a decision/lesson.
   * @param proposal - Incoming proposal
   */
  validate(proposal: WriteLaneProposal): void {
    if (!proposal.subjectKey.trim()) throw new Error("subjectKey required");
    if (!proposal.title.trim()) throw new Error("title required");
    if (proposal.body.trim().length < 12) {
      throw new Error("body too short for decision_lesson (min 12 chars)");
    }
  },

  /**
   * Validate then commit with tag `kind:decision_lesson`.
   * @param store - EvidenceStore
   * @param proposal - Proposal
   * @returns WriteLaneResult
   */
  write(store: EvidenceStore, proposal: WriteLaneProposal): WriteLaneResult {
    this.validate(proposal);
    return commitLaneWrite(store, this.id, proposal, ["kind:decision_lesson"]);
  },
};
