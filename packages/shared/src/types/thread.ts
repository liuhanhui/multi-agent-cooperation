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
