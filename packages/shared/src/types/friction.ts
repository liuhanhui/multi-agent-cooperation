/**
 * Harness friction → verdict → owner-response contracts (M25).
 * The append-only event trail is the audit source; status is its projection.
 */

export type FrictionSource = "operator" | "agent" | "system";
export type FrictionCategory =
  | "tooling"
  | "routing"
  | "memory"
  | "workflow"
  | "ux"
  | "other";
export type FrictionSeverity = "low" | "medium" | "high";
export type FrictionStatus = "captured" | "evaluated" | "responded";
export type FrictionVerdictOutcome =
  | "confirmed"
  | "not_reproducible"
  | "duplicate"
  | "wont_fix";
export type OwnerResponseDisposition =
  | "planned"
  | "fixed"
  | "declined"
  | "escalated";

export interface FrictionVerdict {
  outcome: FrictionVerdictOutcome;
  rationale: string;
  evaluatorId: string;
  ownerId: string;
  evaluatedAt: string;
}

export interface FrictionOwnerResponse {
  disposition: OwnerResponseDisposition;
  note: string;
  responderId: string;
  respondedAt: string;
}

export type FrictionEvent =
  | {
      id: string;
      type: "friction.captured";
      actorId: string;
      at: string;
    }
  | {
      id: string;
      type: "friction.evaluated";
      actorId: string;
      at: string;
      outcome: FrictionVerdictOutcome;
      ownerId: string;
    }
  | {
      id: string;
      type: "friction.responded";
      actorId: string;
      at: string;
      disposition: OwnerResponseDisposition;
    };

export interface FrictionRecord {
  id: string;
  source: FrictionSource;
  category: FrictionCategory;
  severity: FrictionSeverity;
  summary: string;
  detail: string;
  reporterId: string;
  threadId: string | null;
  status: FrictionStatus;
  verdict: FrictionVerdict | null;
  ownerResponse: FrictionOwnerResponse | null;
  events: FrictionEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface CaptureFrictionInput {
  source: FrictionSource;
  category: FrictionCategory;
  severity: FrictionSeverity;
  summary: string;
  detail: string;
  reporterId: string;
  threadId?: string | null;
}

export interface EvaluateFrictionInput {
  outcome: FrictionVerdictOutcome;
  rationale: string;
  evaluatorId: string;
  ownerId: string;
}

export interface RespondFrictionInput {
  disposition: OwnerResponseDisposition;
  note: string;
  responderId: string;
}

/**
 * Assert the lifecycle projection is coherent with its terminal fields.
 * @param friction - Record to validate
 * @throws Error when verdict/response fields contradict status
 */
export function assertFrictionLifecycle(friction: FrictionRecord): void {
  const expectedEvents: FrictionEvent["type"][] =
    friction.status === "captured"
      ? ["friction.captured"]
      : friction.status === "evaluated"
        ? ["friction.captured", "friction.evaluated"]
        : [
            "friction.captured",
            "friction.evaluated",
            "friction.responded",
          ];
  if (
    friction.events.length !== expectedEvents.length ||
    friction.events.some(
      (event, index) => event.type !== expectedEvents[index],
    )
  ) {
    throw new Error(
      `${friction.status} friction has an invalid lifecycle event sequence`,
    );
  }
  if (friction.status === "captured") {
    if (friction.verdict || friction.ownerResponse) {
      throw new Error("captured friction cannot have verdict or owner response");
    }
    return;
  }
  if (!friction.verdict) {
    throw new Error(`${friction.status} friction requires a verdict`);
  }
  if (friction.status === "evaluated" && friction.ownerResponse) {
    throw new Error("evaluated friction cannot have owner response");
  }
  if (friction.status === "responded" && !friction.ownerResponse) {
    throw new Error("responded friction requires owner response");
  }
}
