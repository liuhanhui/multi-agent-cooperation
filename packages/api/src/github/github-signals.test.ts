import assert from "node:assert/strict";
import { test } from "node:test";
import { createCatRegistry } from "../cats/load-cat-config.js";
import { buildApp } from "../create-app.js";
import { createMemoryStore } from "../store/memory-store.js";
import { BallCustodyStore } from "../custody/ball-custody-store.js";
import { GithubBindingStore } from "./binding-store.js";
import { normalizeGithubWebhook } from "./normalize-webhook.js";
import { signGithubPayload, verifyGithubSignature } from "./verify-signature.js";

test("HMAC verify accepts matching signature and rejects tamper", () => {
  const secret = "test-secret";
  const raw = Buffer.from('{"action":"opened"}', "utf8");
  const sig = signGithubPayload(raw, secret);
  assert.equal(verifyGithubSignature(raw, sig, secret), true);
  assert.equal(verifyGithubSignature(raw, "sha256=deadbeef", secret), false);
  assert.equal(verifyGithubSignature(raw, sig, ""), false);
});

test("normalize pull_request extracts owner/repo/number", () => {
  const ingress = normalizeGithubWebhook("pull_request", "deliv-1", {
    action: "opened",
    pull_request: { number: 42, title: "Add M22" },
    repository: { full_name: "acme/mac", name: "mac", owner: { login: "acme" } },
  });
  assert.equal(ingress.ref?.owner, "acme");
  assert.equal(ingress.ref?.repo, "mac");
  assert.equal(ingress.ref?.number, 42);
  assert.equal(ingress.ref?.kind, "pr");
  assert.match(ingress.summary, /Add M22/);
});

test("binding + wait + simulate wakes await and posts thread note", async () => {
  const cats = createCatRegistry([
    {
      id: "architect",
      displayName: "Architect",
      role: "architecture",
      provider: "claude-code",
    },
  ]);
  const store = createMemoryStore();
  const custody = new BallCustodyStore();
  const bindings = new GithubBindingStore();
  const app = await buildApp({
    store,
    storeKind: "memory",
    cats,
    skipReconcile: true,
    disableSkills: true,
    disableTools: true,
    disableFeatures: true,
    disableEvidence: true,
    disableReceipts: true,
    disableApprovals: true,
    disableSettings: true,
    custody,
    githubBindings: bindings,
  });

  const thread = await store.createThread({
    title: "PR wait",
    memberIds: ["architect"],
    defaultCatId: "architect",
  });

  const wait = await app.inject({
    method: "POST",
    url: `/api/custody/thread/${thread.id}/wait`,
    headers: { "content-type": "application/json" },
    payload: {
      signalKind: "github_pr",
      condition: "PR #7 review approved",
      signalRef: { owner: "acme", repo: "mac", number: 7, kind: "pr" },
    },
  });
  assert.equal(wait.statusCode, 201);
  const awaitId = (
    wait.json() as { projection: { awaitState: { id: string } } }
  ).projection.awaitState.id;

  const bind = await app.inject({
    method: "POST",
    url: "/api/github/bindings",
    headers: { "content-type": "application/json" },
    payload: {
      threadId: thread.id,
      ref: { owner: "acme", repo: "mac", number: 7, kind: "pr" },
      awaitId,
    },
  });
  assert.equal(bind.statusCode, 201);

  const sim = await app.inject({
    method: "POST",
    url: "/api/github/signals/simulate",
    headers: { "content-type": "application/json" },
    payload: {
      event: "pull_request_review",
      action: "submitted",
      ref: { owner: "acme", repo: "mac", number: 7, kind: "pr" },
      summary: "approved by reviewer",
    },
  });
  assert.equal(sim.statusCode, 200);
  const result = (
    sim.json() as {
      result: { woken: boolean; threadId: string; messageId: string };
    }
  ).result;
  assert.equal(result.woken, true);
  assert.equal(result.threadId, thread.id);
  assert.ok(result.messageId);

  const projection = custody.project("thread", thread.id);
  assert.equal(projection.awaitState?.status, "woken");
  const messages = await store.listMessages(thread.id);
  assert.ok(messages.some((m) => m.authorId === "github" && m.content.includes("github")));

  await app.close();
});

test("POST /webhooks/github requires valid HMAC", async () => {
  const prev = process.env.MAC_GITHUB_WEBHOOK_SECRET;
  process.env.MAC_GITHUB_WEBHOOK_SECRET = "hook-secret";
  try {
    const store = createMemoryStore();
    const app = await buildApp({
      store,
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
    });

    const payload = {
      action: "opened",
      pull_request: { number: 1, title: "t" },
      repository: { full_name: "acme/mac", name: "mac", owner: { login: "acme" } },
    };
    const raw = Buffer.from(JSON.stringify(payload), "utf8");

    const bad = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-github-delivery": "d1",
        "x-hub-signature-256": "sha256=nope",
      },
      payload: raw,
    });
    assert.equal(bad.statusCode, 401);

    const good = await app.inject({
      method: "POST",
      url: "/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-github-delivery": "d2",
        "x-hub-signature-256": signGithubPayload(raw, "hook-secret"),
      },
      payload: raw,
    });
    assert.equal(good.statusCode, 200);

    await app.close();
  } finally {
    if (prev === undefined) delete process.env.MAC_GITHUB_WEBHOOK_SECRET;
    else process.env.MAC_GITHUB_WEBHOOK_SECRET = prev;
  }
});
