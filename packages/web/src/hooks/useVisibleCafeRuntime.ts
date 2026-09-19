import { useEffect, useState } from "react";
import type { QueueEntry, TurnExecution } from "@mac/shared";
import {
  fetchInvocation,
  fetchThreadInvocations,
} from "../api/endpoints";

export interface VisibleCafeRuntime {
  entries: QueueEntry[];
  turns: TurnExecution[];
  status: "idle" | "loading" | "ready" | "unavailable";
}

const EMPTY_RUNTIME: VisibleCafeRuntime = {
  entries: [],
  turns: [],
  status: "idle",
};

/**
 * Cache authoritative dispatch reads while the Café tab is visible.
 * @param threadId - Selected room, or null when no room is active
 * @param enabled - Whether the Café surface is currently visible
 * @returns Read-through invocation snapshot; never an independent lifecycle
 */
export function useVisibleCafeRuntime(
  threadId: string | null,
  enabled: boolean,
): VisibleCafeRuntime {
  const [runtime, setRuntime] = useState<VisibleCafeRuntime>(EMPTY_RUNTIME);

  useEffect(() => {
    if (!enabled || !threadId) {
      setRuntime(EMPTY_RUNTIME);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const activeThreadId = threadId;
    setRuntime({ entries: [], turns: [], status: "loading" });

    /**
     * Refresh queue entries and fetch exact turns only for currently running work.
     * @returns Promise settled after cache update and next refresh scheduling
     */
    async function refresh(): Promise<void> {
      try {
        const entries = await fetchThreadInvocations(activeThreadId);
        const activeEntries = entries.filter(
          (entry) => entry.status === "queued" || entry.status === "running",
        );
        const details = await Promise.all(
          activeEntries
            .filter((entry) => entry.status === "running")
            .map((entry) => fetchInvocation(activeThreadId, entry.id)),
        );
        if (cancelled) return;
        setRuntime({
          entries: activeEntries,
          turns: details.flatMap((detail) => detail.turns),
          status: "ready",
        });
        // Poll faster only while canonical dispatch still reports active work.
        timer = setTimeout(refresh, activeEntries.length > 0 ? 1_500 : 5_000);
      } catch {
        if (cancelled) return;
        setRuntime({ entries: [], turns: [], status: "unavailable" });
        timer = setTimeout(refresh, 5_000);
      }
    }

    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, threadId]);

  return runtime;
}
