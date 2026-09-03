/** Shared contracts — keep terminal schemas here (extend, don't throw away). */

export type HealthStatus = "ok" | "degraded";

export interface HealthResponse {
  status: HealthStatus;
  service: "mac-api";
  version: string;
  store: "memory" | "redis";
  timestamp: string;
  /** Active AgentProvider id when configured (M04+). */
  agent?: string;
}

export interface AgentIdentity {
  id: string;
  displayName: string;
  role: string;
  provider: string;
}

/**
 * Cat registry entry (M05). Loaded read-only from agent-config.json.
 * Never put secrets (apiKey / token / password) in this file.
 */
export interface CatConfig {
  id: string;
  displayName: string;
  role: string;
  provider: string;
  systemSnippet?: string;
  /** Optional model hint for future adapters */
  defaultModel?: string;
}

export type ThreadStatus = "active" | "archived";

export interface Thread {
  id: string;
  title: string;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  lastSeq: number;
  /** Cat ids bound to this thread (subset of registry). */
  memberIds: string[];
  /** Default collaborator for the next invoke (must be in memberIds when set). */
  defaultCatId: string | null;
}

/** @deprecated use Thread — kept for Wave 0 callers */
export type ThreadSummary = Pick<Thread, "id" | "title" | "createdAt" | "updatedAt">;

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
  createdAt: string;
  updatedAt: string;
}

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
