import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildApp } from "../create-app.js";
import { createMemoryStore } from "../store/memory-store.js";
import { FrictionStore } from "./friction-store.js";

test("friction closes capture → verdict → assigned owner response", () => {
  const store = new FrictionStore({ dbPath: ":memory:" });
  const captured = store.capture({
    source: "operator",
    category: "ux",
    severity: "medium",
    summary: "Lead cat label disappeared",
    detail: "Windows select rendered blank until CSS overflow was removed.",
    reporterId: "operator",
    threadId: "thread-1",
  });
  assert.equal(captured.status, "captured");
  assert.equal(captured.events.length, 1);

  const evaluated = store.evaluate(captured.id, {
    outcome: "confirmed",
    rationale: "Reproduced in Windows Chromium.",
    evaluatorId: "reviewer",
    ownerId: "builder",
  });
  assert.equal(evaluated.status, "evaluated");
  assert.equal(evaluated.verdict?.ownerId, "builder");

  const responded = store.respond(captured.id, {
    disposition: "fixed",
    note: "Removed overflow clipping and added a regression guard.",
    responderId: "builder",
  });
  assert.equal(responded.status, "responded");
  assert.equal(responded.events.length, 3);
  assert.deepEqual(
    responded.events.map((event) => event.type),
    ["friction.captured", "friction.evaluated", "friction.responded"],
  );
});

test("lifecycle rejects bypass, repeat verdict, and non-owner response", () => {
  const store = new FrictionStore({ dbPath: ":memory:" });
  const captured = store.capture({
    source: "agent",
    category: "tooling",
    severity: "high",
    summary: "Tool call repeatedly fails",
    detail: "The same valid payload fails in three consecutive turns.",
    reporterId: "architect",
  });

  assert.throws(
    () =>
      store.respond(captured.id, {
        disposition: "planned",
        note: "Too early",
        responderId: "builder",
      }),
    /status captured/,
  );

  store.evaluate(captured.id, {
    outcome: "confirmed",
    rationale: "Failure reproduced.",
    evaluatorId: "reviewer",
    ownerId: "builder",
  });
  assert.throws(
    () =>
      store.evaluate(captured.id, {
        outcome: "wont_fix",
        rationale: "Second verdict",
        evaluatorId: "reviewer",
        ownerId: "builder",
      }),
    /status evaluated/,
  );
  assert.throws(
    () =>
      store.respond(captured.id, {
        disposition: "fixed",
        note: "Wrong actor",
        responderId: "architect",
      }),
    /assigned owner builder/,
  );
});

test("returned records are detached from the append-only store", () => {
  const store = new FrictionStore({ dbPath: ":memory:" });
  const captured = store.capture({
    source: "system",
    category: "workflow",
    severity: "low",
    summary: "Detached clone",
    detail: "Consumers must not mutate lifecycle history.",
    reporterId: "system",
  });
  captured.events.length = 0;
  captured.summary = "mutated";

  const stored = store.get(captured.id);
  assert.equal(stored?.events.length, 1);
  assert.equal(stored?.summary, "Detached clone");
});

test("SQLite projection and ordered events survive close and reopen", () => {
  const dbPath = join(tmpdir(), `mac-frictions-${randomUUID()}.sqlite`);
  const first = new FrictionStore({ dbPath });
  const captured = first.capture({
    source: "system",
    category: "workflow",
    severity: "medium",
    summary: "Durable lifecycle",
    detail: "The projection and audit trail must survive restart.",
    reporterId: "system",
  });
  first.evaluate(captured.id, {
    outcome: "confirmed",
    rationale: "Persistence is part of the milestone contract.",
    evaluatorId: "reviewer",
    ownerId: "builder",
  });
  first.close();

  const reopened = new FrictionStore({ dbPath });
  const restored = reopened.get(captured.id);
  assert.equal(restored?.status, "evaluated");
  assert.deepEqual(
    restored?.events.map((event) => event.type),
    ["friction.captured", "friction.evaluated"],
  );
  reopened.close();
});

test("HTTP friction ledger exposes the complete closed loop", async () => {
  const app = await buildApp({
    store: createMemoryStore(),
    storeKind: "memory",
    skipReconcile: true,
    disableSkills: true,
    disableTools: true,
    disableFeatures: true,
    disableEvidence: true,
    disableReceipts: true,
    disableCustody: true,
    disableApprovals: true,
    disableSettings: true,
    disableGithub: true,
    disablePlugins: true,
  });

  const capture = await app.inject({
    method: "POST",
    url: "/api/frictions",
    payload: {
      source: "operator",
      category: "routing",
      severity: "medium",
      summary: "Mention routed unexpectedly",
      detail: "The prompt landed on the wrong cat in the demo.",
      reporterId: "operator",
    },
  });
  assert.equal(capture.statusCode, 201);
  const id = (capture.json() as { friction: { id: string } }).friction.id;

  const verdict = await app.inject({
    method: "POST",
    url: `/api/frictions/${id}/verdict`,
    payload: {
      outcome: "confirmed",
      rationale: "Trace shows stale member selection.",
      evaluatorId: "reviewer",
      ownerId: "builder",
    },
  });
  assert.equal(verdict.statusCode, 200);

  const response = await app.inject({
    method: "POST",
    url: `/api/frictions/${id}/respond`,
    payload: {
      disposition: "planned",
      note: "Add a member-refresh guard next.",
      responderId: "builder",
    },
  });
  assert.equal(response.statusCode, 200);

  const list = await app.inject({
    method: "GET",
    url: "/api/frictions?status=responded",
  });
  assert.equal(list.statusCode, 200);
  const body = list.json() as {
    frictions: Array<{ id: string; events: unknown[] }>;
  };
  assert.equal(body.frictions[0]?.id, id);
  assert.equal(body.frictions[0]?.events.length, 3);

  const detail = await app.inject({
    method: "GET",
    url: `/api/frictions/${id}`,
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(
    (detail.json() as { friction: { events: unknown[] } }).friction.events.length,
    3,
  );

  const duplicateVerdict = await app.inject({
    method: "POST",
    url: `/api/frictions/${id}/verdict`,
    payload: {
      outcome: "wont_fix",
      rationale: "Illegal second verdict.",
      evaluatorId: "reviewer",
      ownerId: "builder",
    },
  });
  assert.equal(duplicateVerdict.statusCode, 409);

  const missing = await app.inject({
    method: "GET",
    url: "/api/frictions/missing",
  });
  assert.equal(missing.statusCode, 404);

  await app.close();
});
