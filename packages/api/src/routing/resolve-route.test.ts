import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatConfig, Thread } from "@mac/shared";
import { resolveMentionRoute } from "./resolve-route.js";

const cats: CatConfig[] = [
  {
    id: "architect",
    displayName: "Architect",
    role: "architecture",
    provider: "fake",
    systemSnippet: "sys-a",
  },
  {
    id: "reviewer",
    displayName: "Reviewer",
    role: "review",
    provider: "fake",
    systemSnippet: "sys-r",
  },
];

/**
 * Build a minimal thread fixture for routing tests.
 * @param overrides - Partial Thread fields to merge onto defaults
 */
function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    title: "t",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSeq: 0,
    memberIds: ["architect", "reviewer"],
    defaultCatId: "architect",
    ...overrides,
  };
}

test("no mention uses thread defaultCatId", () => {
  const route = resolveMentionRoute({
    content: "hello",
    thread: thread(),
    cats,
    strategy: "serial",
  });
  assert.equal(route.ok, true);
  if (!route.ok) return;
  assert.deepEqual(route.catIds, ["architect"]);
  assert.equal(route.prompt, "hello");
  assert.equal(route.strategy, "serial");
});

test("no mention prefers explicit catId over default", () => {
  const route = resolveMentionRoute({
    content: "hello",
    thread: thread(),
    cats,
    explicitCatId: "reviewer",
    strategy: "serial",
  });
  assert.equal(route.ok, true);
  if (!route.ok) return;
  assert.deepEqual(route.catIds, ["reviewer"]);
});

test("@A routes only to A", () => {
  const route = resolveMentionRoute({
    content: "@reviewer please check",
    thread: thread(),
    cats,
    strategy: "serial",
  });
  assert.equal(route.ok, true);
  if (!route.ok) return;
  assert.deepEqual(route.catIds, ["reviewer"]);
  assert.equal(route.prompt, "please check");
});

test("@A @B routes both in order (serial policy)", () => {
  const route = resolveMentionRoute({
    content: "@architect @reviewer please design",
    thread: thread(),
    cats,
    // Mentions win over explicitCatId so multi-target cannot be silently collapsed.
    explicitCatId: "reviewer",
    strategy: "serial",
  });
  assert.equal(route.ok, true);
  if (!route.ok) return;
  assert.deepEqual(route.catIds, ["architect", "reviewer"]);
  assert.equal(route.prompt, "please design");
});

test("unknown leading mention fails closed", () => {
  const route = resolveMentionRoute({
    content: "@ghost hi",
    thread: thread(),
    cats,
    strategy: "serial",
  });
  assert.equal(route.ok, false);
  if (route.ok) return;
  assert.match(route.error, /unknown/i);
});

test("missing default and no mention fails", () => {
  const route = resolveMentionRoute({
    content: "hello",
    thread: thread({ defaultCatId: null }),
    cats,
    strategy: "serial",
  });
  assert.equal(route.ok, false);
});

test("non-member target fails", () => {
  const route = resolveMentionRoute({
    content: "@reviewer hi",
    thread: thread({ memberIds: ["architect"], defaultCatId: "architect" }),
    cats,
    strategy: "serial",
  });
  assert.equal(route.ok, false);
  if (route.ok) return;
  assert.match(route.error, /not a member/i);
});

test("empty prompt after mentions fails", () => {
  const route = resolveMentionRoute({
    content: "@architect @reviewer",
    thread: thread(),
    cats,
    strategy: "serial",
  });
  assert.equal(route.ok, false);
  if (route.ok) return;
  assert.match(route.error, /message after @cat/i);
});

test("parallel strategy is rejected until implemented", () => {
  const route = resolveMentionRoute({
    content: "@architect @reviewer hi",
    thread: thread(),
    cats,
    strategy: "parallel",
  });
  assert.equal(route.ok, false);
  if (route.ok) return;
  assert.match(route.error, /parallel/i);
});

test("fallbackToDefaultCat=false requires @mention", () => {
  const route = resolveMentionRoute({
    content: "hello without mention",
    thread: thread(),
    cats,
    strategy: "serial",
    fallbackToDefaultCat: false,
  });
  assert.equal(route.ok, false);
  if (route.ok) return;
  assert.match(route.error, /fallbackToDefaultCat/);
});

test("maxTargets caps multi-mention fan-out", () => {
  const route = resolveMentionRoute({
    content: "@architect @reviewer please both",
    thread: thread(),
    cats,
    strategy: "serial",
    maxTargets: 1,
  });
  assert.equal(route.ok, false);
  if (route.ok) return;
  assert.match(route.error, /maxTargets/);
});
