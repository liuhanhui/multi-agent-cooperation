import type {
  ApprovalChoice,
  ApprovalIngress,
  ApprovalProducerCatalogEntry,
  ApprovalRequest,
  AwaitSignalKind,
  BallCustodyProjection,
  BallHolderKind,
  BulletinBoard,
  CatConfig,
  DeliveryBatch,
  Evidence,
  EvidenceHit,
  Feature,
  FeatureStage,
  HealthResponse,
  HubBlockAction,
  HubSettingsDocument,
  Message,
  RoutingPolicy,
  SkillDetail,
  SkillSummary,
  TargetReceipt,
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

/**
 * GET /api/threads/:threadId/receipts — delivery batches for a thread (M18).
 * @param threadId - Active thread
 * @returns Batches with nested per-target receipts
 */
export async function fetchThreadReceipts(
  threadId: string,
): Promise<Array<{ batch: DeliveryBatch; receipts: TargetReceipt[] }>> {
  const data = await apiJson<{
    batches: Array<{ batch: DeliveryBatch; receipts: TargetReceipt[] }>;
  }>(`/api/threads/${threadId}/receipts`);
  return data.batches;
}

/**
 * POST /api/receipts/:id/supplements — append non-authoritative late text.
 * @param receiptId - Target receipt
 * @param content - Supplement body
 * @returns Updated receipt
 */
export async function appendReceiptSupplement(
  receiptId: string,
  content: string,
): Promise<TargetReceipt> {
  const data = await apiJson<{ receipt: TargetReceipt }>(
    `/api/receipts/${receiptId}/supplements`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  return data.receipt;
}

/**
 * POST /api/receipts/:id/ack — ack a delivered receipt.
 * @param receiptId - Target receipt
 * @returns Updated receipt
 */
export async function ackReceipt(receiptId: string): Promise<TargetReceipt> {
  const data = await apiJson<{ receipt: TargetReceipt }>(
    `/api/receipts/${receiptId}/ack`,
    { method: "POST" },
  );
  return data.receipt;
}

/**
 * GET /api/custody — ball custody projections (M19).
 * @returns Projection list (custody triple each)
 */
export async function fetchCustody(): Promise<BallCustodyProjection[]> {
  const data = await apiJson<{ projections: BallCustodyProjection[] }>("/api/custody");
  return data.projections;
}

/**
 * POST /api/custody/:type/:id/hold — pass the ball.
 * @param input - Subject + holder
 * @returns Updated projection
 */
export async function holdBall(input: {
  subjectType: "thread" | "feature";
  subjectId: string;
  holderId: string | null;
  holderKind: BallHolderKind;
}): Promise<BallCustodyProjection> {
  const data = await apiJson<{ projection: BallCustodyProjection }>(
    `/api/custody/${input.subjectType}/${input.subjectId}/hold`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        holderId: input.holderId,
        holderKind: input.holderKind,
      }),
    },
  );
  return data.projection;
}

/**
 * POST /api/custody/:type/:id/wait — begin signal wait.
 * @param input - Subject + signal contract
 * @returns Updated projection
 */
export async function beginCustodyWait(input: {
  subjectType: "thread" | "feature";
  subjectId: string;
  signalKind: AwaitSignalKind;
  condition: string;
  expiresAt?: string | null;
}): Promise<BallCustodyProjection> {
  const data = await apiJson<{ projection: BallCustodyProjection }>(
    `/api/custody/${input.subjectType}/${input.subjectId}/wait`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        signalKind: input.signalKind,
        condition: input.condition,
        expiresAt: input.expiresAt ?? null,
      }),
    },
  );
  return data.projection;
}

/**
 * POST /api/awaits/:id/wake — mock/external wake.
 * @param awaitId - Await id
 * @param payload - Optional wake payload
 * @returns Updated projection
 */
export async function wakeAwait(
  awaitId: string,
  payload: Record<string, unknown> = {},
): Promise<BallCustodyProjection> {
  const data = await apiJson<{ projection: BallCustodyProjection }>(
    `/api/awaits/${awaitId}/wake`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return data.projection;
}

/**
 * POST /api/awaits/:id/cancel — cancel open wait.
 * @param awaitId - Await id
 * @returns Updated projection
 */
export async function cancelAwait(awaitId: string): Promise<BallCustodyProjection> {
  const data = await apiJson<{ projection: BallCustodyProjection }>(
    `/api/awaits/${awaitId}/cancel`,
    { method: "POST" },
  );
  return data.projection;
}

/**
 * GET /api/approvals/producers — Approval Hub producer catalog (M20).
 * @returns Producer entries
 */
export async function fetchApprovalProducers(): Promise<ApprovalProducerCatalogEntry[]> {
  const data = await apiJson<{ producers: ApprovalProducerCatalogEntry[] }>(
    "/api/approvals/producers",
  );
  return data.producers;
}

/**
 * GET /api/approvals — list approval ledger.
 * @param status - Optional filter
 * @returns ApprovalRequest list
 */
export async function fetchApprovals(
  status?: "pending" | "approved" | "rejected",
): Promise<ApprovalRequest[]> {
  const q = status ? `?status=${status}` : "";
  const data = await apiJson<{ approvals: ApprovalRequest[] }>(`/api/approvals${q}`);
  return data.approvals;
}

/**
 * POST /api/approvals — producer ingress.
 * @param ingress - ApprovalIngress body
 * @returns Created pending approval
 */
export async function submitApproval(ingress: ApprovalIngress): Promise<ApprovalRequest> {
  const data = await apiJson<{ approval: ApprovalRequest }>("/api/approvals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ingress),
  });
  return data.approval;
}

/**
 * POST /api/approvals/:id/decide — human approve|reject.
 * @param id - Approval id
 * @param input - Choice + actor/note
 * @returns Updated approval (ledger)
 */
export async function decideApproval(
  id: string,
  input: { choice: ApprovalChoice; actorId?: string; note?: string },
): Promise<ApprovalRequest> {
  const data = await apiJson<{ approval: ApprovalRequest }>(
    `/api/approvals/${id}/decide`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return data.approval;
}

/**
 * GET /api/settings — Hub Settings document (M21).
 * @returns Full settings snapshot (nav + accounts + routing + usage)
 */
export async function fetchSettings(): Promise<HubSettingsDocument> {
  const data = await apiJson<{ settings: HubSettingsDocument }>("/api/settings");
  return data.settings;
}

/**
 * PATCH /api/settings/routing — update routing policy (next invoke).
 * @param patch - Partial RoutingPolicy fields
 * @returns Updated policy
 */
export async function patchRoutingPolicy(
  patch: Partial<RoutingPolicy>,
): Promise<RoutingPolicy> {
  const data = await apiJson<{ routing: RoutingPolicy }>("/api/settings/routing", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return data.routing;
}
