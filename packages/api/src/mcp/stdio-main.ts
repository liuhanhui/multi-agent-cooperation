/**
 * Stdio entry for the first-party MAC MCP server (M13).
 *
 * Env:
 * - MAC_API_BASE_URL — platform API (default http://127.0.0.1:4010)
 * - MAC_MCP_CALLBACK_TOKEN — bearer for /api/callbacks/tools/*
 * - MAC_MCP_FAMILY — CLI family label (claude-code | codex | antigravity)
 *
 * Tool handlers HTTP-bridge into the canonical registry on the API process
 * so non-embedded MCP clients share the same semantic tools.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const baseUrl = (process.env.MAC_API_BASE_URL ?? "http://127.0.0.1:4010").replace(/\/$/, "");
const token = process.env.MAC_MCP_CALLBACK_TOKEN ?? "";
const family = process.env.MAC_MCP_FAMILY ?? "claude-code";

/**
 * POST to the callback tool bridge.
 * @param toolId - Semantic tool id
 * @param args - Tool arguments
 * @returns Parsed JSON body or throws
 */
async function bridgeInvoke(
  toolId: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; body: unknown; status: number }> {
  if (!token) {
    throw new Error("MAC_MCP_CALLBACK_TOKEN is required for stdio MCP bridge");
  }
  const res = await fetch(`${baseUrl}/api/callbacks/tools/${encodeURIComponent(toolId)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-mac-family": family,
    },
    body: JSON.stringify(args),
  });
  const body = (await res.json().catch(() => ({}))) as unknown;
  return { ok: res.ok, body, status: res.status };
}

/**
 * Boot stdio MCP that proxies thread_post_message to the API callback bridge.
 * @returns Never resolves under normal stdio lifetime
 */
async function main(): Promise<void> {
  const server = new McpServer({ name: "mac-platform", version: "0.0.1" });

  server.registerTool(
    "thread_post_message",
    {
      title: "Post message to thread",
      description: "Append an assistant message into the invocation-bound thread.",
      inputSchema: {
        content: z.string(),
        authorId: z.string().optional(),
        threadId: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const bridged = await bridgeInvoke("thread.post_message", args);
      if (!bridged.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `bridge ${bridged.status}: ${JSON.stringify(bridged.body)}`,
            },
          ],
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(bridged.body) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
