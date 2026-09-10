import {
  laneTag,
  subjectTag,
  type WriteLaneId,
  type WriteLaneProposal,
  type WriteLaneResult,
} from "@mac/shared";
import type { EvidenceStore } from "../evidence-store.js";

/**
 * Single-writer contract for one memory write lane (M17).
 * Validate → conflict/disposition → Evidence create.
 */
export interface WriteLane {
  readonly id: WriteLaneId;
  /**
   * Lane-specific validation. Throws Error with a human reason on failure.
   * @param proposal - Incoming proposal
   */
  validate(proposal: WriteLaneProposal): void;
  /**
   * Attempt write through this lane's rules (calls shared conflict helper).
   * @param store - EvidenceStore
   * @param proposal - Proposal after HTTP parsing
   * @returns WriteLaneResult (accepted / rejected / conflict needing disposition)
   */
  write(store: EvidenceStore, proposal: WriteLaneProposal): WriteLaneResult;
}

/**
 * Shared accept/reject/conflict flow used by every lane writer.
 * @param store - EvidenceStore
 * @param lane - Lane id (single writer identity)
 * @param proposal - Validated proposal
 * @param extraTags - Lane-specific tags beyond lane/subject
 * @returns WriteLaneResult
 */
export function commitLaneWrite(
  store: EvidenceStore,
  lane: WriteLaneId,
  proposal: WriteLaneProposal,
  extraTags: string[] = [],
): WriteLaneResult {
  const subjectKey = proposal.subjectKey.trim();
  const existing = store.findByLaneSubject(laneTag(lane), subjectTag(subjectKey));

  if (existing && !proposal.disposition) {
    return {
      lane,
      disposition: "rejected",
      reason: "conflict: disposition required (accept|reject)",
      subjectKey,
      conflict: {
        existingEvidenceId: existing.id,
        existingTitle: existing.title,
      },
    };
  }

  if (existing && proposal.disposition === "reject") {
    return {
      lane,
      disposition: "rejected",
      reason: "conflict rejected; existing evidence retained",
      subjectKey,
      supersededEvidenceId: existing.id,
    };
  }

  // accept (or first write): create new evidence. Old row kept for history; retrieval prefers newest.
  const tags = unique([
    laneTag(lane),
    subjectTag(subjectKey),
    ...extraTags,
    ...(proposal.tags ?? []),
  ]);
  const evidence = store.create({
    title: proposal.title.trim(),
    body: proposal.body.trim(),
    tags,
    provenance: {
      source: `lane:${lane}`,
      recordedAt: new Date().toISOString(),
      actorId: proposal.actorId,
      threadId: proposal.threadId,
      messageId: proposal.messageId,
    },
  });

  return {
    lane,
    disposition: "accepted",
    reason: existing ? "accepted: superseded prior subject evidence" : "accepted: created",
    subjectKey,
    evidenceId: evidence.id,
    supersededEvidenceId: existing?.id,
  };
}

/**
 * @param tags - Raw tags
 * @returns Deduped non-empty tags
 */
function unique(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
