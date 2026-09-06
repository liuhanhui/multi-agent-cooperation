import type { CatConfig, HealthResponse, SkillDetail, SkillSummary, Thread } from "@mac/shared";
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
