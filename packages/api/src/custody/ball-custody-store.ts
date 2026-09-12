import { randomUUID } from "node:crypto";
import {
  assertCustodyTriple,
  deriveCustodyMode,
  type AwaitSignalKind,
  type AwaitState,
  type BallCustodyProjection,
  type BallHolderKind,
  type BallSubjectType,
} from "@mac/shared";

export interface HoldBallInput {
  subjectType: BallSubjectType;
  subjectId: string;
  holderId: string | null;
  holderKind: BallHolderKind;
}

export interface BeginWaitInput {
  subjectType: BallSubjectType;
  subjectId: string;
  signalKind: AwaitSignalKind;
  condition: string;
  expiresAt?: string | null;
}

interface CustodyRecord {
  subjectType: BallSubjectType;
  subjectId: string;
  holderId: string | null;
  holderKind: BallHolderKind;
  awaitId: string | null;
  since: string;
  updatedAt: string;
}

/**
 * In-memory ball custody store + await lifecycle (M19).
 * Projection-first: Hub reads project()/list(); waits are signal-driven.
 */
export class BallCustodyStore {
  private readonly records = new Map<string, CustodyRecord>();
  private readonly awaits = new Map<string, AwaitState>();

  /**
   * Assign or clear who holds the ball for a subject.
   * @param input - Subject + holder
   * @returns Fresh projection (custody triple)
   */
  hold(input: HoldBallInput): BallCustodyProjection {
    const subjectId = input.subjectId.trim();
    if (!subjectId) throw new Error("subjectId required");
    const holderKind = input.holderKind;
    const holderId =
      holderKind === "none" ? null : (input.holderId?.trim() || null);
    if (holderKind !== "none" && !holderId) {
      throw new Error("holderId required unless holderKind is none");
    }
    const key = subjectKey(input.subjectType, subjectId);
    const now = new Date().toISOString();
    const existing = this.records.get(key);
    // Starting active work clears a lingering open await pointer if any.
    if (existing?.awaitId) {
      const open = this.awaits.get(existing.awaitId);
      if (open?.status === "waiting") {
        open.status = "cancelled";
        open.cancelledAt = now;
        open.updatedAt = now;
      }
    }
    const record: CustodyRecord = {
      subjectType: input.subjectType,
      subjectId,
      holderId,
      holderKind,
      awaitId: null,
      since: existing?.since ?? now,
      updatedAt: now,
    };
    this.records.set(key, record);
    return this.toProjection(record);
  }

  /**
   * Park the ball on a condition wait (GitHub / human / mock).
   * @param input - Signal kind + condition (+ optional expiresAt)
   * @returns Projection in waiting mode
   */
  beginWait(input: BeginWaitInput): BallCustodyProjection {
    const subjectId = input.subjectId.trim();
    if (!subjectId) throw new Error("subjectId required");
    const condition = input.condition.trim();
    if (!condition) throw new Error("condition required (signal wait, not a cron job)");
    if (!isSignalKind(input.signalKind)) {
      throw new Error(`Unknown signalKind: ${input.signalKind}`);
    }

    const key = subjectKey(input.subjectType, subjectId);
    let record = this.records.get(key);
    const now = new Date().toISOString();
    if (!record) {
      record = {
        subjectType: input.subjectType,
        subjectId,
        holderId: null,
        holderKind: "none",
        awaitId: null,
        since: now,
        updatedAt: now,
      };
      this.records.set(key, record);
    }
    if (record.awaitId) {
      const prev = this.awaits.get(record.awaitId);
      if (prev?.status === "waiting") {
        throw new Error("subject already waiting; cancel or wake first");
      }
    }

    const awaitState: AwaitState = {
      id: randomUUID(),
      subjectType: input.subjectType,
      subjectId,
      signalKind: input.signalKind,
      condition,
      status: "waiting",
      expiresAt: input.expiresAt ?? null,
      wakePayload: null,
      createdAt: now,
      updatedAt: now,
    };
    this.awaits.set(awaitState.id, awaitState);
    record.awaitId = awaitState.id;
    record.updatedAt = now;
    return this.toProjection(record);
  }

  /**
   * Wake a waiting await with an external/mock signal payload.
   * @param awaitId - Await id
   * @param payload - Optional wake payload
   * @returns Updated projection (mode active again)
   */
  wake(awaitId: string, payload?: Record<string, unknown>): BallCustodyProjection {
    const awaitState = this.awaits.get(awaitId);
    if (!awaitState) throw new Error(`Await not found: ${awaitId}`);
    if (awaitState.status !== "waiting") {
      throw new Error(`cannot wake await in status ${awaitState.status}`);
    }
    const now = new Date().toISOString();
    awaitState.status = "woken";
    awaitState.wokenAt = now;
    awaitState.updatedAt = now;
    awaitState.wakePayload = payload ?? {};
    const record = this.requireRecord(awaitState.subjectType, awaitState.subjectId);
    record.updatedAt = now;
    return this.toProjection(record);
  }

  /**
   * Cancel an open wait (operator abort).
   * @param awaitId - Await id
   * @returns Updated projection
   */
  cancelAwait(awaitId: string): BallCustodyProjection {
    const awaitState = this.awaits.get(awaitId);
    if (!awaitState) throw new Error(`Await not found: ${awaitId}`);
    if (awaitState.status !== "waiting") {
      throw new Error(`cannot cancel await in status ${awaitState.status}`);
    }
    const now = new Date().toISOString();
    awaitState.status = "cancelled";
    awaitState.cancelledAt = now;
    awaitState.updatedAt = now;
    const record = this.requireRecord(awaitState.subjectType, awaitState.subjectId);
    record.updatedAt = now;
    return this.toProjection(record);
  }

  /**
   * Mark due waits as expired (soft deadline check — not a job scheduler UI).
   * @param nowIso - Current time ISO
   * @returns Projections that flipped to expired
   */
  expireDue(nowIso: string): BallCustodyProjection[] {
    const out: BallCustodyProjection[] = [];
    for (const awaitState of this.awaits.values()) {
      if (awaitState.status !== "waiting" || !awaitState.expiresAt) continue;
      if (awaitState.expiresAt > nowIso) continue;
      awaitState.status = "expired";
      awaitState.expiredAt = nowIso;
      awaitState.updatedAt = nowIso;
      const record = this.requireRecord(awaitState.subjectType, awaitState.subjectId);
      record.updatedAt = nowIso;
      out.push(this.toProjection(record));
    }
    return out;
  }

  /**
   * @param subjectType - thread | feature
   * @param subjectId - Id
   * @returns Projection or idle empty projection
   */
  project(subjectType: BallSubjectType, subjectId: string): BallCustodyProjection {
    const record = this.records.get(subjectKey(subjectType, subjectId));
    if (!record) {
      const now = new Date().toISOString();
      const empty: BallCustodyProjection = {
        subjectType,
        subjectId,
        holderId: null,
        holderKind: "none",
        mode: "idle",
        awaitState: null,
        since: now,
        updatedAt: now,
      };
      assertCustodyTriple(empty);
      return empty;
    }
    return this.toProjection(record);
  }

  /**
   * List known custody projections (newest updated first).
   * @param limit - Max rows
   */
  list(limit = 40): BallCustodyProjection[] {
    return [...this.records.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((r) => this.toProjection(r));
  }

  /**
   * @param record - Internal record
   * @returns Public projection with custody triple
   */
  private toProjection(record: CustodyRecord): BallCustodyProjection {
    const awaitState = record.awaitId
      ? cloneAwait(this.awaits.get(record.awaitId)!)
      : null;
    // Terminal awaits stay visible as history on the triple's third leg until next wait.
    const openOrLast =
      awaitState?.status === "waiting"
        ? awaitState
        : awaitState;
    const mode = deriveCustodyMode(
      record.holderKind,
      openOrLast?.status === "waiting" ? openOrLast : null,
    );
    const projection: BallCustodyProjection = {
      subjectType: record.subjectType,
      subjectId: record.subjectId,
      holderId: record.holderId,
      holderKind: record.holderKind,
      mode,
      awaitState: openOrLast,
      since: record.since,
      updatedAt: record.updatedAt,
    };
    assertCustodyTriple(projection);
    return projection;
  }

  /**
   * @param subjectType - Type
   * @param subjectId - Id
   * @returns Mutable record
   */
  private requireRecord(
    subjectType: BallSubjectType,
    subjectId: string,
  ): CustodyRecord {
    const record = this.records.get(subjectKey(subjectType, subjectId));
    if (!record) throw new Error(`Custody record missing for ${subjectType}:${subjectId}`);
    return record;
  }
}

/**
 * @param subjectType - Type
 * @param subjectId - Id
 * @returns Map key
 */
function subjectKey(subjectType: BallSubjectType, subjectId: string): string {
  return `${subjectType}:${subjectId}`;
}

/**
 * @param kind - Candidate
 * @returns true when known signal kind
 */
function isSignalKind(kind: string): kind is AwaitSignalKind {
  return kind === "github_pr" || kind === "human_approval" || kind === "mock";
}

/**
 * @param awaitState - Source
 * @returns Shallow clone
 */
function cloneAwait(awaitState: AwaitState): AwaitState {
  return {
    ...awaitState,
    wakePayload: awaitState.wakePayload
      ? { ...awaitState.wakePayload }
      : null,
  };
}
