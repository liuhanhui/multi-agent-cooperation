/**
 * Approval Hub — unified human disposition (M20).
 * People only decide here; every decision is traceable to a subject + producer.
 */

/** Built-in producers (catalog starts with two). */
export const APPROVAL_PRODUCER_IDS = ["memory_write", "handoff"] as const;

export type ApprovalProducerId = (typeof APPROVAL_PRODUCER_IDS)[number];

/**
 * @param id - Candidate producer id
 * @returns true when known
 */
export function isApprovalProducerId(id: string): id is ApprovalProducerId {
  return (APPROVAL_PRODUCER_IDS as readonly string[]).includes(id);
}

/** Catalog row for Hub producer browse. */
export interface ApprovalProducerCatalogEntry {
  id: ApprovalProducerId;
  label: string;
  description: string;
}

export const APPROVAL_PRODUCER_CATALOG: ApprovalProducerCatalogEntry[] = [
  {
    id: "memory_write",
    label: "Memory write",
    description: "Lane / evidence write that needs human disposition before accept.",
  },
  {
    id: "handoff",
    label: "A2A handoff",
    description: "Cross-cat handoff that should not proceed until an operator approves.",
  },
];

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalChoice = "approve" | "reject";

/**
 * Ingress payload from a producer adapter into the Approval Hub.
 */
export interface ApprovalIngress {
  producerId: ApprovalProducerId;
  /** Domain subject type, e.g. lane / handoff / thread. */
  subjectType: string;
  /** Domain subject id (traceability key). */
  subjectId: string;
  title: string;
  summary: string;
  payload?: Record<string, unknown>;
  /** Optional ball-custody await to wake when approved. */
  awaitId?: string | null;
  requestedBy?: string;
}

/**
 * Persisted approval request + decision ledger fields.
 */
export interface ApprovalRequest {
  id: string;
  producerId: ApprovalProducerId;
  subjectType: string;
  subjectId: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requestedBy: string;
  awaitId: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
}

/**
 * Operator disposition recorded on the request.
 */
export interface ApprovalDecisionInput {
  choice: ApprovalChoice;
  actorId: string;
  note?: string;
}
