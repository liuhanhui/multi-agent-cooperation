import assert from "node:assert/strict";
import { test } from "node:test";
import { APPROVAL_PRODUCER_CATALOG } from "@mac/shared";
import { buildApp } from "../create-app.js";
import { BallCustodyStore } from "../custody/ball-custody-store.js";
import { createMemoryStore } from "../store/memory-store.js";
import { ApprovalStore } from "./approval-store.js";

test("producer catalog has memory_write and handoff", () => {
  const store = new ApprovalStore();
  const catalog = store.listProducers();
  assert.equal(catalog.length, APPROVAL_PRODUCER_CATALOG.length);
  assert.ok(catalog.some((p) => p.id === "memory_write"));
  assert.ok(catalog.some((p) => p.id === "handoff"));
});

test("submit + decide approve/reject leaves ledger traceable to subject", () => {
  const store = new ApprovalStore();
  const pending = store.submit({
    producerId: "memory_write",
    subjectType: "lane",
    subjectId: "decision_lesson:auth.token",
    title: "Accept JWT lesson write",
    summary: "Overwrite existing decision_lesson for auth.token",
    payload: { lane: "decision_lesson", disposition: "accept" },
    requestedBy: "architect",
  });
  assert.equal(pending.status, "pending");
  assert.equal(pending.subjectId, "decision_lesson:auth.token");

  const approved = store.decide(pending.id, {
    choice: "approve",
    actorId: "operator",
    note: "Looks good",
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.decidedBy, "operator");
  assert.equal(approved.decisionNote, "Looks good");
  assert.ok(approved.decidedAt);

  const handoff = store.submit({
    producerId: "handoff",
    subjectType: "handoff",
    subjectId: "h-1",
    title: "Allow review handoff to reviewer",
    summary: "Five-piece handoff ready for cross-family review",
  });
  const rejected = store.decide(handoff.id, {
    choice: "reject",
    actorId: "operator",
    note: "Need more Open items",
  });
  assert.equal(rejected.status, "rejected");

  const ledger = store.list();
  assert.ok(ledger.some((r) => r.id === approved.id && r.subjectType === "lane"));
  assert.ok(ledger.some((r) => r.id === rejected.id && r.producerId === "handoff"));
});

test("approve wakes linked custody await", () => {
  const custody = new BallCustodyStore();
  custody.hold({
    subjectType: "thread",
    subjectId: "t-approve",
    holderId: "architect",
    holderKind: "cat",
  });
  const waiting = custody.beginWait({
    subjectType: "thread",
    subjectId: "t-approve",
    signalKind: "human_approval",
    condition: "Operator approves memory write",
  });
  const approvals = new ApprovalStore(custody);
  const req = approvals.submit({
    producerId: "memory_write",
    subjectType: "thread",
    subjectId: "t-approve",
    title: "Memory write gate",
    summary: "Needs human yes",
    awaitId: waiting.awaitState!.id,
  });
  approvals.decide(req.id, { choice: "approve", actorId: "operator" });
  const after = custody.project("thread", "t-approve");
  assert.equal(after.awaitState?.status, "woken");
  assert.equal(after.mode, "active");
});

test("HTTP: catalog, submit, decide on Approval Hub", async () => {
  const approvals = new ApprovalStore();
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
    approvals,
  });

  const catalog = await app.inject({ method: "GET", url: "/api/approvals/producers" });
  assert.equal(catalog.statusCode, 200);
  assert.ok(
    (catalog.json() as { producers: Array<{ id: string }> }).producers.length >= 2,
  );

  const submit = await app.inject({
    method: "POST",
    url: "/api/approvals",
    headers: { "content-type": "application/json" },
    payload: {
      producerId: "handoff",
      subjectType: "handoff",
      subjectId: "h-http",
      title: "Approve handoff",
      summary: "Traceable subject h-http",
    },
  });
  assert.equal(submit.statusCode, 201);
  const created = (submit.json() as { approval: { id: string; status: string } }).approval;
  assert.equal(created.status, "pending");

  const decide = await app.inject({
    method: "POST",
    url: `/api/approvals/${created.id}/decide`,
    headers: { "content-type": "application/json" },
    payload: { choice: "approve", actorId: "operator", note: "ship it" },
  });
  assert.equal(decide.statusCode, 200);
  const decided = (decide.json() as { approval: { status: string; subjectId: string } })
    .approval;
  assert.equal(decided.status, "approved");
  assert.equal(decided.subjectId, "h-http");

  await app.close();
});
