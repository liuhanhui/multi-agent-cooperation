import type { Handoff } from "@mac/shared";

/**
 * In-memory handoff registry (M09).
 * Process-local; sufficient for same-thread A2A before durable store ports.
 */
export class HandoffStore {
  private readonly items = new Map<string, Handoff>();

  /**
   * @param handoff - Full record to upsert
   */
  put(handoff: Handoff): void {
    this.items.set(handoff.id, handoff);
  }

  /**
   * @param id - Handoff id
   */
  get(id: string): Handoff | undefined {
    return this.items.get(id);
  }

  /**
   * @param threadId - Thread filter
   * @returns Newest-first list
   */
  listByThread(threadId: string): Handoff[] {
    return [...this.items.values()]
      .filter((h) => h.threadId === threadId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
