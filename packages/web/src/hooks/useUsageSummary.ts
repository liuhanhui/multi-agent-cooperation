import { useEffect, useState } from "react";
import type { UsageSummary } from "@mac/shared";
import { fetchUsageSummary } from "../api/endpoints";

export interface UsageSummaryState {
  summary: UsageSummary | null;
  status: "loading" | "ready" | "unavailable";
}

/** Background refresh cadence while the Usage tab is mounted. */
const POLL_MS = 15_000;

/**
 * Read the M29 usage ledger summary; refetch on query change, on `refreshKey`
 * change (new usage-bearing bubble), and on a slow poll while mounted.
 * @param days - UTC day window (1 / 7 / 30)
 * @param threadId - Thread scope, or null for all threads
 * @param refreshKey - Changes when the live thread gains a new usage record
 * @returns Latest summary plus load status (keeps last good summary on error)
 */
export function useUsageSummary(
  days: number,
  threadId: string | null,
  refreshKey: number,
): UsageSummaryState {
  const [state, setState] = useState<UsageSummaryState>({ summary: null, status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Fetch once and schedule the next poll.
     * @returns Promise settled after state update
     */
    async function load(): Promise<void> {
      try {
        const summary = await fetchUsageSummary({ days, threadId });
        if (!cancelled) setState({ summary, status: "ready" });
      } catch {
        if (!cancelled) setState((prev) => ({ summary: prev.summary, status: "unavailable" }));
      } finally {
        if (!cancelled) timer = setTimeout(load, POLL_MS);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [days, threadId, refreshKey]);

  return state;
}
