import type { GuideFlow } from "./guide-catalog";

export const GUIDE_STORAGE_KEY = "mac.guide.progress.v1";

export type GuideStatus = "idle" | "active" | "completed";

export interface GuideProgress {
  flowId: string;
  status: GuideStatus;
  stepIndex: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GuideStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Create untouched progress for one guide flow.
 * @param flow - Guide whose first step becomes current
 * @returns Fresh idle progress
 */
export function createGuideProgress(flow: GuideFlow): GuideProgress {
  return {
    flowId: flow.id,
    status: "idle",
    stepIndex: 0,
    startedAt: null,
    completedAt: null,
  };
}

/**
 * Restore progress when it still matches the current flow contract.
 * @param storage - Browser-like key/value storage
 * @param flow - Current guide definition
 * @returns Valid saved progress or a fresh state
 */
export function readGuideProgress(
  storage: GuideStorage,
  flow: GuideFlow,
): GuideProgress {
  try {
    const raw = storage.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return createGuideProgress(flow);
    const parsed = JSON.parse(raw) as Partial<GuideProgress>;
    const validStatus =
      parsed.status === "idle" ||
      parsed.status === "active" ||
      parsed.status === "completed";
    const validIndex =
      Number.isInteger(parsed.stepIndex) &&
      Number(parsed.stepIndex) >= 0 &&
      Number(parsed.stepIndex) < flow.steps.length;
    if (parsed.flowId !== flow.id || !validStatus || !validIndex) {
      return createGuideProgress(flow);
    }
    return {
      flowId: flow.id,
      status: parsed.status as GuideStatus,
      stepIndex: Number(parsed.stepIndex),
      startedAt:
        typeof parsed.startedAt === "string" ? parsed.startedAt : null,
      completedAt:
        typeof parsed.completedAt === "string" ? parsed.completedAt : null,
    };
  } catch {
    return createGuideProgress(flow);
  }
}

/**
 * Persist one validated guide projection.
 * @param storage - Browser-like key/value storage
 * @param progress - Progress to serialize
 * @returns Nothing
 */
export function writeGuideProgress(
  storage: GuideStorage,
  progress: GuideProgress,
): void {
  try {
    storage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Onboarding presentation must never break product actions when storage is blocked.
  }
}

/**
 * Start, resume, or explicitly restart a guide.
 * @param flow - Current guide definition
 * @param current - Existing progress
 * @param now - Stable ISO timestamp
 * @param restart - Whether to discard current/completed position
 * @returns Active progress
 */
export function startGuide(
  flow: GuideFlow,
  current: GuideProgress,
  now: string,
  restart = false,
): GuideProgress {
  const reset = restart || current.status === "completed";
  return {
    flowId: flow.id,
    status: "active",
    stepIndex: reset ? 0 : current.stepIndex,
    startedAt: reset || !current.startedAt ? now : current.startedAt,
    completedAt: null,
  };
}

/**
 * Advance exactly one step and mark the final transition complete.
 * @param flow - Current guide definition
 * @param current - Active progress
 * @param now - Stable ISO timestamp
 * @returns Next or completed progress; inactive state is unchanged
 */
export function advanceGuide(
  flow: GuideFlow,
  current: GuideProgress,
  now: string,
): GuideProgress {
  if (current.status !== "active") return current;
  const isFinal = current.stepIndex >= flow.steps.length - 1;
  return isFinal
    ? { ...current, status: "completed", completedAt: now }
    : { ...current, stepIndex: current.stepIndex + 1 };
}

/**
 * Exit the active overlay while preserving its resumable position.
 * @param current - Existing progress
 * @returns Idle progress at the same step
 */
export function exitGuide(current: GuideProgress): GuideProgress {
  return current.status === "active"
    ? { ...current, status: "idle" }
    : current;
}
