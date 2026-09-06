/** sessionStorage key for restoring the last active thread after refresh. */
export const ACTIVE_THREAD_KEY = "mac.activeThreadId";

/**
 * Read the persisted active thread id, if any.
 * @returns Thread id string or null
 */
export function readActiveThreadId(): string | null {
  return sessionStorage.getItem(ACTIVE_THREAD_KEY);
}

/**
 * Persist or clear the active thread id for refresh restore.
 * @param threadId - Id to store, or null to remove
 */
export function writeActiveThreadId(threadId: string | null): void {
  if (threadId) sessionStorage.setItem(ACTIVE_THREAD_KEY, threadId);
  else sessionStorage.removeItem(ACTIVE_THREAD_KEY);
}
