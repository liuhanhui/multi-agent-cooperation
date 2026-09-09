import { useCallback, useEffect, useState } from "react";
import type {
  BulletinBoard,
  CatConfig,
  FeatureStage,
  HealthResponse,
  SkillSummary,
  Thread,
  ToolCatalogEntry,
} from "@mac/shared";
import {
  advanceFeature,
  bindFeatureThread,
  createFeature,
  createThread as createThreadRequest,
  fetchBulletin,
  fetchCats,
  fetchHealth,
  fetchSkill,
  fetchSkills,
  fetchThreads,
  fetchTools,
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
  skills: SkillSummary[];
  skillsBudget: number | null;
  selectedSkillId: string | null;
  selectedSkillBody: string | null;
  selectSkill: (id: string) => Promise<void>;
  tools: ToolCatalogEntry[];
  toolAspects: string[];
  selectedToolId: string | null;
  selectTool: (id: string) => void;
  bulletin: BulletinBoard | null;
  refreshBulletin: () => Promise<void>;
  createMissionFeature: (input: {
    title: string;
    summary?: string;
    ballHolderId?: string | null;
  }) => Promise<void>;
  advanceMissionFeature: (featureId: string, stage: FeatureStage) => Promise<void>;
  bindMissionThread: (featureId: string) => Promise<void>;
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
 * Load health/cats/threads/skills/tools/bulletin and own sidebar selection + session restore.
 * Cell: thread-navigation + identity-session + hub-action-surface + portable-governance.
 * @returns Workspace list state and mutators used by the chat shell
 */
export function useWorkspaceData(): UseWorkspaceDataResult {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [cats, setCats] = useState<CatConfig[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [skillsBudget, setSkillsBudget] = useState<number | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedSkillBody, setSelectedSkillBody] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolCatalogEntry[]>([]);
  const [toolAspects, setToolAspects] = useState<string[]>([]);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [bulletin, setBulletin] = useState<BulletinBoard | null>(null);
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

  /**
   * Reload Mission bulletin columns from GET /api/bulletin.
   */
  const refreshBulletin = useCallback(async () => {
    const board = await fetchBulletin();
    setBulletin(board);
  }, []);

  useEffect(() => {
    void fetchHealth()
      .then(setHealth)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    void fetchCats()
      .then(setCats)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    void fetchSkills()
      .then((data) => {
        setSkills(data.skills);
        setSkillsBudget(data.tokenBudget);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    void fetchTools()
      .then((data) => {
        setTools(data.tools);
        setToolAspects(data.aspects);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    void refreshBulletin().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    void refreshThreads().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshThreads, refreshBulletin]);

  /**
   * Toggle/select a skill and load its body for Hub browse.
   * @param id - Skill id from the catalog
   */
  async function selectSkill(id: string): Promise<void> {
    if (selectedSkillId === id) {
      setSelectedSkillId(null);
      setSelectedSkillBody(null);
      return;
    }
    setError(null);
    try {
      const skill = await fetchSkill(id);
      setSelectedSkillId(id);
      setSelectedSkillBody(skill.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Toggle tool detail in the Hub catalog rail.
   * @param id - Semantic tool id
   */
  function selectTool(id: string): void {
    setSelectedToolId((prev) => (prev === id ? null : id));
  }

  /**
   * Create a Mission feature; optionally seed-bind the active thread.
   * @param input - title/summary/ballHolderId from the Mission form
   */
  async function createMissionFeature(input: {
    title: string;
    summary?: string;
    ballHolderId?: string | null;
  }): Promise<void> {
    setError(null);
    try {
      await createFeature({
        ...input,
        threadIds: activeId ? [activeId] : [],
      });
      await refreshBulletin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Advance a feature along the light SOP and refresh the bulletin.
   * @param featureId - Feature id
   * @param stage - Allowed target stage
   */
  async function advanceMissionFeature(featureId: string, stage: FeatureStage): Promise<void> {
    setError(null);
    try {
      await advanceFeature(featureId, stage);
      await refreshBulletin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Bind the currently selected thread to a feature (Done: feature ↔ thread).
   * @param featureId - Feature to attach
   */
  async function bindMissionThread(featureId: string): Promise<void> {
    if (!activeId) {
      setError("Select a thread before binding");
      return;
    }
    setError(null);
    try {
      await bindFeatureThread(featureId, activeId);
      await refreshBulletin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

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
    skills,
    skillsBudget,
    selectedSkillId,
    selectedSkillBody,
    selectSkill,
    tools,
    toolAspects,
    selectedToolId,
    selectTool,
    bulletin,
    refreshBulletin,
    createMissionFeature,
    advanceMissionFeature,
    bindMissionThread,
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
