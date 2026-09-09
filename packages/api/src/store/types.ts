import type {
  ContentBlock,
  Message,
  MessageRole,
  MessageStatus,
  Thread,
} from "@mac/shared";

export interface CreateThreadInput {
  title?: string;
  memberIds?: string[];
  defaultCatId?: string | null;
}

export interface UpdateThreadMembersInput {
  threadId: string;
  memberIds: string[];
  defaultCatId: string | null;
}

export interface AppendMessageInput {
  threadId: string;
  role: MessageRole;
  authorId: string;
  content: string;
  status?: MessageStatus;
  /** Optional structured Hub blocks (M14). */
  blocks?: ContentBlock[];
}

/**
 * Thread / Message port (M03 + M05 members + M14 blocks).
 *
 * Message status transitions:
 *   pending → streaming → completed
 *   pending → streaming → failed
 *   pending → completed   (user / non-stream append)
 *
 * Invariants:
 *   - message.seq is monotonic per thread (1..n)
 *   - thread.lastSeq === max(message.seq) or 0
 *   - cannot mutate a completed/failed message content via delta
 *   - defaultCatId is null or ∈ memberIds
 *   - blocks may be updated on completed messages via updateMessageBlocks (Hub actions)
 */
export interface MacStore {
  createThread(input: CreateThreadInput): Promise<Thread>;
  getThread(id: string): Promise<Thread | null>;
  listThreads(): Promise<Thread[]>;
  updateThreadMembers(input: UpdateThreadMembersInput): Promise<Thread>;
  appendMessage(input: AppendMessageInput): Promise<Message>;
  getMessage(id: string): Promise<Message | null>;
  listMessages(threadId: string, afterSeq?: number): Promise<Message[]>;
  applyDelta(messageId: string, delta: string): Promise<Message>;
  completeMessage(messageId: string, finalContent?: string): Promise<Message>;
  failMessage(messageId: string, error: string): Promise<Message>;
  /**
   * Replace structured blocks on a message (Hub checklist/decision write-back).
   * @param messageId - Target message
   * @param blocks - Full replacement blocks array
   */
  updateMessageBlocks(messageId: string, blocks: ContentBlock[]): Promise<Message>;
}
