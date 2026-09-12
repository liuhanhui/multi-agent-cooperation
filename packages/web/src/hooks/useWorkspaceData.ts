import { useCallback, useEffect, useState } from "react";
import type {
  ApprovalChoice,
  ApprovalProducerCatalogEntry,
  ApprovalProducerId,
  ApprovalRequest,
  BallCustodyProjection,
  BulletinBoard,
  CatConfig,
  DeliveryBatch,
  Evidence,
  EvidenceHit,
  FeatureStage,
  HealthResponse,
  HubSettingsDocument,
  RoutingPolicy,
  SkillSummary,
  TargetReceipt,
  Thread,
  ToolCatalogEntry,
  WriteDispositionChoice,
  WriteLaneId,
  WriteLaneResult,
  AwaitSignalKind,
  BallHolderKind,
} from "@mac/shared";
import {
  advanceFeature,
  ackReceipt,
  appendReceiptSupplement,
  beginCustodyWait,
  bindFeatureThread,
  cancelAwait,
  createEvidence,
  createFeature,
  createThread as createThreadRequest,
  decideApproval,
  fetchApprovalProducers,
  fetchApprovals,
  fetchBulletin,
  fetchCats,
  fetchCustody,
  fetchEvidenceList,
  fetchHealth,
  fetchLaneDispositions,
  fetchSettings,
  fetchSkill,
  fetchSkills,
  fetchThreadReceipts,
  fetchThreads,
  fetchTools,
  holdBall,
  patchRoutingPolicy,
  patchThreadMembers,
  searchEvidence,
  submitApproval,
  wakeAwait,
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
  receiptBatches: Array<{ batch: DeliveryBatch; receipts: TargetReceipt[] }>;
  refreshReceipts: () => Promise<void>;
  supplementReceipt: (receiptId: string, content: string) => Promise<void>;
  ackTargetReceipt: (receiptId: string) => Promise<void>;
  custodyProjections: BallCustodyProjection[];
  refreshCustody: () => Promise<void>;
  holdThreadBall: (input: {
    subjectType: "thread" | "feature";
    subjectId: string;
    holderId: string | null;
    holderKind: BallHolderKind;
  }) => Promise<void>;
  waitThreadBall: (input: {
    subjectType: "thread" | "feature";
    subjectId: string;
    signalKind: AwaitSignalKind;
    condition: string;
  }) => Promise<void>;
  wakeBallAwait: (awaitId: string) => Promise<void>;
  cancelBallAwait: (awaitId: string) => Promise<void>;
  approvalProducers: ApprovalProducerCatalogEntry[];
  pendingApprovals: ApprovalRequest[];
  approvalLedger: ApprovalRequest[];
  refreshApprovals: () => Promise<void>;
  submitDemoApproval: (producerId: ApprovalProducerId) => Promise<void>;
  decideHubApproval: (input: {
    id: string;
    choice: ApprovalChoice;
    note?: string;
  }) => Promise<void>;
  hubSettings: HubSettingsDocument | null;
  refreshSettings: () => Promise<void>;
  patchHubRouting: (patch: Partial<RoutingPolicy>) => Promise<void>;
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
 * Load health/cats/threads/skills/tools/bulletin/evidence/receipts/custody and own sidebar selection.
 * Cell: thread-navigation + identity-session + hub-action-surface + portable-governance + memory + bubble-pipeline + ball-custody.
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
  const [receiptBatches, setReceiptBatches] = useState<
    Array<{ batch: DeliveryBatch; receipts: TargetReceipt[] }>
  >([]);
  const [custodyProjections, setCustodyProjections] = useState<BallCustodyProjection[]>(
    [],
  );
  const [approvalProducers, setApprovalProducers] = useState<
    ApprovalProducerCatalogEntry[]
  >([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [approvalLedger, setApprovalLedger] = useState<ApprovalRequest[]>([]);
  const [hubSettings, setHubSettings] = useState<HubSettingsDocument | null>(null);
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

  /**
   * Reload delivery receipt batches for the active thread (M18).
   */
  const refreshReceipts = useCallback(async () => {
    if (!activeId) {
      setReceiptBatches([]);
      return;
    }
    const batches = await fetchThreadReceipts(activeId);
    setReceiptBatches(batches);
  }, [activeId]);

  /**
   * Reload ball-custody projections (who holds the ball).
   */
  const refreshCustody = useCallback(async () => {
    const list = await fetchCustody();
    setCustodyProjections(list);
  }, []);

  /**
   * Reload Approval Hub catalog + pending + recent ledger.
   */
  const refreshApprovals = useCallback(async () => {
    const [producers, pending, all] = await Promise.all([
      fetchApprovalProducers(),
      fetchApprovals("pending"),
      fetchApprovals(),
    ]);
    setApprovalProducers(producers);
    setPendingApprovals(pending);
    setApprovalLedger(all.filter((a) => a.status !== "pending"));
  }, []);

  /**
   * Reload Hub Settings document (nav + accounts + routing + usage).
   */
  const refreshSettings = useCallback(async () => {
    const doc = await fetchSettings();
    setHubSettings(doc);
  }, []);

  useEffect(() => {
    void refreshReceipts().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshReceipts]);

  useEffect(() => {
    void refreshCustody().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshCustody]);

  useEffect(() => {
    void refreshApprovals().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshApprovals]);

  useEffect(() => {
    void refreshSettings().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refreshSettings]);

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
   * Append a non-authoritative supplement; refresh receipt list.
   * @param receiptId - Target receipt
   * @param content - Late text
   */
  async function supplementReceipt(receiptId: string, content: string): Promise<void> {
    setError(null);
    try {
      await appendReceiptSupplement(receiptId, content);
      await refreshReceipts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Ack a delivered receipt; refresh list.
   * @param receiptId - Target receipt
   */
  async function ackTargetReceipt(receiptId: string): Promise<void> {
    setError(null);
    try {
      await ackReceipt(receiptId);
      await refreshReceipts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Pass the ball to a holder; refresh custody list.
   * @param input - Subject + holder
   */
  async function holdThreadBall(input: {
    subjectType: "thread" | "feature";
    subjectId: string;
    holderId: string | null;
    holderKind: BallHolderKind;
  }): Promise<void> {
    setError(null);
    try {
      await holdBall(input);
      await refreshCustody();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Begin a signal wait on a subject; refresh custody.
   * @param input - Wait contract
   */
  async function waitThreadBall(input: {
    subjectType: "thread" | "feature";
    subjectId: string;
    signalKind: AwaitSignalKind;
    condition: string;
  }): Promise<void> {
    setError(null);
    try {
      await beginCustodyWait(input);
      await refreshCustody();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Mock/external wake for an await id.
   * @param awaitId - Await id
   */
  async function wakeBallAwait(awaitId: string): Promise<void> {
    setError(null);
    try {
      await wakeAwait(awaitId, { source: "hub" });
      await refreshCustody();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Cancel an open await.
   * @param awaitId - Await id
   */
  async function cancelBallAwait(awaitId: string): Promise<void> {
    setError(null);
    try {
      await cancelAwait(awaitId);
      await refreshCustody();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Seed a demo approval for Hub producer catalog practice.
   * @param producerId - memory_write | handoff
   */
  async function submitDemoApproval(producerId: ApprovalProducerId): Promise<void> {
    setError(null);
    try {
      if (producerId === "memory_write") {
        await submitApproval({
          producerId,
          subjectType: "lane",
          subjectId: activeId
            ? `decision_lesson:thread:${activeId.slice(0, 8)}`
            : "decision_lesson:demo.subject",
          title: "Approve memory write",
          summary: "Demo lane write needs human disposition before accept.",
          payload: { lane: "decision_lesson" },
          requestedBy: "architect",
        });
      } else {
        await submitApproval({
          producerId,
          subjectType: "handoff",
          subjectId: `handoff-demo-${Date.now()}`,
          title: "Approve A2A handoff",
          summary: "Demo cross-cat handoff waiting for operator yes.",
          payload: { kind: "review" },
          requestedBy: "architect",
        });
      }
      await refreshApprovals();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Decide on the Approval Hub only (approve|reject).
   * @param input - Request id + choice
   */
  async function decideHubApproval(input: {
    id: string;
    choice: ApprovalChoice;
    note?: string;
  }): Promise<void> {
    setError(null);
    try {
      await decideApproval(input.id, {
        choice: input.choice,
        actorId: "operator",
        note: input.note,
      });
      await refreshApprovals();
      await refreshCustody();
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Patch Hub routing policy; applies on the next invoke.
   * @param patch - Partial RoutingPolicy
   */
  async function patchHubRouting(patch: Partial<RoutingPolicy>): Promise<void> {
    setError(null);
    try {
      await patchRoutingPolicy(patch);
      await refreshSettings();
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
    evidenceList,
    evidenceSearchHits,
    refreshEvidence,
    searchEvidenceCue,
    writeEvidence,
    laneDispositions,
    refreshLaneDispositions,
    writeLaneProposal,
    receiptBatches,
    refreshReceipts,
    supplementReceipt,
    ackTargetReceipt,
    custodyProjections,
    refreshCustody,
    holdThreadBall,
    waitThreadBall,
    wakeBallAwait,
    cancelBallAwait,
    approvalProducers,
    pendingApprovals,
    approvalLedger,
    refreshApprovals,
    submitDemoApproval,
    decideHubApproval,
    hubSettings,
    refreshSettings,
    patchHubRouting,
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
