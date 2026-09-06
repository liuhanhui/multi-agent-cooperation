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
