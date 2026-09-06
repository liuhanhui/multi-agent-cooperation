import { randomUUID } from "node:crypto";
import type { Message, TurnExecutionStatus } from "@mac/shared";
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

/** Turn lifecycle callback used by InvocationDispatcher to persist TurnExecution rows. */
export interface TurnHookEvent {
  phase: "start" | "end";
  turnId: string;
  catId: string;
  attempt: number;
  messageId: string | null;
  status: TurnExecutionStatus;
  error?: string;
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
  /** AbortSignal from dispatcher CancelToken / AbortController. */
  signal?: AbortSignal;
  /** M10 callback credentials forwarded into AgentInvokeInput. */
  callbackUrl?: string;
  callbackToken?: string;
  callbackExpiresAt?: string;
  /**
   * When true, await the full serial chain before returning (dispatcher).
   * When false (HTTP legacy), return after first assistant bubble is created.
   */
  awaitCompletion?: boolean;
  /** Optional turn start/end hook for TurnExecutionStore. */
  onTurn?: (event: TurnHookEvent) => void;
}

export interface RunRoutedInvocationResult {
  userMessage: Message;
  /** First pending assistant bubble; later serial turns arrive only over WS. */
  assistantMessages: Message[];
  catIds: string[];
}

/**
 * Stream into an already-created pending assistant bubble until terminal.
 * @param params - store/hub/agent, the pending message, invoke inputs, optional signal
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
  signal?: AbortSignal;
  callbackUrl?: string;
  callbackToken?: string;
  callbackExpiresAt?: string;
}): Promise<Message> {
  const {
    store,
    hub,
    agent,
    threadId,
    prompt,
    assistantMessage,
    systemSnippet,
    cwd,
    timeoutMs,
    signal,
    callbackUrl,
    callbackToken,
    callbackExpiresAt,
  } = params;

  const failCancelled = async (): Promise<Message> => {
    const current = await store.getMessage(assistantMessage.id);
    if (current && (current.status === "completed" || current.status === "failed")) {
      return current;
    }
    const failed = await store.failMessage(assistantMessage.id, "cancelled");
    hub.publish(threadId, {
      type: "message.failed",
      message: failed,
      error: "cancelled",
    });
    return failed;
  };

  if (signal?.aborted) {
    return failCancelled();
  }

  try {
    let sawTerminal = false;
    let terminal: Message = assistantMessage;
    for await (const event of agent.invoke({
      prompt,
      threadId,
      systemSnippet,
      cwd,
      timeoutMs,
      signal,
      callbackUrl,
      callbackToken,
      callbackExpiresAt,
    })) {
      if (signal?.aborted) {
        return failCancelled();
      }
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
        // Normalize provider abort into cancelled wording for UI/reconciler.
        const err =
          signal?.aborted || event.error === "aborted" ? "cancelled" : event.error;
        terminal = await store.failMessage(assistantMessage.id, err);
        hub.publish(threadId, {
          type: "message.failed",
          message: terminal,
          error: err,
        });
      }
    }
    if (!sawTerminal) {
      if (signal?.aborted) return failCancelled();
      terminal = await store.failMessage(assistantMessage.id, "agent ended without result");
      hub.publish(threadId, {
        type: "message.failed",
        message: terminal,
        error: terminal.error ?? "agent ended without result",
      });
    }
    return terminal;
  } catch (err) {
    if (signal?.aborted) return failCancelled();
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
 * @param params - store/hub/agent plus cat identity, prompt, optional signal/hooks
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
  signal?: AbortSignal;
  callbackUrl?: string;
  callbackToken?: string;
  callbackExpiresAt?: string;
  attempt: number;
  onTurn?: (event: TurnHookEvent) => void;
}): Promise<Message> {
  const turnId = randomUUID();
  params.onTurn?.({
    phase: "start",
    turnId,
    catId: params.assistantAuthorId,
    attempt: params.attempt,
    messageId: null,
    status: "running",
  });

  const assistantMessage = await params.store.appendMessage({
    threadId: params.threadId,
    role: "assistant",
    authorId: params.assistantAuthorId,
    content: "",
    status: "pending",
  });
  params.hub.publish(params.threadId, { type: "message.created", message: assistantMessage });

  params.onTurn?.({
    phase: "start",
    turnId,
    catId: params.assistantAuthorId,
    attempt: params.attempt,
    messageId: assistantMessage.id,
    status: "running",
  });

  const terminal = await streamExistingAssistant({
    store: params.store,
    hub: params.hub,
    agent: params.agent,
    threadId: params.threadId,
    prompt: params.prompt,
    assistantMessage,
    systemSnippet: params.systemSnippet,
    cwd: params.cwd,
    timeoutMs: params.timeoutMs,
    signal: params.signal,
    callbackUrl: params.callbackUrl,
    callbackToken: params.callbackToken,
    callbackExpiresAt: params.callbackExpiresAt,
  });

  const status: TurnExecutionStatus =
    terminal.status === "completed"
      ? "completed"
      : terminal.error === "cancelled" || params.signal?.aborted
        ? "cancelled"
        : "failed";

  params.onTurn?.({
    phase: "end",
    turnId,
    catId: params.assistantAuthorId,
    attempt: params.attempt,
    messageId: terminal.id,
    status,
    error: terminal.error,
  });

  return terminal;
}

/**
 * Append the user message, then run one or more assistant turns in serial.
 * @param params - targets, prompt, store/hub/agent, optional signal / awaitCompletion / onTurn
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
    signal,
    callbackUrl,
    callbackToken,
    callbackExpiresAt,
    awaitCompletion = false,
    onTurn,
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

  /**
   * Run all serial cat turns; stop early when cancelled.
   */
  const runChain = async (): Promise<Message[]> => {
    const assistants: Message[] = [];
    let attempt = 1;
    for (const catId of catIds) {
      if (signal?.aborted) break;
      const terminal = await runAssistantTurn({
        store,
        hub,
        agent,
        threadId,
        prompt,
        assistantAuthorId: catId,
        systemSnippet: systemSnippetFor(catId),
        cwd,
        timeoutMs,
        signal,
        callbackUrl,
        callbackToken,
        callbackExpiresAt,
        attempt,
        onTurn,
      });
      assistants.push(terminal);
      attempt += 1;
      // Do not continue serial chain after cancel/failure of a turn.
      if (terminal.status !== "completed") break;
    }
    return assistants;
  };

  if (awaitCompletion) {
    const assistants = await runChain();
    return {
      userMessage,
      assistantMessages: assistants.length > 0 ? assistants : [],
      catIds,
    };
  }

  // Legacy HTTP path: create first bubble eagerly so 202 can include it, stream in background.
  const firstCatId = catIds[0]!;
  const turnId = randomUUID();
  onTurn?.({
    phase: "start",
    turnId,
    catId: firstCatId,
    attempt: 1,
    messageId: null,
    status: "running",
  });

  const firstAssistant = await store.appendMessage({
    threadId,
    role: "assistant",
    authorId: firstCatId,
    content: "",
    status: "pending",
  });
  hub.publish(threadId, { type: "message.created", message: firstAssistant });
  onTurn?.({
    phase: "start",
    turnId,
    catId: firstCatId,
    attempt: 1,
    messageId: firstAssistant.id,
    status: "running",
  });

  void (async () => {
    const terminal = await streamExistingAssistant({
      store,
      hub,
      agent,
      threadId,
      prompt,
      assistantMessage: firstAssistant,
      systemSnippet: systemSnippetFor(firstCatId),
      cwd,
      timeoutMs,
      signal,
      callbackUrl,
      callbackToken,
      callbackExpiresAt,
    });
    const status: TurnExecutionStatus =
      terminal.status === "completed"
        ? "completed"
        : terminal.error === "cancelled" || signal?.aborted
          ? "cancelled"
          : "failed";
    onTurn?.({
      phase: "end",
      turnId,
      catId: firstCatId,
      attempt: 1,
      messageId: terminal.id,
      status,
      error: terminal.error,
    });

    if (terminal.status !== "completed" || signal?.aborted) return;

    let attempt = 2;
    for (const catId of catIds.slice(1)) {
      if (signal?.aborted) break;
      const next = await runAssistantTurn({
        store,
        hub,
        agent,
        threadId,
        prompt,
        assistantAuthorId: catId,
        systemSnippet: systemSnippetFor(catId),
        cwd,
        timeoutMs,
        signal,
        callbackUrl,
        callbackToken,
        callbackExpiresAt,
        attempt,
        onTurn,
      });
      attempt += 1;
      if (next.status !== "completed") break;
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
