import type { ToolCatalogEntry } from "@mac/shared";
import {
  assertCanonicalTools,
  CANONICAL_TOOLS,
  listToolAspects,
} from "./canonical-tools.js";
import {
  executeThreadPostMessage,
  type ThreadPostMessageArgs,
  type ToolCallContext,
  type ToolExecuteResult,
  type ToolRuntimeDeps,
} from "./execute-thread-post-message.js";

/**
 * Canonical tool registry: Hub catalog + single execute path for MCP and callback bridge.
 */
export class ToolRegistry {
  private readonly byId = new Map<string, ToolCatalogEntry>();
  private readonly byMcpName = new Map<string, ToolCatalogEntry>();
  private readonly deps: ToolRuntimeDeps;

  /**
   * @param deps - store/hub for tool side effects
   * @param tools - Catalog entries (defaults to CANONICAL_TOOLS); uniqueness asserted
   */
  constructor(deps: ToolRuntimeDeps, tools: readonly ToolCatalogEntry[] = CANONICAL_TOOLS) {
    assertCanonicalTools(tools);
    this.deps = deps;
    for (const tool of tools) {
      this.byId.set(tool.id, tool);
      this.byMcpName.set(tool.mcpName, tool);
    }
  }

  /**
   * Hub browse list (tools with hub exposure).
   * @returns Catalog entries visible in Hub
   */
  listForHub(): ToolCatalogEntry[] {
    return [...this.byId.values()].filter((t) => t.exposure.includes("hub"));
  }

  /**
   * Aspect cut-list derived from registered tools.
   * @returns Unique aspect ids
   */
  aspects(): string[] {
    return listToolAspects([...this.byId.values()]);
  }

  /**
   * Lookup by semantic id.
   * @param id - e.g. thread.post_message
   */
  get(id: string): ToolCatalogEntry | undefined {
    return this.byId.get(id);
  }

  /**
   * Lookup by MCP wire name.
   * @param mcpName - e.g. thread_post_message
   */
  getByMcpName(mcpName: string): ToolCatalogEntry | undefined {
    return this.byMcpName.get(mcpName);
  }

  /**
   * Execute a canonical tool by semantic id (shared by MCP handlers + HTTP bridge).
   * @param toolId - Semantic id
   * @param ctx - Bound thread / catIds / optional family
   * @param args - Tool-specific args object
   * @returns Structured result for HTTP/MCP mapping
   */
  async execute(
    toolId: string,
    ctx: ToolCallContext,
    args: Record<string, unknown>,
  ): Promise<ToolExecuteResult> {
    const tool = this.byId.get(toolId);
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${toolId}`, code: "tool_not_found", status: 404 };
    }

    // Family allow-list when the caller declares a family (MCP client name / bridge header).
    if (ctx.family && !tool.annotations.families.includes(ctx.family)) {
      return {
        ok: false,
        error: `family ${ctx.family} not allowed for ${toolId}`,
        code: "tool_family_denied",
        status: 403,
      };
    }

    if (toolId === "thread.post_message") {
      const content = typeof args.content === "string" ? args.content : "";
      const authorId = typeof args.authorId === "string" ? args.authorId : undefined;
      const threadId = typeof args.threadId === "string" ? args.threadId : undefined;
      const body: ThreadPostMessageArgs = { content, authorId, threadId };
      return executeThreadPostMessage(this.deps, ctx, body);
    }

    return {
      ok: false,
      error: `No executor for tool: ${toolId}`,
      code: "tool_not_implemented",
      status: 501,
    };
  }
}
