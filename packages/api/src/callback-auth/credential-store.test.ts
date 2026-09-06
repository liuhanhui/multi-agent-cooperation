import assert from "node:assert/strict";
import { test } from "node:test";
import { InvocationCredentialStore, parseBearerToken } from "./credential-store.js";

test("parseBearerToken extracts token", () => {
  assert.equal(parseBearerToken("Bearer abc.def"), "abc.def");
  assert.equal(parseBearerToken("bearer xyz"), "xyz");
  assert.equal(parseBearerToken(undefined), null);
  assert.equal(parseBearerToken("Basic x"), null);
});

test("mint and verify succeeds within TTL", () => {
  const store = new InvocationCredentialStore();
  const cred = store.mint({
    queueEntryId: "q1",
    threadId: "t1",
    catIds: ["architect"],
    ttlMs: 60_000,
  });
  const result = store.verify(cred.token, "t1");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.credential.threadId, "t1");
  }
});

test("missing / invalid / expired are observable", () => {
  const store = new InvocationCredentialStore();
  assert.equal(store.verify(null).ok, false);
  if (!store.verify(null).ok) assert.equal(store.verify(null).reason, "missing");

  assert.equal(store.verify("nope").ok, false);
  const bad = store.verify("nope");
  if (!bad.ok) assert.equal(bad.reason, "invalid");

  const cred = store.mint({
    queueEntryId: "q1",
    threadId: "t1",
    catIds: ["architect"],
    ttlMs: 60_000,
  });
  store.expireNow(cred.token);
  const expired = store.verify(cred.token);
  assert.equal(expired.ok, false);
  if (!expired.ok) {
    assert.equal(expired.reason, "expired");
    assert.match(expired.detail ?? "", /expiredAt=/);
  }

  store.recordFailure("expired", "/api/callbacks/invocation", expired.ok ? undefined : expired.detail);
  assert.equal(store.listFailures().length, 1);
  assert.equal(store.listFailures()[0]?.reason, "expired");
});

test("thread_mismatch when path thread differs", () => {
  const store = new InvocationCredentialStore();
  const cred = store.mint({
    queueEntryId: "q1",
    threadId: "t1",
    catIds: ["architect"],
  });
  const result = store.verify(cred.token, "other-thread");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "thread_mismatch");
});
