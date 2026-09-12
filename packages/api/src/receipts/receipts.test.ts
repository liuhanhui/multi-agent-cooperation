import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canOverwriteCompletedContent,
  freshnessVerdict,
} from "@mac/shared";
import { buildApp } from "../create-app.js";
import { createMemoryStore } from "../store/memory-store.js";
import { ReceiptStore } from "./receipt-store.js";

test("multi-target batch: one receipt per target; deliver freezes content", () => {
  const store = new ReceiptStore();
  const { batch, receipts } = store.createBatch({
    threadId: "t1",
    targetCatIds: ["architect", "coder", "architect"],
    queueEntryId: "q1",
  });
  assert.equal(batch.targetCatIds.length, 2);
  assert.equal(receipts.length, 2);
  assert.ok(store.getBatchByQueueEntry("q1"));

  const a = store.markDelivered(batch.id, "architect", "m-a", "Architect says JWT.");
  assert.equal(a.status, "delivered");
  assert.equal(a.completedContent, "Architect says JWT.");
  assert.equal(canOverwriteCompletedContent(a), false);

  const c = store.markDelivered(batch.id, "coder", "m-c", "Coder implements.");
  assert.equal(c.status, "delivered");

  const listed = store.listReceipts(batch.id);
  assert.equal(listed.length, 2);
  assert.equal(listed[0]!.targetCatId, "architect");
  assert.equal(listed[1]!.targetCatId, "coder");
});

test("late supplement does not overwrite completedContent", () => {
  const store = new ReceiptStore();
  const { batch, receipts } = store.createBatch({
    threadId: "t1",
    targetCatIds: ["architect"],
  });
  const delivered = store.markDelivered(
    batch.id,
    "architect",
    "m1",
    "Original completed body",
  );
  const frozen = delivered.completedContent;

  const after = store.appendSupplement(receipts[0]!.id, "Late thought: maybe cookies?");
  assert.equal(after.completedContent, frozen);
  assert.equal(after.supplements.length, 1);
  assert.equal(after.supplements[0]!.authoritative, false);
  assert.match(after.supplements[0]!.content, /cookies/);

  assert.throws(
    () => store.tryOverwriteCompleted(receipts[0]!.id, "Hijack body"),
    /stale|authoritative|supplement/,
  );

  const verdict = freshnessVerdict(after, "Hijack body");
  assert.equal(verdict.ok, false);
});

test("HTTP: list thread receipts + append supplement + ack", async () => {
  const receipts = new ReceiptStore();
  const { batch, receipts: created } = receipts.createBatch({
    threadId: "thread-http",
    targetCatIds: ["cat-a", "cat-b"],
  });
  receipts.markDelivered(batch.id, "cat-a", "ma", "A done");
  receipts.markDelivered(batch.id, "cat-b", "mb", "B done");

  const app = await buildApp({
    store: createMemoryStore(),
    storeKind: "memory",
    skipReconcile: true,
    disableSkills: true,
    disableTools: true,
    disableFeatures: true,
    disableEvidence: true,
    receipts,
  });

  const list = await app.inject({
    method: "GET",
    url: "/api/threads/thread-http/receipts",
  });
  assert.equal(list.statusCode, 200);
  const body = list.json() as {
    batches: Array<{ receipts: Array<{ id: string; completedContent: string | null }> }>;
  };
  assert.equal(body.batches.length, 1);
  assert.equal(body.batches[0]!.receipts.length, 2);

  const receiptId = created[0]!.id;
  const supp = await app.inject({
    method: "POST",
    url: `/api/receipts/${receiptId}/supplements`,
    headers: { "content-type": "application/json" },
    payload: { content: "Appendix note" },
  });
  assert.equal(supp.statusCode, 201);
  const suppBody = supp.json() as {
    receipt: { completedContent: string | null; supplements: Array<{ content: string }> };
  };
  assert.equal(suppBody.receipt.completedContent, "A done");
  assert.equal(suppBody.receipt.supplements.at(-1)?.content, "Appendix note");

  const ack = await app.inject({
    method: "POST",
    url: `/api/receipts/${receiptId}/ack`,
  });
  assert.equal(ack.statusCode, 200);
  assert.equal((ack.json() as { receipt: { status: string } }).receipt.status, "acked");

  await app.close();
});
