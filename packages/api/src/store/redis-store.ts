import { createClient, type RedisClientType } from "redis";
import { randomUUID } from "node:crypto";
import type { Message, Thread } from "@mac/shared";
import type { AppendMessageInput, CreateThreadInput, MacStore } from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function threadKey(id: string): string {
  return `mac:thread:${id}`;
}

function messageKey(id: string): string {
  return `mac:message:${id}`;
}

function threadMessagesKey(id: string): string {
  return `mac:thread:${id}:messages`;
}

const THREAD_INDEX = "mac:threads";

export async function createRedisStore(url: string): Promise<MacStore> {
  const client: RedisClientType = createClient({ url });
  client.on("error", (err) => {
    console.error("[mac-redis]", err);
  });
  await client.connect();

  async function readThread(id: string): Promise<Thread | null> {
    const raw = await client.get(threadKey(id));
    return raw ? (JSON.parse(raw) as Thread) : null;
  }

  async function writeThread(thread: Thread): Promise<void> {
    await client.set(threadKey(thread.id), JSON.stringify(thread));
    await client.zAdd(THREAD_INDEX, {
      score: Date.parse(thread.updatedAt),
      value: thread.id,
    });
  }

  async function readMessage(id: string): Promise<Message | null> {
    const raw = await client.get(messageKey(id));
    return raw ? (JSON.parse(raw) as Message) : null;
  }

  const store: MacStore = {
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
      await writeThread(thread);
      return thread;
    },

    async getThread(id: string): Promise<Thread | null> {
      return readThread(id);
    },

    async listThreads(): Promise<Thread[]> {
      const ids = await client.zRange(THREAD_INDEX, 0, -1, { REV: true });
      const out: Thread[] = [];
      for (const id of ids) {
        const t = await readThread(id);
        if (t) out.push(t);
      }
      return out;
    },

    async appendMessage(input: AppendMessageInput): Promise<Message> {
      const thread = await readThread(input.threadId);
      if (!thread) throw new Error(`Thread not found: ${input.threadId}`);
      const ts = nowIso();
      const seq = thread.lastSeq + 1;
      const message: Message = {
        id: randomUUID(),
        threadId: thread.id,
        seq,
        role: input.role,
        authorId: input.authorId,
        content: input.content,
        status: input.status ?? "completed",
        createdAt: ts,
        updatedAt: ts,
      };
      thread.lastSeq = seq;
      thread.updatedAt = ts;
      await client.set(messageKey(message.id), JSON.stringify(message));
      await client.rPush(threadMessagesKey(thread.id), message.id);
      await writeThread(thread);
      return message;
    },

    async getMessage(id: string): Promise<Message | null> {
      return readMessage(id);
    },

    async listMessages(threadId: string, afterSeq = 0): Promise<Message[]> {
      const ids = await client.lRange(threadMessagesKey(threadId), 0, -1);
      const out: Message[] = [];
      for (const id of ids) {
        const m = await readMessage(id);
        if (m && m.seq > afterSeq) out.push(m);
      }
      return out;
    },

    async applyDelta(messageId: string, delta: string): Promise<Message> {
      const message = await readMessage(messageId);
      if (!message) throw new Error(`Message not found: ${messageId}`);
      if (message.status === "completed" || message.status === "failed") {
        throw new Error(`Cannot apply delta to terminal message (${message.status})`);
      }
      message.content += delta;
      message.status = "streaming";
      message.updatedAt = nowIso();
      await client.set(messageKey(message.id), JSON.stringify(message));
      const thread = await readThread(message.threadId);
      if (thread) {
        thread.updatedAt = message.updatedAt;
        await writeThread(thread);
      }
      return message;
    },

    async completeMessage(messageId: string, finalContent?: string): Promise<Message> {
      const message = await readMessage(messageId);
      if (!message) throw new Error(`Message not found: ${messageId}`);
      if (message.status === "completed" || message.status === "failed") {
        throw new Error(`Cannot complete terminal message (${message.status})`);
      }
      if (finalContent !== undefined) message.content = finalContent;
      message.status = "completed";
      message.updatedAt = nowIso();
      await client.set(messageKey(message.id), JSON.stringify(message));
      const thread = await readThread(message.threadId);
      if (thread) {
        thread.updatedAt = message.updatedAt;
        await writeThread(thread);
      }
      return message;
    },

    async failMessage(messageId: string, error: string): Promise<Message> {
      const message = await readMessage(messageId);
      if (!message) throw new Error(`Message not found: ${messageId}`);
      if (message.status === "completed" || message.status === "failed") {
        throw new Error(`Cannot fail terminal message (${message.status})`);
      }
      message.status = "failed";
      message.error = error;
      message.updatedAt = nowIso();
      await client.set(messageKey(message.id), JSON.stringify(message));
      const thread = await readThread(message.threadId);
      if (thread) {
        thread.updatedAt = message.updatedAt;
        await writeThread(thread);
      }
      return message;
    },
  };

  return store;
}
