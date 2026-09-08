import type { Message } from "@mac/shared";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";

/**
 * Auth/context bound to a tool call (from callback credential or MCP session).
 */
export interface ToolCallContext {
  threadId: string;
  catIds: string[];
  /** Optional queue entry for telemetry correlation. */
  queueEntryId?: string;
  /** Calling CLI family label for governance checks (e.g. claude-code). */
  family?: string;
}

/**
 * Args for thread.post_message (canonical messaging tool).
 */
export interface ThreadPostMessageArgs {
  content: string;
  authorId?: string;
  /** When set, must match context.threadId (credential binding). */
  threadId?: string;
}

export type ToolExecuteResult =
  | { ok: true; message: Message; threadId: string }
  | { ok: false; error: string; code: string; status: number };

/**
 * Dependencies required to run messaging tools against the platform store.
 */
export interface ToolRuntimeDeps {
  store: MacStore;
  hub: ThreadHub;
}

/**
 * Append an assistant message into the bound thread (canonical tool body).
 * @param deps - store + hub for persist/publish
 * @param ctx - Credential-bound thread and allowed catIds
 * @param args - content / optional authorId / optional threadId check
 * @returns ok+message or structured error (status for HTTP mapping)
 */
export async function executeThreadPostMessage(
  deps: ToolRuntimeDeps,
  ctx: ToolCallContext,
  args: ThreadPostMessageArgs,
): Promise<ToolExecuteResult> {
  const content = args.content?.trim() ?? "";
  if (!content) {
    return { ok: false, error: "content required", code: "tool_bad_request", status: 400 };
  }

  if (args.threadId && args.threadId !== ctx.threadId) {
    return {
      ok: false,
      error: "threadId does not match credential",
      code: "tool_thread_mismatch",
      status: 401,
    };
  }

  const authorId = args.authorId?.trim() || ctx.catIds[0] || "agent";
  if (ctx.catIds.length > 0 && !ctx.catIds.includes(authorId)) {
    return {
      ok: false,
      error: `authorId ${authorId} not in credential.catIds`,
      code: "tool_author_denied",
      status: 401,
    };
  }

  const thread = await deps.store.getThread(ctx.threadId);
  if (!thread) {
    return {
      ok: false,
      error: "Thread not found for credential",
      code: "tool_thread_missing",
      status: 404,
    };
  }

  const message = await deps.store.appendMessage({
    threadId: ctx.threadId,
    role: "assistant",
    authorId,
    content,
    status: "completed",
  });
  deps.hub.publish(ctx.threadId, { type: "message.created", message });
  deps.hub.publish(ctx.threadId, { type: "message.completed", message });

  return { ok: true, message, threadId: ctx.threadId };
}
