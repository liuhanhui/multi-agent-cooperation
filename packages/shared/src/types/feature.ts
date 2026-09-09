/**
 * Lightweight feature lifecycle for Mission Hub (M15).
 * Stages follow a thin SOP: idea → spec → wip → review → done.
 */

export type FeatureStage = "idea" | "spec" | "wip" | "review" | "done";

/** Ordered SOP stages (bulletin columns). */
export const FEATURE_STAGES: readonly FeatureStage[] = [
  "idea",
  "spec",
  "wip",
  "review",
  "done",
] as const;

/**
 * Allowed forward/back transitions (no Risk-Routed graph — keep portable).
 * Key = current stage; value = stages that may be advanced to.
 */
export const FEATURE_STAGE_TRANSITIONS: Readonly<Record<FeatureStage, readonly FeatureStage[]>> = {
  idea: ["spec"],
  spec: ["wip", "idea"],
  wip: ["review", "spec"],
  review: ["done", "wip"],
  done: [],
};

export interface Feature {
  id: string;
  title: string;
  /** Short description for Hub / bulletin. */
  summary: string;
  stage: FeatureStage;
  /** Cat id holding the ball; null when unassigned. */
  ballHolderId: string | null;
  /** Threads bound to this feature (at least one for Done demos). */
  threadIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Bulletin board projection: features grouped by stage. */
export interface BulletinBoard {
  stages: FeatureStage[];
  columns: Array<{ stage: FeatureStage; features: Feature[] }>;
}

/**
 * Whether advancing from `from` to `to` is allowed by the light SOP.
 * @param from - Current stage
 * @param to - Target stage
 * @returns true when the edge exists
 */
export function canAdvanceFeatureStage(from: FeatureStage, to: FeatureStage): boolean {
  if (from === to) return false;
  return FEATURE_STAGE_TRANSITIONS[from].includes(to);
}
