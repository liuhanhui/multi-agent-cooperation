import type { WriteLaneProposal, WriteLaneResult } from "@mac/shared";
import type { EvidenceStore } from "../evidence-store.js";
import { commitLaneWrite, type WriteLane } from "./lane-writer.js";

/**
 * Profile fragment lane — short durable notes about a cat or operator (M17).
 * subjectKey must be `cat:{id}` or `operator`.
 */
export const profileLane: WriteLane = {
  id: "profile",

  /**
   * Enforce profile subject shape and short body.
   * @param proposal - Incoming proposal
   */
  validate(proposal: WriteLaneProposal): void {
    const key = proposal.subjectKey.trim();
    if (!key) throw new Error("subjectKey required");
    if (key !== "operator" && !/^cat:[a-z0-9_-]+$/i.test(key)) {
      throw new Error("profile subjectKey must be operator or cat:{id}");
    }
    if (!proposal.title.trim()) throw new Error("title required");
    if (proposal.body.trim().length < 8) {
      throw new Error("body too short for profile (min 8 chars)");
    }
  },

  /**
   * Validate then commit with tag `kind:profile`.
   * @param store - EvidenceStore
   * @param proposal - Proposal
   * @returns WriteLaneResult
   */
  write(store: EvidenceStore, proposal: WriteLaneProposal): WriteLaneResult {
    this.validate(proposal);
    return commitLaneWrite(store, this.id, proposal, ["kind:profile"]);
  },
};
