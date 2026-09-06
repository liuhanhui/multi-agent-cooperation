import { useCallback, useEffect, useState } from "react";
import type { CatConfig, HealthResponse, Thread } from "@mac/shared";
import {
  createThread as createThreadRequest,
  fetchCats,
  fetchHealth,
  fetchThreads,
  patchThreadMembers,
} from "../api/endpoints";
import {
  readActiveThreadId,
  writeActiveThreadId,
} from "../features/session/active-thread-storage";

export interface UseWorkspaceDataResult {
  health: HealthResponse | null;
  cats: CatConfig[];
  threads: Thread[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  title: string;
  setTitle: (value: string) => void;
  error: string | null;
  setError: (value: string | null) => void;
  refreshThreads: () => Promise<void>;
  createThread: () => Promise<void>;
  setDefaultCat: (catId: string) => Promise<void>;
}

/**
 * Load health/cats/threads and own sidebar selection + session restore.
 * Cell: thread-navigation + identity-session (read path).
 * @returns Workspace list state and mutators used by the chat shell
 */
export function useWorkspaceData(): UseWorkspaceDataResult {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [cats, setCats] = useState<CatConfig[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => readActiveThreadId());
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    writeActiveThreadId(activeId);
  }, [activeId]);

  /**
   * Refresh the thread list and re-select a saved id when it still exists.
   * @returns Promise after setThreads (and maybe setActiveId)
   */
  const refreshThreads = useCallback(async () => {
    const list = await fetchThreads();
    setThreads(list);
    const saved = readActiveThreadId();
    if (saved && list.some((t) => t.id === saved)) {
      setActiveId(saved);
    }
  }, []);

  useEffect(() => {
    void fetchHealth()
      .then(setHealth)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    void fetchCats()
      .then(setCats)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    void refreshThreads().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshThreads]);

  /**
   * Create a thread from the sidebar title field and select it.
   */
  async function createThread(): Promise<void> {
    setError(null);
    try {
      const thread = await createThreadRequest(title);
      setTitle("");
      await refreshThreads();
      setActiveId(thread.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Update the active thread's default cat (membership preserved).
   * @param catId - New defaultCatId
   */
  async function setDefaultCat(catId: string): Promise<void> {
    if (!activeId) return;
    setError(null);
    try {
      const thread = threads.find((t) => t.id === activeId);
      const memberIds = thread?.memberIds?.length ? thread.memberIds : cats.map((c) => c.id);
      const updated = await patchThreadMembers(activeId, memberIds, catId);
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return {
    health,
    cats,
    threads,
    activeId,
    setActiveId,
    title,
    setTitle,
    error,
    setError,
    refreshThreads,
    createThread,
    setDefaultCat,
  };
}
