import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createCatRegistry } from "../cats/load-cat-config.js";
import { buildApp } from "../create-app.js";
import { createMemoryStore } from "../store/memory-store.js";
import { ThreadHub } from "../ws/thread-hub.js";
import { PresentService } from "./present-service.js";
import { PresentStore } from "./present-store.js";

const cats = createCatRegistry([
  {
    id: "architect",
    displayName: "Architect",
    role: "design",
    provider: "fake",
  },
]);

/**
 * Build a deterministic in-memory Present loop for lifecycle tests.
 * @param nowRef - Mutable clock holder
 * @returns Service, ledger, and thread store
 */
async function createFixture(nowRef: { value: Date }) {
  const store = createMemoryStore();
  const thread = await store.createThread({
    title: "quiet room",
    memberIds: ["architect"],
    defaultCatId: "architect",
  });
  const basis = await store.appendMessage({
    threadId: thread.id,
    role: "user",
    authorId: "operator",
    content: "Let us pause here.",
    status: "completed",
  });
  nowRef.value = new Date(Date.parse(basis.updatedAt) + 31 * 60_000);
  const ledger = new PresentStore({
    dbPath: ":memory:",
    catIds: ["architect"],
  });
  const service = new PresentService({
    store,
    hub: new ThreadHub(),
    presents: ledger,
    cats,
    now: () => nowRef.value,
  });
  return { store, ledger, service, basis };
}

test("Present is opt-in, delivers once, and stops immediately when disabled", async () => {
  const nowRef = { value: new Date("2026-09-17T08:00:00.000Z") };
  const { store, ledger, service } = await createFixture(nowRef);
  assert.equal((await service.tick()).outcome, "skipped");

  service.updatePolicy({
    enabled: true,
    dailyBudgetPerCat: 2,
    cooldownMinutes: 60,
  });
  const delivered = await service.tick();
  assert.equal(delivered.outcome, "delivered");
  const thread = (await store.listThreads())[0];
  const messages = await store.listMessages(thread.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.authorId, "architect");

  service.updatePolicy({ enabled: false });
  nowRef.value = new Date("2026-09-17T10:00:00.000Z");
  const disabled = await service.tick();
  assert.deepEqual(disabled, { outcome: "skipped", reason: "disabled" });
  ledger.close();
});

test("one basis, cooldown, and daily budget bound repeated checks", async () => {
  const nowRef = { value: new Date("2026-09-17T08:00:00.000Z") };
  const { store, ledger, service } = await createFixture(nowRef);
  service.updatePolicy({
    enabled: true,
    dailyBudgetPerCat: 1,
    cooldownMinutes: 60,
  });
  assert.equal((await service.tick()).outcome, "delivered");
  assert.deepEqual(await service.tick(), {
    outcome: "skipped",
    reason: "already_present",
  });

  const thread = await store.createThread({
    title: "another quiet room",
    memberIds: ["architect"],
    defaultCatId: "architect",
  });
  await store.appendMessage({
    threadId: thread.id,
    role: "user",
    authorId: "operator",
    content: "Pause this too.",
    status: "completed",
  });
  assert.deepEqual(await service.tick(), {
    outcome: "skipped",
    reason: "budget_exhausted",
  });
  service.updatePolicy({ dailyBudgetPerCat: 2 });
  assert.deepEqual(await service.tick(), {
    outcome: "skipped",
    reason: "cooldown",
  });
  ledger.close();
});

test("idle and per-cat switches prevent proactive delivery", async () => {
  const nowRef = { value: new Date("2026-09-17T08:00:00.000Z") };
  const { basis, ledger, service } = await createFixture(nowRef);
  nowRef.value = new Date(basis.updatedAt);
  service.updatePolicy({ enabled: true, idleMinutes: 30 });
  assert.deepEqual(await service.tick(), {
    outcome: "skipped",
    reason: "not_idle",
  });

  service.updatePolicy({
    cats: [{ catId: "architect", enabled: false }],
  });
  nowRef.value = new Date(Date.parse(basis.updatedAt) + 31 * 60_000);
  assert.deepEqual(await service.tick(), {
    outcome: "skipped",
    reason: "no_enabled_cat",
  });
  ledger.close();
});

test("SQLite preserves policy and delivery ledger across reopen", () => {
  const dbPath = join(tmpdir(), `mac-present-${randomUUID()}.sqlite`);
  const first = new PresentStore({ dbPath, catIds: ["architect"] });
  first.updatePolicy(
    { enabled: true, dailyBudgetPerCat: 1 },
    "2026-09-17T08:00:00.000Z",
  );
  const reservation = first.reserve({
    threadId: "thread-1",
    catId: "architect",
    basisMessageId: "message-basis-1",
    content: "hello",
    now: "2026-09-17T08:01:00.000Z",
  });
  assert.equal(reservation.ok, true);
  if (reservation.ok) {
    first.settle(
      reservation.delivery.id,
      { status: "delivered", messageId: "message-1" },
      "2026-09-17T08:01:01.000Z",
    );
  }
  first.close();

  const reopened = new PresentStore({ dbPath, catIds: ["architect"] });
  assert.equal(reopened.getPolicy().enabled, true);
  assert.equal(reopened.list()[0]?.status, "delivered");
  assert.equal(reopened.usage("2026-09-17").architect, 1);
  reopened.close();
});

test("HTTP manual tick cannot bypass the idle policy", async () => {
  const app = await buildApp({
    store: createMemoryStore(),
    storeKind: "memory",
    cats,
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
    disableFrictions: true,
    presentDbPath: ":memory:",
    disablePresentScheduler: true,
  });
  const threadResponse = await app.inject({
    method: "POST",
    url: "/api/threads",
    payload: { title: "present demo" },
  });
  const threadId = (threadResponse.json() as { thread: { id: string } }).thread.id;
  await app.inject({
    method: "POST",
    url: `/api/threads/${threadId}/messages`,
    payload: { content: "Fresh operator activity" },
  });

  const policy = await app.inject({
    method: "PATCH",
    url: "/api/presents/policy",
    payload: {
      enabled: true,
      dailyBudgetPerCat: 1,
      cooldownMinutes: 60,
      idleMinutes: 30,
    },
  });
  assert.equal(policy.statusCode, 200);

  const tick = await app.inject({
    method: "POST",
    url: "/api/presents/tick",
    payload: { threadId },
  });
  assert.equal(tick.statusCode, 200);
  assert.equal(
    (tick.json() as { result: { outcome: string } }).result.outcome,
    "skipped",
  );

  const messages = await app.inject({
    method: "GET",
    url: `/api/threads/${threadId}/messages`,
  });
  assert.equal(
    (messages.json() as { messages: unknown[] }).messages.length,
    1,
  );
  await app.close();
});
