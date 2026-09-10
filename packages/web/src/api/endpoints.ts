import type {
  BulletinBoard,
  CatConfig,
  Evidence,
  EvidenceHit,
  Feature,
  FeatureStage,
  HealthResponse,
  HubBlockAction,
  Message,
  SkillDetail,
  SkillSummary,
  Thread,
  ToolCatalogEntry,
  WriteDispositionChoice,
  WriteLaneId,
  WriteLaneResult,
} from "@mac/shared";
import { apiJson, apiJsonAccept202 } from "./http";

/**
 * GET /health — platform liveness + store/agent fingerprint.
 * @returns HealthResponse contract
 */
export function fetchHealth(): Promise<HealthResponse> {
  return apiJson<HealthResponse>("/health");
}

/**
 * GET /api/cats — registry list for avatars and @mention resolution UX.
 * @returns CatConfig array
 */
export async function fetchCats(): Promise<CatConfig[]> {
  const data = await apiJson<{ cats: CatConfig[] }>("/api/cats");
  return data.cats;
}

/**
 * GET /api/skills — Hub browse list + token budget (M12).
 * @returns skills summaries and budget
 */
export async function fetchSkills(): Promise<{ skills: SkillSummary[]; tokenBudget: number }> {
  return apiJson<{ skills: SkillSummary[]; tokenBudget: number }>("/api/skills");
}

/**
 * GET /api/skills/:id — skill detail including markdown body.
 * @param id - Skill id
 * @returns SkillDetail
 */
export async function fetchSkill(id: string): Promise<SkillDetail> {
  const data = await apiJson<{ skill: SkillDetail }>(`/api/skills/${id}`);
  return data.skill;
}

/**
 * GET /api/tools — Hub browse for canonical MCP tools (M13).
 * @returns tools catalog + aspect cut-list
 */
export async function fetchTools(): Promise<{ tools: ToolCatalogEntry[]; aspects: string[] }> {
  return apiJson<{ tools: ToolCatalogEntry[]; aspects: string[] }>("/api/tools");
}

/**
 * GET /api/threads — sidebar list.
 * @returns Thread array
 */
export async function fetchThreads(): Promise<Thread[]> {
  const data = await apiJson<{ threads: Thread[] }>("/api/threads");
  return data.threads;
}

/**
 * POST /api/threads — create a thread (members seeded server-side from registry).
 * @param title - Optional display title
 * @returns Created Thread
 */
export async function createThread(title?: string): Promise<Thread> {
  const data = await apiJson<{ thread: Thread }>("/api/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: title?.trim() || undefined }),
  });
  return data.thread;
}

/**
 * PATCH /api/threads/:id/members — set default collaborator (and members if needed).
 * @param threadId - Target thread
 * @param memberIds - Membership set (usually existing members)
 * @param defaultCatId - New default cat id
 * @returns Updated Thread
 */
export async function patchThreadMembers(
  threadId: string,
  memberIds: string[],
  defaultCatId: string,
): Promise<Thread> {
  const data = await apiJson<{ thread: Thread }>(`/api/threads/${threadId}/members`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ memberIds, defaultCatId }),
  });
  return data.thread;
}

/**
 * POST .../messages/invoke — server @mention routing + agent stream over WS.
 * @param threadId - Active thread
 * @param content - Raw composer text (may include leading @mentions)
 */
export function invokeMessage(threadId: string, content: string): Promise<unknown> {
  return apiJsonAccept202(`/api/threads/${threadId}/messages/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

/**
 * POST .../messages/stream-echo — demo stream without an agent adapter.
 * @param threadId - Active thread
 * @param content - Text to echo back as deltas
 */
export function streamEchoMessage(threadId: string, content: string): Promise<unknown> {
  return apiJsonAccept202(`/api/threads/${threadId}/messages/stream-echo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

/**
 * POST .../messages/:messageId/actions — Hub checklist/decision write-back (M14).
 * @param threadId - Active thread
 * @param messageId - Message that owns the blocks
 * @param action - checklist.toggle or decision.select
 * @returns Updated message
 */
export async function postMessageAction(
  threadId: string,
  messageId: string,
  action: HubBlockAction,
): Promise<Message> {
  const data = await apiJson<{ message: Message }>(
    `/api/threads/${threadId}/messages/${messageId}/actions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    },
  );
  return data.message;
}

/**
 * GET /api/bulletin — Mission Hub board projection (M15).
 * @returns BulletinBoard columns by SOP stage
 */
export async function fetchBulletin(): Promise<BulletinBoard> {
  const data = await apiJson<{ bulletin: BulletinBoard }>("/api/bulletin");
  return data.bulletin;
}

/**
 * POST /api/features — create a feature on the Mission board.
 * @param input - title required; optional summary/holder/threads
 * @returns Created Feature
 */
export async function createFeature(input: {
  title: string;
  summary?: string;
  ballHolderId?: string | null;
  threadIds?: string[];
}): Promise<Feature> {
  const data = await apiJson<{ feature: Feature }>("/api/features", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.feature;
}

/**
 * POST /api/features/:id/advance — move along light SOP transitions.
 * @param featureId - Feature id
 * @param stage - Target stage allowed by FEATURE_STAGE_TRANSITIONS
 * @returns Updated Feature
 */
export async function advanceFeature(featureId: string, stage: FeatureStage): Promise<Feature> {
  const data = await apiJson<{ feature: Feature }>(`/api/features/${featureId}/advance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage }),
  });
  return data.feature;
}

/**
 * POST /api/features/:id/bind-thread — attach a thread (idempotent).
 * @param featureId - Feature id
 * @param threadId - Thread to bind
 * @returns Updated Feature
 */
export async function bindFeatureThread(featureId: string, threadId: string): Promise<Feature> {
  const data = await apiJson<{ feature: Feature }>(`/api/features/${featureId}/bind-thread`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId }),
  });
  return data.feature;
}

/**
 * GET /api/evidence — Hub browse list (M16).
 * @returns Evidence rows newest-first
 */
export async function fetchEvidenceList(): Promise<Evidence[]> {
  const data = await apiJson<{ evidence: Evidence[] }>("/api/evidence");
  return data.evidence;
}

/**
 * GET /api/evidence/search — BM25 search.
 * @param q - Free-text query
 * @returns Hits with scores
 */
export async function searchEvidence(q: string): Promise<EvidenceHit[]> {
  const data = await apiJson<{ hits: EvidenceHit[] }>(
    `/api/evidence/search?q=${encodeURIComponent(q)}`,
  );
  return data.hits;
}

/**
 * POST /api/evidence — write a provenance-tagged evidence row.
 * @param input - title/body/tags + required provenance.source
 * @returns Created Evidence
 */
export async function createEvidence(input: {
  title: string;
  body: string;
  tags?: string[];
  provenance: { source: string; recordedAt?: string; actorId?: string; threadId?: string };
}): Promise<Evidence> {
  const data = await apiJson<{ evidence: Evidence }>("/api/evidence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.evidence;
}

/**
 * GET /api/memory/lanes/dispositions — recent write-lane outcomes (M17).
 * @returns Disposition results newest-first
 */
export async function fetchLaneDispositions(): Promise<WriteLaneResult[]> {
  const data = await apiJson<{ dispositions: WriteLaneResult[] }>(
    "/api/memory/lanes/dispositions",
  );
  return data.dispositions;
}

/**
 * POST /api/memory/lanes/:lane/write — single-writer lane entry (M17).
 * 409 conflict returns result with conflict (does not throw).
 * @param lane - WriteLaneId
 * @param input - Proposal (+ optional disposition)
 * @returns WriteLaneResult
 */
export async function writeLane(
  lane: WriteLaneId,
  input: {
    title: string;
    body: string;
    subjectKey: string;
    tags?: string[];
    actorId?: string;
    threadId?: string;
    disposition?: WriteDispositionChoice;
  },
): Promise<WriteLaneResult> {
  const res = await fetch(`/api/memory/lanes/${lane}/write`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => null)) as
    | { result?: WriteLaneResult; error?: string }
    | null;
  if (res.status === 409 && data?.result) return data.result;
  if (!res.ok) {
    throw new Error(data?.error ?? `HTTP ${res.status} /api/memory/lanes/${lane}/write`);
  }
  if (!data?.result) throw new Error("missing write lane result");
  return data.result;
}
