import type { Message } from "./message.js";
import type { Thread } from "./thread.js";

export type PlatformEvent =
  | {
      type: "thread.hydrated";
      threadId: string;
      thread: Thread;
      messages: Message[];
      serverTime: string;
    }
  | { type: "message.created"; message: Message }
  | {
      type: "message.delta";
      messageId: string;
      threadId: string;
      seq: number;
      delta: string;
    }
  | { type: "message.completed"; message: Message }
  | { type: "message.failed"; message: Message; error: string };
