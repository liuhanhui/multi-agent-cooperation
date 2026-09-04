import type { Message, PlatformEvent } from "@mac/shared";

export type BubbleAction =
  | { type: "reset" }
  | { type: "hydrated"; messages: Message[] }
  | { type: "event"; event: PlatformEvent };

/**
 * Single-writer bubble state machine (M06).
 * Identity is always `message.id` — never regenerate keys on streaming updates.
 */
export function bubbleReducer(state: Message[], action: BubbleAction): Message[] {
  switch (action.type) {
    case "reset":
      return [];
    case "hydrated":
      return sortBySeq(dedupeById(action.messages));
    case "event":
      return applyPlatformEvent(state, action.event);
    default:
      return state;
  }
}

function applyPlatformEvent(state: Message[], event: PlatformEvent): Message[] {
  switch (event.type) {
    case "thread.hydrated":
      return sortBySeq(dedupeById(event.messages));
    case "message.created":
    case "message.completed":
    case "message.failed":
      return upsertById(state, event.message);
    case "message.delta":
      return mergeDelta(state, event.messageId, event.threadId, event.seq, event.delta);
    default:
      return state;
  }
}

function dedupeById(messages: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of messages) map.set(m.id, m);
  return [...map.values()];
}

function sortBySeq(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.seq - b.seq);
}

function upsertById(prev: Message[], message: Message): Message[] {
  const idx = prev.findIndex((m) => m.id === message.id);
  if (idx === -1) return sortBySeq([...prev, message]);
  const next = [...prev];
  next[idx] = message;
  return next;
}

function mergeDelta(
  prev: Message[],
  messageId: string,
  threadId: string,
  seq: number,
  delta: string,
): Message[] {
  const idx = prev.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    const placeholder: Message = {
      id: messageId,
      threadId,
      seq,
      role: "assistant",
      authorId: "streaming",
      content: delta,
      status: "streaming",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return sortBySeq([...prev, placeholder]);
  }
  const current = prev[idx];
  if (!current || current.status === "completed" || current.status === "failed") {
    return prev;
  }
  const next = [...prev];
  next[idx] = {
    ...current,
    id: current.id,
    content: current.content + delta,
    status: "streaming",
    updatedAt: new Date().toISOString(),
  };
  return next;
}
