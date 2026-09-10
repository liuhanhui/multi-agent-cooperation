import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../../create-app.js";
import { createMemoryStore } from "../../store/memory-store.js";
import { EvidenceStore } from "../evidence-store.js";
import { WriteLaneService } from "./write-lane-service.js";

test("decision_lesson write + consume; conflict needs disposition", () => {
  const evidence = new EvidenceStore({ dbPath: ":memory:" });
  const lanes = new WriteLaneService(evidence);

  const first = lanes.write("decision_lesson", {
    title: "JWT choice",
    body: "Chose JWT for multi-device CLI auth.",
    subjectKey: "auth.token",
  });
  assert.equal(first.disposition, "accepted");
  assert.ok(first.evidenceId);

  const conflict = lanes.write("decision_lesson", {
    title: "JWT choice v2",
    body: "Reaffirm JWT; cookies rejected again.",
    subjectKey: "auth.token",
  });
  assert.ok(conflict.conflict);
  assert.match(conflict.reason, /disposition required/);

  const rejected = lanes.write("decision_lesson", {
    title: "JWT choice v2",
    body: "Reaffirm JWT; cookies rejected again.",
    subjectKey: "auth.token",
    disposition: "reject",
  });
  assert.equal(rejected.disposition, "rejected");
  assert.equal(evidence.get(first.evidenceId!)?.title, "JWT choice");

  const accepted = lanes.write("decision_lesson", {
    title: "JWT choice v2",
    body: "Reaffirm JWT; cookies rejected again.",
    subjectKey: "auth.token",
    disposition: "accept",
  });
  assert.equal(accepted.disposition, "accepted");
  assert.equal(accepted.supersededEvidenceId, first.evidenceId);

  const consumed = lanes.consume("why did we choose JWT auth");
  assert.ok(consumed.injectedIds.length >= 1);
  assert.match(consumed.injection, /JWT/);
  evidence.close();
});

test("profile lane validates subject and consumes", () => {
  const evidence = new EvidenceStore({ dbPath: ":memory:" });
  const lanes = new WriteLaneService(evidence);

  assert.throws(
    () =>
      lanes.write("profile", {
        title: "Bad",
        body: "prefers short diffs",
        subjectKey: "architect",
      }),
    /cat:\{id\}/,
  );

  const ok = lanes.write("profile", {
    title: "Architect style",
    body: "Prefers clear tradeoffs and small diffs.",
    subjectKey: "cat:architect",
  });
  assert.equal(ok.disposition, "accepted");

  const consumed = lanes.consume("architect prefers tradeoffs");
  assert.ok(consumed.injectedIds.includes(ok.evidenceId!));
  evidence.close();
});

test("event_summary write + consume", () => {
  const evidence = new EvidenceStore({ dbPath: ":memory:" });
  const lanes = new WriteLaneService(evidence);

  const ok = lanes.write("event_summary", {
    title: "Wave3 demo",
    body: "Shipped skills + tools + mission board in one Hub session.",
    subjectKey: "event:wave3-demo",
  });
  assert.equal(ok.disposition, "accepted");

  const consumed = lanes.consume("wave3 demo hub mission");
  assert.ok(consumed.injectedIds.includes(ok.evidenceId!));
  evidence.close();
});

test("HTTP lane write returns 409 then accept disposition", async () => {
  const evidence = new EvidenceStore({ dbPath: ":memory:" });
  const app = await buildApp({
    store: createMemoryStore(),
    storeKind: "memory",
    evidence,
    disableSkills: true,
    disableTools: true,
  });
  await app.listen({ port: 0, host: "127.0.0.1" });

  try {
    const lanes = await app.inject({ method: "GET", url: "/api/memory/lanes" });
    assert.equal(lanes.statusCode, 200);
    assert.deepEqual((lanes.json() as { lanes: string[] }).lanes, [
      "decision_lesson",
      "profile",
      "event_summary",
    ]);

    const first = await app.inject({
      method: "POST",
      url: "/api/memory/lanes/decision_lesson/write",
      payload: {
        title: "Redis optional",
        body: "Smoke tests may use memory store instead of Redis.",
        subjectKey: "infra.redis",
      },
    });
    assert.equal(first.statusCode, 201);

    const conflict = await app.inject({
      method: "POST",
      url: "/api/memory/lanes/decision_lesson/write",
      payload: {
        title: "Redis optional v2",
        body: "Confirm memory store remains valid for smoke.",
        subjectKey: "infra.redis",
      },
    });
    assert.equal(conflict.statusCode, 409);

    const accepted = await app.inject({
      method: "POST",
      url: "/api/memory/lanes/decision_lesson/write",
      payload: {
        title: "Redis optional v2",
        body: "Confirm memory store remains valid for smoke.",
        subjectKey: "infra.redis",
        disposition: "accept",
      },
    });
    assert.equal(accepted.statusCode, 201);
    assert.equal(
      (accepted.json() as { result: { disposition: string } }).result.disposition,
      "accepted",
    );
  } finally {
    await app.close();
    evidence.close();
  }
});
