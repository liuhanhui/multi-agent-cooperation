import type { Message } from "@mac/shared";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";
import type { AgentProvider } from "./types.js";

export interface RunInvocationParams {
  store: MacStore;
  hub: ThreadHub;
  agent: AgentProvider;
  threadId: string;
  prompt: string;
  authorId?: string;
  /** Cat id shown as assistant bubble author (M05). Defaults to agent.id. */
  assistantAuthorId?: string;
  systemSnippet?: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface RunInvocationResult {
  userMessage: Message;
  assistantMessage: Message;
}

/** Persist user message, stream agent output into an assistant bubble via hub. */
export async function runInvocation(params: RunInvocationParams): Promise<RunInvocationResult> {
  const {
    store,
    hub,
    agent,
    threadId,
    prompt,
    authorId = "operator",
    assistantAuthorId,
    systemSnippet,
    cwd,
    timeoutMs,
  } = params;

  const userMessage = await store.appendMessage({
    threadId,
    role: "user",
    authorId,
    content: prompt,
    status: "completed",
  });
  hub.publish(threadId, { type: "message.created", message: userMessage });

  const assistantMessage = await store.appendMessage({
    threadId,
    role: "assistant",
    authorId: assistantAuthorId ?? agent.id,
    content: "",
    status: "pending",
  });
  hub.publish(threadId, { type: "message.created", message: assistantMessage });

  void (async () => {
    try {
      let sawTerminal = false;
      for await (const event of agent.invoke({
        prompt,
        threadId,
        systemSnippet,
        cwd,
        timeoutMs,
      })) {
        if (sawTerminal) continue;
        if (event.type === "delta") {
          const updated = await store.applyDelta(assistantMessage.id, event.text);
          hub.publish(threadId, {
            type: "message.delta",
            messageId: updated.id,
            threadId,
            seq: updated.seq,
            delta: event.text,
          });
        } else if (event.type === "completed") {
          sawTerminal = true;
          const completed = await store.completeMessage(
            assistantMessage.id,
            event.text.length > 0 ? event.text : undefined,
          );
          hub.publish(threadId, { type: "message.completed", message: completed });
        } else if (event.type === "failed") {
          sawTerminal = true;
          const failed = await store.failMessage(assistantMessage.id, event.error);
          hub.publish(threadId, {
            type: "message.failed",
            message: failed,
            error: event.error,
          });
        }
      }
      if (!sawTerminal) {
        const failed = await store.failMessage(assistantMessage.id, "agent ended without result");
        hub.publish(threadId, {
          type: "message.failed",
          message: failed,
          error: failed.error ?? "agent ended without result",
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const current = await store.getMessage(assistantMessage.id);
      if (current && (current.status === "completed" || current.status === "failed")) return;
      const failed = await store.failMessage(assistantMessage.id, error);
      hub.publish(threadId, {
        type: "message.failed",
        message: failed,
        error,
      });
    }
  })();

  return { userMessage, assistantMessage };
}
