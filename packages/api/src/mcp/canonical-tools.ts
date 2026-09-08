import type { ToolCatalogEntry } from "@mac/shared";

/**
 * Canonical tool definitions — single source of truth for MCP + callback bridge + Hub.
 * Invariant: each `id` and each `mcpName` appears at most once (assertCanonicalTools).
 */
export const CANONICAL_TOOLS: readonly ToolCatalogEntry[] = [
  {
    id: "thread.post_message",
    mcpName: "thread_post_message",
    title: "Post message to thread",
    description:
      "Append an assistant message into the bound thread (invocation credential or explicit threadId).",
    exposure: ["hub", "agent"],
    annotations: {
      sideEffect: true,
      idempotent: false,
      families: ["claude-code", "codex", "antigravity"],
      aspect: "messaging",
    },
    inputSchema: {
      type: "object",
      required: ["content"],
      properties: {
        content: { type: "string", description: "Message body to append" },
        authorId: {
          type: "string",
          description: "Cat id; must be in credential.catIds when auth-bound",
        },
        threadId: {
          type: "string",
          description: "Optional override; defaults to credential.threadId",
        },
      },
    },
  },
] as const;

/**
 * Fail fast if two entries share a semantic id or MCP wire name (no dual exposure).
 * @param tools - Candidate catalog (defaults to CANONICAL_TOOLS)
 * @throws Error when ids or mcpNames collide
 */
export function assertCanonicalTools(tools: readonly ToolCatalogEntry[] = CANONICAL_TOOLS): void {
  const ids = new Set<string>();
  const mcpNames = new Set<string>();
  for (const tool of tools) {
    if (ids.has(tool.id)) {
      throw new Error(`Duplicate tool semantic id: ${tool.id}`);
    }
    if (mcpNames.has(tool.mcpName)) {
      throw new Error(`Duplicate MCP tool name (dual exposure): ${tool.mcpName}`);
    }
    ids.add(tool.id);
    mcpNames.add(tool.mcpName);
  }
}

/**
 * Aspect cut-list for governance docs / Hub summary.
 * @param tools - Catalog to project
 * @returns Unique aspects in catalog order of first appearance
 */
export function listToolAspects(
  tools: readonly ToolCatalogEntry[] = CANONICAL_TOOLS,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tool of tools) {
    if (!seen.has(tool.annotations.aspect)) {
      seen.add(tool.annotations.aspect);
      out.push(tool.annotations.aspect);
    }
  }
  return out;
}
