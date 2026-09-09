import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBlocksForPrompt } from "@mac/shared";
import { createFakeAgentProvider } from "../agents/fake-provider.js";
import { createCatRegistry } from "../cats/load-cat-config.js";
import { buildApp } from "../create-app.js";
import { createMemoryStore } from "../store/memory-store.js";

const demoCats = createCatRegistry([
  {
    id: "architect",
    displayName: "Architect",
    role: "architecture",
    provider: "fake-claude",
    systemSnippet: "sys-architect",
  },
  {
    id: "builder",
    displayName: "Builder",
    role: "implementation",
    provider: "fake-agy",
    systemSnippet: "sys-builder",
  },
]);

/**
 * Done path: agent checklist → Hub toggle → next invoke sees checked state in systemSnippet.
 */
test("checklist write-back is visible to the next cat invoke", async () => {
  const seenSnippets: string[] = [];
  const agent = {
    id: "spy",
    async *invoke(input: { systemSnippet?: string; prompt: string }) {
      seenSnippets.push(input.systemSnippet ?? "");
      yield { type: "completed" as const, text: `ok:${input.prompt}` };
    },
  };

  const store = createMemoryStore();
  const app = await buildApp({
    store,
    storeKind: "memory",
    agent,
    cats: demoCats,
  });
  await app.listen({ port: 0, host: "127.0.0.1" });

  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "m14-checklist" },
    });
    const threadId = (created.json() as { thread: { id: string } }).thread.id;

    const posted = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages`,
      payload: {
        role: "assistant",
        authorId: "builder",
        content: "Please confirm the login checklist.",
        blocks: [
          {
            type: "checklist",
            id: "login",
            title: "Login",
            items: [
              { id: "form", label: "Login form", checked: false },
              { id: "api", label: "Auth API", checked: false },
            ],
          },
        ],
      },
    });
    assert.equal(posted.statusCode, 201);
    const messageId = (posted.json() as { message: { id: string } }).message.id;

    const toggled = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/${messageId}/actions`,
      payload: {
        type: "checklist.toggle",
        blockId: "login",
        itemId: "form",
        checked: true,
      },
    });
    assert.equal(toggled.statusCode, 200);
    const updated = (
      toggled.json() as {
        message: {
          blocks: Array<{ type: string; items: Array<{ id: string; checked: boolean }> }>;
        };
      }
    ).message;
    const checklist = updated.blocks.find((b) => b.type === "checklist");
    assert.ok(checklist);
    assert.equal(checklist.items.find((i) => i.id === "form")?.checked, true);

    const history = await store.listMessages(threadId);
    assert.match(formatBlocksForPrompt(history), /\[x\] Login form/);

    const invoked = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "@architect continue after checklist" },
    });
    assert.equal(invoked.statusCode, 202);

    // Wait for fake agent turn to finish.
    await new Promise((r) => setTimeout(r, 80));
    assert.ok(seenSnippets.some((s) => s.includes("[x] Login form")));
    assert.ok(seenSnippets.some((s) => s.includes("Hub Actions")));
  } finally {
    await app.close();
  }
});

test("mac-blocks fence on completeMessage lifts structured blocks", async () => {
  const store = createMemoryStore();
  const thread = await store.createThread({ title: "fence" });
  const pending = await store.appendMessage({
    threadId: thread.id,
    role: "assistant",
    authorId: "builder",
    content: "",
    status: "pending",
  });
  const body = [
    "Plan ready.",
    "```mac-blocks",
    JSON.stringify([
      {
        type: "checklist",
        id: "c1",
        items: [{ id: "i1", label: "Ship", checked: false }],
      },
    ]),
    "```",
  ].join("\n");
  const completed = await store.completeMessage(pending.id, body);
  assert.equal(completed.content, "Plan ready.");
  assert.equal(completed.blocks?.[0]?.type, "checklist");
});

// Keep fake import referenced for tree-shaking clarity in parallel suites.
void createFakeAgentProvider;
