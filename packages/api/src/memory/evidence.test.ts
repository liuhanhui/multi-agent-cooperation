import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "../agents/types.js";
import { createCatRegistry } from "../cats/load-cat-config.js";
import { buildApp } from "../create-app.js";
import { createMemoryStore } from "../store/memory-store.js";
import { buildFtsQuery, EvidenceStore } from "./evidence-store.js";
import { retrieveEvidenceForPrompt } from "./retrieve-evidence.js";

test("provenance.source is required on create", () => {
  const store = new EvidenceStore({ dbPath: ":memory:" });
  assert.throws(
    () =>
      store.create({
        title: "x",
        body: "y",
        provenance: { source: "", recordedAt: new Date().toISOString() },
      }),
    /provenance.source required/,
  );
  store.close();
});

test("BM25 finds jwt decision and misses unrelated cue", () => {
  const store = new EvidenceStore({ dbPath: ":memory:" });
  store.create({
    title: "Auth token choice",
    body: "We chose JWT over session cookies for the Hub API because CLIs are multi-device.",
    tags: ["decision", "auth"],
    provenance: {
      source: "decision",
      recordedAt: "2026-09-01T00:00:00.000Z",
      actorId: "architect",
    },
  });
  store.create({
    title: "Redis optional",
    body: "Smoke tests may use in-memory store instead of Redis.",
    tags: ["infra"],
    provenance: { source: "lesson", recordedAt: "2026-09-02T00:00:00.000Z" },
  });

  const hits = store.search("上次为什么选 JWT");
  assert.ok(hits.length >= 1);
  assert.match(hits[0]!.evidence.title, /Auth token/i);

  const miss = store.search("completely unrelated zebra nebula");
  assert.equal(miss.length, 0);
  store.close();
});

test("retrieve packs provenance and stays empty without hits", () => {
  const store = new EvidenceStore({ dbPath: ":memory:" });
  store.create({
    title: "Auth token choice",
    body: "We chose JWT for multi-device CLI clients.",
    tags: ["decision"],
    provenance: {
      source: "decision",
      recordedAt: "2026-09-01T00:00:00.000Z",
      actorId: "architect",
    },
  });

  const hit = retrieveEvidenceForPrompt(store, "why did we choose JWT last time");
  assert.ok(hit.injectedIds.length >= 1);
  assert.match(hit.injection, /\[Evidence — retrieved memory\]/);
  assert.match(hit.injection, /provenance: source=decision/);
  assert.match(hit.injection, /do not invent/i);

  const empty = retrieveEvidenceForPrompt(store, "zzzz-no-such-topic-qqqq");
  assert.deepEqual(empty.injectedIds, []);
  assert.equal(empty.injection, "");
  store.close();
});

test("buildFtsQuery drops stopwords and empties garbage", () => {
  assert.equal(buildFtsQuery("why why the"), null);
  assert.ok(buildFtsQuery("chose JWT auth")?.includes("jwt"));
});

/**
 * Recording fake agent that captures prompt + systemSnippet for Done-path asserts.
 */
function createRecordingAgent(seen: { prompt: string; systemSnippet: string }[]): AgentProvider {
  return {
    id: "fake-record",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      seen.push({
        prompt: input.prompt,
        systemSnippet: input.systemSnippet ?? "",
      });
      yield { type: "completed", text: "ok" };
    },
  };
}

test("Done path: write evidence → ask why → invoke injects; miss invents nothing", async () => {
  const cats = createCatRegistry([
    {
      id: "architect",
      displayName: "Architect",
      role: "architecture",
      provider: "fake",
      systemSnippet: "sys-architect",
    },
  ]);
  const seen: { prompt: string; systemSnippet: string }[] = [];
  const evidence = new EvidenceStore({ dbPath: ":memory:" });
  const app = await buildApp({
    store: createMemoryStore(),
    storeKind: "memory",
    agent: createRecordingAgent(seen),
    cats,
    evidence,
    disableSkills: true,
  });
  await app.listen({ port: 0, host: "127.0.0.1" });

  try {
    const createdEv = await app.inject({
      method: "POST",
      url: "/api/evidence",
      payload: {
        title: "Auth token choice",
        body: "We chose JWT over cookies for Hub API auth across CLI families.",
        tags: ["decision", "auth"],
        provenance: {
          source: "decision",
          recordedAt: "2026-09-01T12:00:00.000Z",
          actorId: "architect",
        },
      },
    });
    assert.equal(createdEv.statusCode, 201);

    const threadRes = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "memory-recall" },
    });
    const threadId = (threadRes.json() as { thread: { id: string } }).thread.id;

    const hitInvoke = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "@architect 上次为什么选 JWT？" },
    });
    assert.equal(hitInvoke.statusCode, 202);
    const hitBody = hitInvoke.json() as { evidenceInjected: string[] };
    assert.ok(hitBody.evidenceInjected.length >= 1);

    // Wait for fake agent turn to finish.
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(seen.some((s) => s.prompt.includes("[Evidence — retrieved memory]")));
    assert.ok(seen.some((s) => s.prompt.includes("chose JWT")));
    assert.ok(seen.some((s) => s.prompt.includes("[Operator]")));

    seen.length = 0;
    const missInvoke = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "@architect tell me about zebra-nebula-xyz" },
    });
    assert.equal(missInvoke.statusCode, 202);
    assert.deepEqual((missInvoke.json() as { evidenceInjected: string[] }).evidenceInjected, []);
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(seen.every((s) => !s.prompt.includes("[Evidence — retrieved memory]")));
  } finally {
    await app.close();
    evidence.close();
  }
});
