import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCustodyTriple, deriveCustodyMode } from "@mac/shared";
import { buildApp } from "../create-app.js";
import { createMemoryStore } from "../store/memory-store.js";
import { BallCustodyStore } from "./ball-custody-store.js";

test("hold sets custody triple: holder + active + no await", () => {
  const store = new BallCustodyStore();
  const projection = store.hold({
    subjectType: "thread",
    subjectId: "t1",
    holderId: "architect",
    holderKind: "cat",
  });
  assert.equal(projection.holderId, "architect");
  assert.equal(projection.holderKind, "cat");
  assert.equal(projection.mode, "active");
  assert.equal(projection.awaitState, null);
  assertCustodyTriple(projection);
  assert.equal(deriveCustodyMode("cat", null), "active");
});

test("wait parks the ball; mock wake resumes without cron UI", () => {
  const store = new BallCustodyStore();
  store.hold({
    subjectType: "feature",
    subjectId: "f1",
    holderId: "reviewer",
    holderKind: "cat",
  });
  const waiting = store.beginWait({
    subjectType: "feature",
    subjectId: "f1",
    signalKind: "human_approval",
    condition: "Operator approves JWT decision",
    expiresAt: null,
  });
  assert.equal(waiting.mode, "waiting");
  assert.equal(waiting.awaitState?.status, "waiting");
  assert.equal(waiting.awaitState?.signalKind, "human_approval");
  assertCustodyTriple(waiting);

  const woken = store.wake(waiting.awaitState!.id, { approved: true });
  assert.equal(woken.awaitState?.status, "woken");
  assert.equal(woken.mode, "active");
  assert.deepEqual(woken.awaitState?.wakePayload, { approved: true });
  assertCustodyTriple(woken);
});

test("expire and cancel clear waiting without becoming a timer UI", () => {
  const store = new BallCustodyStore();
  store.hold({
    subjectType: "thread",
    subjectId: "t2",
    holderId: "builder",
    holderKind: "cat",
  });
  const past = new Date(Date.now() - 60_000).toISOString();
  const waiting = store.beginWait({
    subjectType: "thread",
    subjectId: "t2",
    signalKind: "github_pr",
    condition: "PR #9 merged",
    expiresAt: past,
  });
  const expired = store.expireDue(new Date().toISOString());
  assert.equal(expired.length, 1);
  assert.equal(expired[0]!.awaitState?.status, "expired");
  assert.equal(expired[0]!.mode, "active");

  store.beginWait({
    subjectType: "thread",
    subjectId: "t2",
    signalKind: "mock",
    condition: "dev poke",
    expiresAt: null,
  });
  const open = store.project("thread", "t2");
  const cancelled = store.cancelAwait(open.awaitState!.id);
  assert.equal(cancelled.awaitState?.status, "cancelled");
  assert.equal(cancelled.mode, "active");
});

test("HTTP: list custody, wait, mock wake signal", async () => {
  const custody = new BallCustodyStore();
  custody.hold({
    subjectType: "thread",
    subjectId: "thread-http",
    holderId: "architect",
    holderKind: "cat",
  });

  const app = await buildApp({
    store: createMemoryStore(),
    storeKind: "memory",
    skipReconcile: true,
    disableSkills: true,
    disableTools: true,
    disableFeatures: true,
    disableEvidence: true,
    disableReceipts: true,
    custody,
  });

  const list = await app.inject({ method: "GET", url: "/api/custody" });
  assert.equal(list.statusCode, 200);
  const listed = list.json() as { projections: Array<{ subjectId: string }> };
  assert.ok(listed.projections.some((p) => p.subjectId === "thread-http"));

  const wait = await app.inject({
    method: "POST",
    url: "/api/custody/thread/thread-http/wait",
    headers: { "content-type": "application/json" },
    payload: {
      signalKind: "mock",
      condition: "mock wake for CI",
    },
  });
  assert.equal(wait.statusCode, 201);
  const waitBody = wait.json() as {
    projection: { mode: string; awaitState: { id: string; status: string } };
  };
  assert.equal(waitBody.projection.mode, "waiting");

  const wake = await app.inject({
    method: "POST",
    url: `/api/awaits/${waitBody.projection.awaitState.id}/wake`,
    headers: { "content-type": "application/json" },
    payload: { note: "ci signal" },
  });
  assert.equal(wake.statusCode, 200);
  const wakeBody = wake.json() as {
    projection: { mode: string; awaitState: { status: string } };
  };
  assert.equal(wakeBody.projection.awaitState.status, "woken");
  assert.equal(wakeBody.projection.mode, "active");

  await app.close();
});
