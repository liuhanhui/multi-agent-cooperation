import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ToolCatalogEntry } from "@mac/shared";
import { createFakeAgentProvider } from "../agents/fake-provider.js";
import { createCatRegistry } from "../cats/load-cat-config.js";
import { buildApp } from "../create-app.js";
import {
  assertCanonicalTools,
  CANONICAL_TOOLS,
  listToolAspects,
} from "./canonical-tools.js";
import { createMacMcpServer } from "./create-mcp-server.js";
import { ToolRegistry } from "./tool-registry.js";
import { createMemoryStore } from "../store/memory-store.js";
import { ThreadHub } from "../ws/thread-hub.js";

const demoCats = createCatRegistry([
  {
    id: "architect",
    displayName: "Architect",
    role: "architecture",
    provider: "fake-claude",
    systemSnippet: "sys-architect",
  },
  {
    id: "reviewer",
    displayName: "Reviewer",
    role: "review",
    provider: "fake-codex",
    systemSnippet: "sys-reviewer",
  },
]);

/**
 * Assert catalog uniqueness invariants hold for shipped tools.
 */
test("canonical tools have unique id and mcpName", () => {
  assert.doesNotThrow(() => assertCanonicalTools());
  assert.equal(CANONICAL_TOOLS.length >= 1, true);
  assert.ok(listToolAspects().includes("messaging"));
});

/**
 * Reject dual exposure of the same MCP wire name.
 */
test("assertCanonicalTools rejects duplicate mcpName", () => {
  const dup: ToolCatalogEntry[] = [
    CANONICAL_TOOLS[0]!,
    { ...CANONICAL_TOOLS[0]!, id: "other.semantic" },
  ];
  assert.throws(() => assertCanonicalTools(dup), /dual exposure|Duplicate MCP/);
});

/**
 * Two CLI families call the same MCP tool and both messages land on the thread.
 */
test("two families call thread_post_message via MCP", async () => {
  const store = createMemoryStore();
  const hub = new ThreadHub();
  const thread = await store.createThread({ title: "mcp-dual-family" });
  const registry = new ToolRegistry({ store, hub });

  /**
   * Connect one MCP client for a family, call the tool, then close.
   * @param family - CLI family label stored on ToolCallContext
   * @param authorId - Message author (must be allowed)
   * @param content - Body text
   */
  async function familyCall(family: string, authorId: string, content: string): Promise<void> {
    let ctxFamily = family;
    const server = createMacMcpServer(registry, () => ({
      threadId: thread.id,
      catIds: ["architect", "reviewer"],
      family: ctxFamily,
    }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: `${family}-client`, version: "0.0.1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const listed = await client.listTools();
    assert.ok(listed.tools.some((t) => t.name === "thread_post_message"));

    const result = await client.callTool({
      name: "thread_post_message",
      arguments: { content, authorId },
    });
    assert.equal(result.isError ?? false, false);

    await client.close();
    await server.close();
  }

  await familyCall("claude-code", "architect", "hello from claude family via MCP");
  await familyCall("codex", "reviewer", "hello from codex family via MCP");

  const messages = await store.listMessages(thread.id);
  assert.ok(messages.some((m) => m.content.includes("claude family")));
  assert.ok(messages.some((m) => m.content.includes("codex family")));
});

/**
 * Hub catalog + callback bridge share the same registry id.
 */
test("Hub lists tools and callback bridge posts via thread.post_message", async () => {
  const store = createMemoryStore();
  const app = await buildApp({
    store,
    storeKind: "memory",
    agent: createFakeAgentProvider({ delayMs: 0 }),
    cats: demoCats,
  });
  await app.listen({ port: 0, host: "127.0.0.1" });

  try {
    const catalog = await app.inject({ method: "GET", url: "/api/tools" });
    assert.equal(catalog.statusCode, 200);
    const body = catalog.json() as { tools: ToolCatalogEntry[]; aspects: string[] };
    assert.ok(body.aspects.includes("messaging"));
    assert.ok(body.tools.some((t) => t.id === "thread.post_message"));
    assert.ok(body.tools.every((t) => t.mcpName && t.annotations.aspect));

    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { title: "bridge" },
    });
    const threadId = (created.json() as { thread: { id: string } }).thread.id;

    const invoked = await app.inject({
      method: "POST",
      url: `/api/threads/${threadId}/messages/invoke`,
      payload: { content: "@architect use tools" },
    });
    assert.equal(invoked.statusCode, 202);
    const { callbackToken } = invoked.json() as { callbackToken?: string };
    assert.ok(callbackToken);

    const bridged = await app.inject({
      method: "POST",
      url: "/api/callbacks/tools/thread.post_message",
      headers: {
        authorization: `Bearer ${callbackToken}`,
        "x-mac-family": "codex",
      },
      payload: { content: "bridge post from codex", authorId: "architect" },
    });
    assert.equal(bridged.statusCode, 201, bridged.body);

    const history = await app.inject({
      method: "GET",
      url: `/api/threads/${threadId}/messages`,
    });
    const messages = (history.json() as { messages: { content: string }[] }).messages;
    assert.ok(messages.some((m) => m.content === "bridge post from codex"));
  } finally {
    await app.close();
  }
});
