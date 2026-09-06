import type { QueueEntry, TurnExecution } from "@mac/shared";

/**
 * In-memory store for QueueEntry + TurnExecution (M08 TurnExecutionStore).
 * Process-local: restart loses queue rows; message orphans are reconciled separately.
 */
export class TurnExecutionStore {
  private readonly entries = new Map<string, QueueEntry>();
  private readonly turns = new Map<string, TurnExecution>();

  /**
   * Insert or replace a queue entry by id.
   * @param entry - Full QueueEntry snapshot
   */
  putEntry(entry: QueueEntry): void {
    this.entries.set(entry.id, entry);
  }

  /**
   * @param id - QueueEntry id
   * @returns Entry or undefined
   */
  getEntry(id: string): QueueEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * List entries for a thread, newest-first by createdAt.
   * @param threadId - Thread to filter
   */
  listEntriesByThread(threadId: string): QueueEntry[] {
    return [...this.entries.values()]
      .filter((e) => e.threadId === threadId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /**
   * @returns All entries (for reconciler / diagnostics)
   */
  listEntries(): QueueEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Insert or replace a turn execution row.
   * @param turn - Full TurnExecution snapshot
   */
  putTurn(turn: TurnExecution): void {
    this.turns.set(turn.id, turn);
  }

  /**
   * @param id - TurnExecution id
   */
  getTurn(id: string): TurnExecution | undefined {
    return this.turns.get(id);
  }

  /**
   * @param queueEntryId - Parent queue entry
   * @returns Turns in attempt/cat order
   */
  listTurnsByEntry(queueEntryId: string): TurnExecution[] {
    return [...this.turns.values()]
      .filter((t) => t.queueEntryId === queueEntryId)
      .sort((a, b) => a.attempt - b.attempt);
  }

  /**
   * True when this thread already has a running queue entry (busy gate).
   * @param threadId - Thread to check
   */
  isThreadBusy(threadId: string): boolean {
    return [...this.entries.values()].some(
      (e) => e.threadId === threadId && e.status === "running",
    );
  }

  /**
   * True when any turn for this cat is currently running, or a running queue
   * entry already reserved this cat (before the first turn hook fires).
   * @param catId - Collaborator id
   */
  isCatBusy(catId: string): boolean {
    if ([...this.turns.values()].some((t) => t.catId === catId && t.status === "running")) {
      return true;
    }
    return [...this.entries.values()].some(
      (e) => e.status === "running" && e.catIds.includes(catId),
    );
  }
}
