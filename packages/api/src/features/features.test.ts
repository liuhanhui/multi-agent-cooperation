import assert from "node:assert/strict";
import { test } from "node:test";
import { canAdvanceFeatureStage, FEATURE_STAGES } from "@mac/shared";
import { createFakeAgentProvider } from "../agents/fake-provider.js";
import { createCatRegistry } from "../cats/load-cat-config.js";
import { buildApp } from "../create-app.js";
import { FeatureStore } from "./feature-store.js";
import { createMemoryStore } from "../store/memory-store.js";

test("SOP allows idea→spec→wip→review→done and forbids skip", () => {
  assert.equal(canAdvanceFeatureStage("idea", "spec"), true);
  assert.equal(canAdvanceFeatureStage("idea", "wip"), false);
  assert.equal(canAdvanceFeatureStage("review", "done"), true);
  assert.equal(canAdvanceFeatureStage("done", "idea"), false);
  assert.deepEqual([...FEATURE_STAGES], ["idea", "spec", "wip", "review", "done"]);
});

test("FeatureStore create advance bind and bulletin", () => {
  const store = new FeatureStore();
  const f = store.create({ title: "Login", summary: "auth", threadIds: [] });
  assert.equal(f.stage, "idea");
  const advanced = store.advanceStage(f.id, "spec");
  assert.equal(advanced.stage, "spec");
  assert.throws(() => store.advanceStage(f.id, "done"), /SOP forbids/);
  const board = store.bulletin();
  assert.equal(board.columns.find((c) => c.stage === "spec")?.features.length, 1);
});

test("Done path: create feature → advance → Hub bulletin → bind thread", async () => {
  const cats = createCatRegistry([
    {
      id: "architect",
      displayName: "Architect",
      role: "architecture",
      provider: "fake",
      systemSnippet: "sys",
    },
    {
      id: "builder",
      displayName: "Builder",
      role: "implementation",
      provider: "fake",
      systemSnippet: "sys-b",
    },
  ]);
  const store = createMemoryStore();
  const app = await buildApp({
    store,
    storeKind: "memory",
    agent: createFakeAgentProvider({ delayMs: 0 }),
    cats,
  });
  await app.listen({ port: 0, host: "127.0.0.1" });

  try {
    const threadRes = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "feat-login-thread" },
    });
    const threadId = (threadRes.json() as { thread: { id: string } }).thread.id;

    const created = await app.inject({
      method: "POST",
      url: "/api/features",
      payload: {
        title: "Login feature",
        summary: "Operator login",
        ballHolderId: "architect",
        threadIds: [threadId],
      },
    });
    assert.equal(created.statusCode, 201);
    const featureId = (created.json() as { feature: { id: string; stage: string } }).feature.id;
    assert.equal((created.json() as { feature: { stage: string } }).feature.stage, "idea");

    const advanced = await app.inject({
      method: "POST",
      url: `/api/features/${featureId}/advance`,
      payload: { stage: "spec" },
    });
    assert.equal(advanced.statusCode, 200);
    assert.equal((advanced.json() as { feature: { stage: string } }).feature.stage, "spec");

    const bulletin = await app.inject({ method: "GET", url: "/api/bulletin" });
    assert.equal(bulletin.statusCode, 200);
    const board = (
      bulletin.json() as {
        bulletin: { columns: Array<{ stage: string; features: Array<{ id: string }> }> };
      }
    ).bulletin;
    assert.ok(board.columns.find((c) => c.stage === "spec")?.features.some((f) => f.id === featureId));

    // Bind is already set at create; binding again is idempotent.
    const bound = await app.inject({
      method: "POST",
      url: `/api/features/${featureId}/bind-thread`,
      payload: { threadId },
    });
    assert.equal(bound.statusCode, 200);
    assert.deepEqual(
      (bound.json() as { feature: { threadIds: string[] } }).feature.threadIds,
      [threadId],
    );
  } finally {
    await app.close();
  }
});
