import { estimateTokens } from "../skills/parse-skill-md.js";
import type { EvidenceStore } from "./evidence-store.js";
import type { EvidenceHit, EvidenceRetrievalResult } from "@mac/shared";

export interface RetrieveEvidenceOptions {
  /** Max evidence rows to consider from FTS (default 8). */
  limit?: number;
  /** Token budget for injection packing (default MAC_EVIDENCE_TOKEN_BUDGET or 800). */
  budgetTokens?: number;
}

/**
 * Search evidence for a prompt and format a provenance-tagged injection.
 * No hits → empty injection (Done: do not invent memory).
 * @param store - EvidenceStore
 * @param prompt - Routed user prompt (cue text)
 * @param opts - limit / budget
 * @returns Retrieval result including injection string
 */
export function retrieveEvidenceForPrompt(
  store: EvidenceStore,
  prompt: string,
  opts: RetrieveEvidenceOptions = {},
): EvidenceRetrievalResult {
  const budgetTokens = opts.budgetTokens ?? defaultEvidenceBudget();
  const limit = opts.limit ?? 8;
  const raw = store.search(prompt, limit);
  const hits: EvidenceHit[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  let totalTokens = 0;

  for (const hit of raw) {
    const block = formatEvidenceBlock(hit);
    const tokens = estimateTokens(block);
    if (totalTokens + tokens > budgetTokens) {
      skipped.push({ id: hit.evidence.id, reason: "token_budget" });
      continue;
    }
    hits.push(hit);
    totalTokens += tokens;
  }

  return {
    hits,
    skipped,
    injectedIds: hits.map((h) => h.evidence.id),
    totalTokens,
    budgetTokens,
    injection: formatEvidenceInjection(hits, totalTokens, budgetTokens),
  };
}

/**
 * Build the systemSnippet appendix for evidence hits.
 * @param hits - Packed hits
 * @param totalTokens - Used tokens
 * @param budgetTokens - Budget
 * @returns Injection text or empty string
 */
export function formatEvidenceInjection(
  hits: EvidenceHit[],
  totalTokens: number,
  budgetTokens: number,
): string {
  if (hits.length === 0) return "";
  const lines = [
    "[Evidence — retrieved memory]",
    `Injected: ${hits.length} (tokens≈${totalTokens}/${budgetTokens})`,
    "Use only the facts below; if insufficient, say you lack evidence — do not invent.",
    "",
  ];
  for (const hit of hits) {
    lines.push(formatEvidenceBlock(hit), "");
  }
  return lines.join("\n").trimEnd();
}

/**
 * Format one evidence hit with mandatory provenance line.
 * @param hit - Evidence + BM25 score
 * @returns Markdown-ish block
 */
function formatEvidenceBlock(hit: EvidenceHit): string {
  const e = hit.evidence;
  const p = e.provenance;
  const provParts = [`source=${p.source}`, `recordedAt=${p.recordedAt}`];
  if (p.actorId) provParts.push(`actor=${p.actorId}`);
  if (p.threadId) provParts.push(`thread=${p.threadId}`);
  if (p.messageId) provParts.push(`message=${p.messageId}`);
  const tagLine = e.tags.length ? `tags: ${e.tags.join(", ")}` : "tags: —";
  return [
    `### ${e.title}`,
    `provenance: ${provParts.join("; ")}`,
    tagLine,
    e.body,
  ].join("\n");
}

/**
 * Default injection budget from env or 800 tokens.
 * @returns Positive integer budget
 */
export function defaultEvidenceBudget(): number {
  const raw = process.env.MAC_EVIDENCE_TOKEN_BUDGET;
  if (raw && Number(raw) > 0) return Number(raw);
  return 800;
}
