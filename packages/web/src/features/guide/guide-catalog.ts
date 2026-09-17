import firstRoomSource from "../../../../../guides/flows/first-room.yaml?guide";

export type GuideAdvance = "click" | "visible" | "input" | "confirm";

export interface GuideStep {
  id: string;
  target: string;
  title: string;
  tips: string;
  advance: GuideAdvance;
}

export interface GuideFlow {
  id: string;
  name: string;
  description: string;
  steps: GuideStep[];
}

const TARGET_PATTERN = /^[a-zA-Z0-9._-]+$/;
const ADVANCE_MODES = new Set<GuideAdvance>([
  "click",
  "visible",
  "input",
  "confirm",
]);

/**
 * Narrow an unknown YAML value to an object record.
 * @param value - Parsed YAML value
 * @returns Whether value is a non-array object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read one required non-empty string property.
 * @param source - Parsed object
 * @param key - Property name
 * @returns Trimmed string
 * @throws Error when the property is missing or empty
 */
function requiredString(
  source: Record<string, unknown>,
  key: string,
): string {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Guide field ${key} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Validate canonical guide data compiled from YAML for the browser engine.
 * @param source - Unknown build-time YAML value
 * @returns Valid terminal GuideFlow
 * @throws Error when schema or target contracts are invalid
 */
export function parseGuideFlow(source: unknown): GuideFlow {
  const parsed = source;
  if (!isRecord(parsed)) throw new Error("Guide flow must be an object");
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("Guide flow requires at least one step");
  }

  const steps = parsed.steps.map((value, index): GuideStep => {
    if (!isRecord(value)) throw new Error(`Guide step ${index} must be an object`);
    const target = requiredString(value, "target");
    const advance = requiredString(value, "advance");
    if (!TARGET_PATTERN.test(target)) {
      throw new Error(`Guide target is invalid: ${target}`);
    }
    if (!ADVANCE_MODES.has(advance as GuideAdvance)) {
      throw new Error(`Guide advance mode is invalid: ${advance}`);
    }
    return {
      id: requiredString(value, "id"),
      target,
      title: requiredString(value, "title"),
      tips: requiredString(value, "tips"),
      advance: advance as GuideAdvance,
    };
  });

  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw new Error("Guide step ids must be unique");
  }
  return {
    id: requiredString(parsed, "id"),
    name: requiredString(parsed, "name"),
    description: requiredString(parsed, "description"),
    steps,
  };
}

/** Canonical M26 first-run flow loaded from guides/flows/first-room.yaml. */
export const FIRST_ROOM_GUIDE = parseGuideFlow(firstRoomSource);
