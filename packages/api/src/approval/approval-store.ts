import { randomUUID } from "node:crypto";
import {
  APPROVAL_PRODUCER_CATALOG,
  isApprovalProducerId,
  type ApprovalDecisionInput,
  type ApprovalIngress,
  type ApprovalProducerCatalogEntry,
  type ApprovalRequest,
  type ApprovalStatus,
} from "@mac/shared";
import type { BallCustodyStore } from "../custody/ball-custody-store.js";

/**
 * In-memory Approval Hub (M20).
 * Producers submit ingress; humans decide only via decide(); ledger is the request itself.
 */
export class ApprovalStore {
  private readonly byId = new Map<string, ApprovalRequest>();

  constructor(private readonly custody?: BallCustodyStore) {}

  /**
   * Producer catalog for Hub browse (starts with memory_write + handoff).
   * @returns Catalog entries
   */
  listProducers(): ApprovalProducerCatalogEntry[] {
    return APPROVAL_PRODUCER_CATALOG.map((e) => ({ ...e }));
  }

  /**
   * Submit an approval request from a producer adapter.
   * @param ingress - Producer payload (subject required for traceability)
   * @returns Created pending request
   */
  submit(ingress: ApprovalIngress): ApprovalRequest {
    if (!isApprovalProducerId(ingress.producerId)) {
      throw new Error(`Unknown producer: ${ingress.producerId}`);
    }
    const subjectType = ingress.subjectType.trim();
    const subjectId = ingress.subjectId.trim();
    const title = ingress.title.trim();
    const summary = ingress.summary.trim();
    if (!subjectType || !subjectId) {
      throw new Error("subjectType and subjectId required for traceability");
    }
    if (!title) throw new Error("title required");
    if (!summary) throw new Error("summary required");

    const now = new Date().toISOString();
    const request: ApprovalRequest = {
      id: randomUUID(),
      producerId: ingress.producerId,
      subjectType,
      subjectId,
      title,
      summary,
      payload: { ...(ingress.payload ?? {}) },
      status: "pending",
      requestedBy: (ingress.requestedBy ?? "system").trim() || "system",
      awaitId: ingress.awaitId ?? null,
      decidedBy: null,
      decisionNote: null,
      createdAt: now,
      updatedAt: now,
      decidedAt: null,
    };
    this.byId.set(request.id, request);
    return clone(request);
  }

  /**
   * Human disposition — approve or reject; optional custody wake on approve.
   * @param requestId - Pending request
   * @param input - Choice + actor
   * @returns Updated request (ledger row)
   */
  decide(requestId: string, input: ApprovalDecisionInput): ApprovalRequest {
    const request = this.byId.get(requestId);
    if (!request) throw new Error(`Approval not found: ${requestId}`);
    if (request.status !== "pending") {
      throw new Error(`cannot decide approval in status ${request.status}`);
    }
    if (input.choice !== "approve" && input.choice !== "reject") {
      throw new Error("choice must be approve|reject");
    }
    const actorId = input.actorId.trim();
    if (!actorId) throw new Error("actorId required");

    const now = new Date().toISOString();
    request.status = input.choice === "approve" ? "approved" : "rejected";
    request.decidedBy = actorId;
    request.decisionNote = input.note?.trim() || null;
    request.decidedAt = now;
    request.updatedAt = now;

    // On approve, wake linked await if still waiting (human_approval signal path).
    if (request.status === "approved" && request.awaitId && this.custody) {
      try {
        this.custody.wake(request.awaitId, {
          approvalId: request.id,
          choice: "approve",
          actorId,
        });
      } catch {
        // Await may already be terminal; ledger still records the decision.
      }
    }

    return clone(request);
  }

  /**
   * @param id - Request id
   * @returns Request or undefined
   */
  get(id: string): ApprovalRequest | undefined {
    const r = this.byId.get(id);
    return r ? clone(r) : undefined;
  }

  /**
   * List requests newest-first; optional status filter.
   * @param status - pending|approved|rejected or omit for all
   * @param limit - Max rows
   */
  list(status?: ApprovalStatus, limit = 40): ApprovalRequest[] {
    return [...this.byId.values()]
      .filter((r) => (status ? r.status === status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map(clone);
  }
}

/**
 * @param request - Source
 * @returns Clone
 */
function clone(request: ApprovalRequest): ApprovalRequest {
  return {
    ...request,
    payload: { ...request.payload },
  };
}
