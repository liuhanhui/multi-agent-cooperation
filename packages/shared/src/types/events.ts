import type { Handoff } from "./handoff.js";
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
  | { type: "message.failed"; message: Message; error: string }
  | { type: "message.updated"; message: Message }
  | {
      /** Live CLI/agent status for Hub while a bubble is pending/streaming (M13+ UX). */
      type: "message.progress";
      messageId: string;
      threadId: string;
      /** Coarse phase for styling / i18n. */
      phase: "spawning" | "running" | "stdout" | "waiting";
      /** Human-readable detail shown under the bubble status. */
      detail: string;
    }
  | { type: "handoff.delivered"; handoff: Handoff }
  | { type: "handoff.acked"; handoff: Handoff };
