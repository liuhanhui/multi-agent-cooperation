import type { WriteLaneProposal, WriteLaneResult } from "@mac/shared";
import type { EvidenceStore } from "../evidence-store.js";
import { commitLaneWrite, type WriteLane } from "./lane-writer.js";

/**
 * Event summary lane — durable summary of a notable occurrence (M17).
 * subjectKey examples: `event:deploy-2026-09-09`, `event:incident-42`.
 */
export const eventSummaryLane: WriteLane = {
  id: "event_summary",

  /**
   * Require event-shaped subjectKey and a summary body.
   * @param proposal - Incoming proposal
   */
  validate(proposal: WriteLaneProposal): void {
    const key = proposal.subjectKey.trim();
    if (!key) throw new Error("subjectKey required");
    if (!/^event:[a-z0-9._:-]+$/i.test(key)) {
      throw new Error("event_summary subjectKey must match event:{slug}");
    }
    if (!proposal.title.trim()) throw new Error("title required");
    if (proposal.body.trim().length < 12) {
      throw new Error("body too short for event_summary (min 12 chars)");
    }
  },

  /**
   * Validate then commit with tag `kind:event_summary`.
   * @param store - EvidenceStore
   * @param proposal - Proposal
   * @returns WriteLaneResult
   */
  write(store: EvidenceStore, proposal: WriteLaneProposal): WriteLaneResult {
    this.validate(proposal);
    return commitLaneWrite(store, this.id, proposal, ["kind:event_summary"]);
  },
};
