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

export interface RunRoutedInvocationParams {
  store: MacStore;
  hub: ThreadHub;
  agent: AgentProvider;
  threadId: string;
  /** Prompt after mentions stripped (same text for every serial target). */
  prompt: string;
  /** Ordered cat ids to invoke; serial = await each turn before the next. */
  catIds: string[];
  /** Lookup systemSnippet per cat for the provider invoke. */
  systemSnippetFor: (catId: string) => string | undefined;
  authorId?: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface RunRoutedInvocationResult {
  userMessage: Message;
  /** First pending assistant bubble; later serial turns arrive only over WS. */
  assistantMessages: Message[];
  catIds: string[];
}

/**
 * Stream into an already-created pending assistant bubble until terminal.
 * @param params - store/hub/agent, the pending message, and invoke inputs
 * @returns Final assistant message (completed or failed)
 */
async function streamExistingAssistant(params: {
  store: MacStore;
  hub: ThreadHub;
  agent: AgentProvider;
  threadId: string;
  prompt: string;
  assistantMessage: Message;
  systemSnippet?: string;
  cwd?: string;
  timeoutMs?: number;
}): Promise<Message> {
  const { store, hub, agent, threadId, prompt, assistantMessage, systemSnippet, cwd, timeoutMs } =
    params;

  try {
    let sawTerminal = false;
    let terminal: Message = assistantMessage;
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
        terminal = await store.completeMessage(
          assistantMessage.id,
          event.text.length > 0 ? event.text : undefined,
        );
        hub.publish(threadId, { type: "message.completed", message: terminal });
      } else if (event.type === "failed") {
        sawTerminal = true;
        terminal = await store.failMessage(assistantMessage.id, event.error);
        hub.publish(threadId, {
          type: "message.failed",
          message: terminal,
          error: event.error,
        });
      }
    }
    if (!sawTerminal) {
      terminal = await store.failMessage(assistantMessage.id, "agent ended without result");
      hub.publish(threadId, {
        type: "message.failed",
        message: terminal,
        error: terminal.error ?? "agent ended without result",
      });
    }
    return terminal;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const current = await store.getMessage(assistantMessage.id);
    // Another path may have already finalized the bubble; do not overwrite.
    if (current && (current.status === "completed" || current.status === "failed")) {
      return current;
    }
    const failed = await store.failMessage(assistantMessage.id, error);
    hub.publish(threadId, {
      type: "message.failed",
      message: failed,
      error,
    });
    return failed;
  }
}

/**
 * Create a pending assistant bubble for one cat and stream until terminal.
 * @param params - store/hub/agent plus cat identity and prompt
 * @returns Final assistant message (completed or failed)
 */
async function runAssistantTurn(params: {
  store: MacStore;
  hub: ThreadHub;
  agent: AgentProvider;
  threadId: string;
  prompt: string;
  assistantAuthorId: string;
  systemSnippet?: string;
  cwd?: string;
  timeoutMs?: number;
}): Promise<Message> {
  const assistantMessage = await params.store.appendMessage({
    threadId: params.threadId,
    role: "assistant",
    authorId: params.assistantAuthorId,
    content: "",
    status: "pending",
  });
  params.hub.publish(params.threadId, { type: "message.created", message: assistantMessage });
  return streamExistingAssistant({
    store: params.store,
    hub: params.hub,
    agent: params.agent,
    threadId: params.threadId,
    prompt: params.prompt,
    assistantMessage,
    systemSnippet: params.systemSnippet,
    cwd: params.cwd,
    timeoutMs: params.timeoutMs,
  });
}

/**
 * Append the user message, then run one or more assistant turns in serial.
 * Returns as soon as the first assistant bubble is created; remaining targets
 * continue in the background so HTTP can answer 202 without waiting on the
 * full multi-cat chain (queue/cancel lands in M08).
 * @param params - targets, prompt, store/hub/agent, systemSnippetFor(catId)
 * @returns userMessage, first assistantMessages[], and catIds
 */
export async function runRoutedInvocation(
  params: RunRoutedInvocationParams,
): Promise<RunRoutedInvocationResult> {
  const {
    store,
    hub,
    agent,
    threadId,
    prompt,
    catIds,
    systemSnippetFor,
    authorId = "operator",
    cwd,
    timeoutMs,
  } = params;

  if (catIds.length === 0) {
    throw new Error("runRoutedInvocation requires at least one catId");
  }

  const userMessage = await store.appendMessage({
    threadId,
    role: "user",
    authorId,
    content: prompt,
    status: "completed",
  });
  hub.publish(threadId, { type: "message.created", message: userMessage });

  const firstCatId = catIds[0]!;
  const firstAssistant = await store.appendMessage({
    threadId,
    role: "assistant",
    authorId: firstCatId,
    content: "",
    status: "pending",
  });
  hub.publish(threadId, { type: "message.created", message: firstAssistant });

  // Background serial chain: finish first turn, then create+stream each next cat.
  void (async () => {
    await streamExistingAssistant({
      store,
      hub,
      agent,
      threadId,
      prompt,
      assistantMessage: firstAssistant,
      systemSnippet: systemSnippetFor(firstCatId),
      cwd,
      timeoutMs,
    });

    for (const catId of catIds.slice(1)) {
      await runAssistantTurn({
        store,
        hub,
        agent,
        threadId,
        prompt,
        assistantAuthorId: catId,
        systemSnippet: systemSnippetFor(catId),
        cwd,
        timeoutMs,
      });
    }
  })();

  return { userMessage, assistantMessages: [firstAssistant], catIds };
}

/**
 * Single-target invoke (M04/M05 compatibility wrapper).
 * @param params - Same as before: one prompt → one assistant author
 * @returns userMessage + first assistantMessage (pending; stream continues async)
 */
export async function runInvocation(params: RunInvocationParams): Promise<RunInvocationResult> {
  const catId = params.assistantAuthorId ?? params.agent.id;
  const routed = await runRoutedInvocation({
    store: params.store,
    hub: params.hub,
    agent: params.agent,
    threadId: params.threadId,
    prompt: params.prompt,
    catIds: [catId],
    systemSnippetFor: () => params.systemSnippet,
    authorId: params.authorId,
    cwd: params.cwd,
    timeoutMs: params.timeoutMs,
  });
  return {
    userMessage: routed.userMessage,
    assistantMessage: routed.assistantMessages[0]!,
  };
}
