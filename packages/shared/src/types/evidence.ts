/**
 * Evidence memory records for retrieval injection (M16).
 * Provenance is mandatory — no anonymous facts.
 */

/** Where an evidence row came from (forced on write). */
export interface EvidenceProvenance {
  /** Human-readable source label (e.g. decision, lesson, operator-note). */
  source: string;
  /** ISO timestamp when the fact was recorded (may differ from createdAt). */
  recordedAt: string;
  /** Optional actor (cat id / operator). */
  actorId?: string;
  /** Optional originating thread. */
  threadId?: string;
  /** Optional originating message. */
  messageId?: string;
}

/** Persisted evidence row. */
export interface Evidence {
  id: string;
  title: string;
  body: string;
  tags: string[];
  provenance: EvidenceProvenance;
  createdAt: string;
  updatedAt: string;
}

/** One BM25 hit returned to callers / injection. */
export interface EvidenceHit {
  evidence: Evidence;
  /** BM25 score from FTS5 (more negative ≈ better). */
  score: number;
}

/** Result of cue/search + budget packing for prompt injection. */
export interface EvidenceRetrievalResult {
  hits: EvidenceHit[];
  skipped: Array<{ id: string; reason: string }>;
  injectedIds: string[];
  totalTokens: number;
  budgetTokens: number;
  /** Empty when no FTS match — callers must not invent memory. */
  injection: string;
}
