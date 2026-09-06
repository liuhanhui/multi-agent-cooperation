import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";

export interface ReconcileOrphansResult {
  /** Message ids failed as orphan-recovered. */
  recoveredIds: string[];
}

/**
 * On process start, force any in-flight bubbles to a terminal failed state.
 * Memory/Redis may still hold `pending`/`streaming` rows from a crashed run;
 * Done criterion: in-flight has an explicit terminal state (fail with orphan-recovered).
 * @param store - Message store to scan
 * @param hub - Optional hub to publish message.failed for live clients
 * @returns Ids that were recovered
 */
export async function reconcileOrphanMessages(
  store: MacStore,
  hub?: ThreadHub,
): Promise<ReconcileOrphansResult> {
  const recoveredIds: string[] = [];
  const threads = await store.listThreads();
  for (const thread of threads) {
    const messages = await store.listMessages(thread.id, 0);
    for (const message of messages) {
      if (message.status !== "pending" && message.status !== "streaming") continue;
      const failed = await store.failMessage(
        message.id,
        "orphan-recovered after restart",
      );
      recoveredIds.push(failed.id);
      hub?.publish(thread.id, {
        type: "message.failed",
        message: failed,
        error: failed.error ?? "orphan-recovered after restart",
      });
    }
  }
  return { recoveredIds };
}
