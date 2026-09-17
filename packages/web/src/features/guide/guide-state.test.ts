import assert from "node:assert/strict";
import { test } from "node:test";
import type { GuideFlow } from "./guide-catalog";
import {
  GUIDE_STORAGE_KEY,
  advanceGuide,
  createGuideProgress,
  exitGuide,
  readGuideProgress,
  startGuide,
  writeGuideProgress,
  type GuideStorage,
} from "./guide-state";

const FLOW: GuideFlow = {
  id: "test-flow",
  name: "Test",
  description: "Test flow",
  steps: [
    {
      id: "one",
      target: "test.one",
      title: "One",
      tips: "First",
      advance: "visible",
    },
    {
      id: "two",
      target: "test.two",
      title: "Two",
      tips: "Second",
      advance: "click",
    },
  ],
};

/**
 * Create deterministic storage for guide persistence tests.
 * @returns Browser-like storage backed by a Map
 */
function createStorage(): GuideStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

test("guide advances once per step and completes only after the final action", () => {
  const idle = createGuideProgress(FLOW);
  const active = startGuide(FLOW, idle, "2026-09-17T00:00:00.000Z");
  const second = advanceGuide(FLOW, active, "2026-09-17T00:00:01.000Z");
  const complete = advanceGuide(FLOW, second, "2026-09-17T00:00:02.000Z");

  assert.equal(active.status, "active");
  assert.equal(second.stepIndex, 1);
  assert.equal(second.status, "active");
  assert.equal(complete.status, "completed");
  assert.equal(complete.completedAt, "2026-09-17T00:00:02.000Z");
});

test("exit preserves position and start resumes it", () => {
  const active = startGuide(
    FLOW,
    createGuideProgress(FLOW),
    "2026-09-17T00:00:00.000Z",
  );
  const second = advanceGuide(FLOW, active, "2026-09-17T00:00:01.000Z");
  const exited = exitGuide(second);
  const resumed = startGuide(FLOW, exited, "2026-09-17T00:00:02.000Z");

  assert.equal(exited.status, "idle");
  assert.equal(resumed.status, "active");
  assert.equal(resumed.stepIndex, 1);
  assert.equal(resumed.startedAt, active.startedAt);
});

test("valid progress round-trips and malformed progress starts fresh", () => {
  const storage = createStorage();
  const active = startGuide(
    FLOW,
    createGuideProgress(FLOW),
    "2026-09-17T00:00:00.000Z",
  );
  writeGuideProgress(storage, active);
  assert.deepEqual(readGuideProgress(storage, FLOW), active);

  storage.setItem(GUIDE_STORAGE_KEY, '{"flowId":"wrong","stepIndex":99}');
  assert.deepEqual(readGuideProgress(storage, FLOW), createGuideProgress(FLOW));
});

test("blocked browser storage cannot break guide or product actions", () => {
  const blocked: GuideStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readGuideProgress(blocked, FLOW), createGuideProgress(FLOW));
  assert.doesNotThrow(() =>
    writeGuideProgress(blocked, createGuideProgress(FLOW)),
  );
});
