import { randomUUID } from "node:crypto";
import type { Message, Thread } from "@mac/shared";
import type { AppendMessageInput, CreateThreadInput, MacStore } from "./types.js";

export interface MemorySnapshot {
  threads: Thread[];
  messages: Message[];
}

export interface MemoryStore extends MacStore {
  exportSnapshot(): MemorySnapshot;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createMemoryStore(seed?: MemorySnapshot): MemoryStore {
  const threads = new Map<string, Thread>();
  const messages = new Map<string, Message>();
  const byThread = new Map<string, string[]>();

  if (seed) {
    for (const t of seed.threads) {
      threads.set(t.id, structuredClone(t));
      byThread.set(t.id, []);
    }
    const sorted = [...seed.messages].sort((a, b) => a.seq - b.seq);
    for (const m of sorted) {
      messages.set(m.id, structuredClone(m));
      const list = byThread.get(m.threadId) ?? [];
      list.push(m.id);
      byThread.set(m.threadId, list);
    }
  }

  const store: MemoryStore = {
    exportSnapshot() {
      return {
        threads: [...threads.values()].map((t) => structuredClone(t)),
        messages: [...messages.values()].map((m) => structuredClone(m)),
      };
    },

    async createThread(input: CreateThreadInput): Promise<Thread> {
      const ts = nowIso();
      const thread: Thread = {
        id: randomUUID(),
        title: input.title?.trim() || "Untitled thread",
        status: "active",
        createdAt: ts,
        updatedAt: ts,
        lastSeq: 0,
      };
      threads.set(thread.id, thread);
      byThread.set(thread.id, []);
      return structuredClone(thread);
    },

    async getThread(id: string): Promise<Thread | null> {
      const t = threads.get(id);
      return t ? structuredClone(t) : null;
    },

    async listThreads(): Promise<Thread[]> {
      return [...threads.values()]
        .map((t) => structuredClone(t))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async appendMessage(input: AppendMessageInput): Promise<Message> {
      const thread = threads.get(input.threadId);
      if (!thread) throw new Error(`Thread not found: ${input.threadId}`);

      const ts = nowIso();
      const seq = thread.lastSeq + 1;
      const status = input.status ?? "completed";
      const message: Message = {
        id: randomUUID(),
        threadId: thread.id,
        seq,
        role: input.role,
        authorId: input.authorId,
        content: input.content,
        status,
        createdAt: ts,
        updatedAt: ts,
      };
      messages.set(message.id, message);
      const ids = byThread.get(thread.id) ?? [];
      ids.push(message.id);
      byThread.set(thread.id, ids);
      thread.lastSeq = seq;
      thread.updatedAt = ts;
      return structuredClone(message);
    },

    async getMessage(id: string): Promise<Message | null> {
      const m = messages.get(id);
      return m ? structuredClone(m) : null;
    },

    async listMessages(threadId: string, afterSeq = 0): Promise<Message[]> {
      const ids = byThread.get(threadId) ?? [];
      return ids
        .map((id) => messages.get(id))
        .filter((m): m is Message => m !== undefined && m.seq > afterSeq)
        .map((m) => structuredClone(m));
    },

    async applyDelta(messageId: string, delta: string): Promise<Message> {
      const message = messages.get(messageId);
      if (!message) throw new Error(`Message not found: ${messageId}`);
      if (message.status === "completed" || message.status === "failed") {
        throw new Error(`Cannot apply delta to terminal message (${message.status})`);
      }
      message.content += delta;
      message.status = "streaming";
      message.updatedAt = nowIso();
      const thread = threads.get(message.threadId);
      if (thread) thread.updatedAt = message.updatedAt;
      return structuredClone(message);
    },

    async completeMessage(messageId: string, finalContent?: string): Promise<Message> {
      const message = messages.get(messageId);
      if (!message) throw new Error(`Message not found: ${messageId}`);
      if (message.status === "completed" || message.status === "failed") {
        throw new Error(`Cannot complete terminal message (${message.status})`);
      }
      if (finalContent !== undefined) message.content = finalContent;
      message.status = "completed";
      message.updatedAt = nowIso();
      const thread = threads.get(message.threadId);
      if (thread) thread.updatedAt = message.updatedAt;
      return structuredClone(message);
    },

    async failMessage(messageId: string, error: string): Promise<Message> {
      const message = messages.get(messageId);
      if (!message) throw new Error(`Message not found: ${messageId}`);
      if (message.status === "completed" || message.status === "failed") {
        throw new Error(`Cannot fail terminal message (${message.status})`);
      }
      message.status = "failed";
      message.error = error;
      message.updatedAt = nowIso();
      const thread = threads.get(message.threadId);
      if (thread) thread.updatedAt = message.updatedAt;
      return structuredClone(message);
    },
  };

  return store;
}
