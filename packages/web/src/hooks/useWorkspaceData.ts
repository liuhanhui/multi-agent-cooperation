import { useCallback, useEffect, useState } from "react";
import type {
  BulletinBoard,
  CatConfig,
  Evidence,
  EvidenceHit,
  FeatureStage,
  HealthResponse,
  SkillSummary,
  Thread,
  ToolCatalogEntry,
  WriteDispositionChoice,
  WriteLaneId,
  WriteLaneResult,
} from "@mac/shared";
import {
  advanceFeature,
  bindFeatureThread,
  createEvidence,
  createFeature,
  createThread as createThreadRequest,
  fetchBulletin,
  fetchCats,
  fetchEvidenceList,
  fetchHealth,
  fetchLaneDispositions,
  fetchSkill,
  fetchSkills,
  fetchThreads,
  fetchTools,
  patchThreadMembers,
  searchEvidence,
  writeLane,
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
  evidenceList: Evidence[];
  evidenceSearchHits: EvidenceHit[] | null;
  refreshEvidence: () => Promise<void>;
  searchEvidenceCue: (q: string) => Promise<void>;
  writeEvidence: (input: {
    title: string;
    body: string;
    tags?: string[];
    provenance: { source: string; actorId?: string };
  }) => Promise<void>;
  laneDispositions: WriteLaneResult[];
  refreshLaneDispositions: () => Promise<void>;
  writeLaneProposal: (input: {
    lane: WriteLaneId;
    title: string;
    body: string;
    subjectKey: string;
    disposition?: WriteDispositionChoice;
  }) => Promise<WriteLaneResult | null>;
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
 * Load health/cats/threads/skills/tools/bulletin/evidence and own sidebar selection.
 * Cell: thread-navigation + identity-session + hub-action-surface + portable-governance + memory.
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
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [evidenceSearchHits, setEvidenceSearchHits] = useState<EvidenceHit[] | null>(null);
  const [laneDispositions, setLaneDispositions] = useState<WriteLaneResult[]>([]);
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

  /**
   * Reload evidence list and clear search mode.
   */
  const refreshEvidence = useCallback(async () => {
    const list = await fetchEvidenceList();
    setEvidenceList(list);
    setEvidenceSearchHits(null);
  }, []);

  /**
   * Reload recent write-lane dispositions.
   */
  const refreshLaneDispositions = useCallback(async () => {
    const list = await fetchLaneDispositions();
    setLaneDispositions(list);
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
    void refreshEvidence().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    void refreshLaneDispositions().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
    void refreshThreads().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshThreads, refreshBulletin, refreshEvidence, refreshLaneDispositions]);

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
   * BM25 search; empty query falls back to list.
   * @param q - Cue text
   */
  async function searchEvidenceCue(q: string): Promise<void> {
    const trimmed = q.trim();
    if (!trimmed) {
      await refreshEvidence();
      return;
    }
    setError(null);
    try {
      const hits = await searchEvidence(trimmed);
      setEvidenceSearchHits(hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Write evidence with forced provenance; refresh list after.
   * @param input - Create payload
   */
  async function writeEvidence(input: {
    title: string;
    body: string;
    tags?: string[];
    provenance: { source: string; actorId?: string };
  }): Promise<void> {
    setError(null);
    try {
      await createEvidence({
        ...input,
        provenance: {
          ...input.provenance,
          threadId: activeId ?? undefined,
        },
      });
      await refreshEvidence();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Propose a lane write; returns conflict result for Hub disposition UI.
   * @param input - Lane + proposal (+ optional disposition)
   * @returns WriteLaneResult or null on transport error
   */
  async function writeLaneProposal(input: {
    lane: WriteLaneId;
    title: string;
    body: string;
    subjectKey: string;
    disposition?: WriteDispositionChoice;
  }): Promise<WriteLaneResult | null> {
    setError(null);
    try {
      const result = await writeLane(input.lane, {
        title: input.title,
        body: input.body,
        subjectKey: input.subjectKey,
        disposition: input.disposition,
        threadId: activeId ?? undefined,
      });
      await refreshLaneDispositions();
      if (result.disposition === "accepted") await refreshEvidence();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
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
    evidenceList,
    evidenceSearchHits,
    refreshEvidence,
    searchEvidenceCue,
    writeEvidence,
    laneDispositions,
    refreshLaneDispositions,
    writeLaneProposal,
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
