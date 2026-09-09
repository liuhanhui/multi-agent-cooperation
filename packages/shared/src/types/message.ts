import type { ContentBlock } from "./content-block.js";

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "streaming" | "completed" | "failed";

export interface Message {
  id: string;
  threadId: string;
  seq: number;
  role: MessageRole;
  authorId: string;
  content: string;
  status: MessageStatus;
  error?: string;
  /**
   * Live Hub hint while the agent CLI is running (not persisted as durable content).
   * Cleared on completed/failed; updated via message.progress WS events.
   */
  progress?: string;
  /** Structured Hub blocks (checklist / decision / diff / card) — M14. */
  blocks?: ContentBlock[];
  createdAt: string;
  updatedAt: string;
}
