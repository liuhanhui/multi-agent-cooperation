import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolCallContext } from "./execute-thread-post-message.js";
import type { ToolRegistry } from "./tool-registry.js";

/**
 * Resolve per-call context for MCP tool handlers.
 * Stdio/demo servers pass a fixed context; tests inject per-family contexts.
 */
export type McpToolContextResolver = () => ToolCallContext;

/**
 * Build the first-party MAC MCP server from the canonical tool registry.
 * Registers each agent-exposed tool once under its mcpName (no dual exposure).
 * @param registry - Canonical ToolRegistry (shared with HTTP bridge)
 * @param resolveContext - Supplies thread/catIds/family for each tool call
 * @returns Connected-ready McpServer (caller attaches transport)
 */
export function createMacMcpServer(
  registry: ToolRegistry,
  resolveContext: McpToolContextResolver,
): McpServer {
  const server = new McpServer({
    name: "mac-platform",
    version: "0.0.1",
  });

  const postMessage = registry.get("thread.post_message");
  if (postMessage) {
    server.registerTool(
      postMessage.mcpName,
      {
        title: postMessage.title,
        description: postMessage.description,
        inputSchema: {
          content: z.string().describe("Message body to append"),
          authorId: z.string().optional().describe("Cat id within credential allow-list"),
          threadId: z.string().optional().describe("Must match bound thread when set"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: postMessage.annotations.idempotent,
          openWorldHint: false,
        },
      },
      async (args) => {
        const ctx = resolveContext();
        const result = await registry.execute("thread.post_message", ctx, args);
        if (!result.ok) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `${result.code}: ${result.error}` }],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                messageId: result.message.id,
                threadId: result.threadId,
                content: result.message.content,
                authorId: result.message.authorId,
              }),
            },
          ],
        };
      },
    );
  }

  return server;
}
