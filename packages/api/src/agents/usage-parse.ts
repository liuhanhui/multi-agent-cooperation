import type { TokenUsage } from "@mac/shared";

/** Raw counts before provider/model/total are attached. */
export interface UsageCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Read a non-negative integer from an unknown JSON value.
 * @param value - Candidate field value
 * @returns Integer ≥ 0, or 0 when missing/invalid
 */
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/**
 * Build a normalized TokenUsage from counts.
 * @param provider - Adapter family id
 * @param counts - Normalized counts (input excludes cache reads)
 * @param extra - Optional model / cost / estimated flag
 * @returns TokenUsage with totalTokens computed
 */
export function makeTokenUsage(
  provider: string,
  counts: UsageCounts,
  extra: { model?: string | null; costUsd?: number | null; estimated?: boolean } = {},
): TokenUsage {
  return {
    provider,
    model: extra.model ?? null,
    inputTokens: counts.inputTokens,
    outputTokens: counts.outputTokens,
    cacheReadTokens: counts.cacheReadTokens,
    cacheWriteTokens: counts.cacheWriteTokens,
    totalTokens:
      counts.inputTokens + counts.outputTokens + counts.cacheReadTokens + counts.cacheWriteTokens,
    costUsd: extra.costUsd ?? null,
    estimated: extra.estimated ?? false,
  };
}

/**
 * Sum several usage events from the same turn into one record.
 * Cost stays null only when no event reported one; model keeps the last non-null.
 * @param items - Usage events in arrival order (non-empty)
 * @returns Combined TokenUsage
 */
export function sumTokenUsage(items: TokenUsage[]): TokenUsage {
  const first = items[0];
  if (!first) throw new Error("sumTokenUsage requires at least one item");
  let costUsd: number | null = null;
  let model: string | null = null;
  const counts: UsageCounts = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  for (const item of items) {
    counts.inputTokens += item.inputTokens;
    counts.outputTokens += item.outputTokens;
    counts.cacheReadTokens += item.cacheReadTokens;
    counts.cacheWriteTokens += item.cacheWriteTokens;
    if (item.costUsd !== null) costUsd = (costUsd ?? 0) + item.costUsd;
    if (item.model) model = item.model;
  }
  return makeTokenUsage(first.provider, counts, {
    model,
    costUsd,
    // Any estimated piece makes the whole turn an estimate.
    estimated: items.some((item) => item.estimated),
  });
}

/**
 * Best-effort read of a usage object with common key spellings.
 * Handles Anthropic (`input_tokens`, `cache_read_input_tokens`), OpenAI/Codex
 * (`input_tokens` includes `cached_input_tokens`), and camelCase variants.
 * @param raw - Unknown `usage` JSON value
 * @param inputIncludesCache - True when the family counts cached tokens inside input
 * @returns Normalized counts, or null when no token field is present
 */
export function readUsageCounts(raw: unknown, inputIncludesCache: boolean): UsageCounts | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const input = count(u.input_tokens ?? u.inputTokens ?? u.prompt_tokens ?? u.promptTokens);
  const output = count(
    u.output_tokens ?? u.outputTokens ?? u.completion_tokens ?? u.completionTokens,
  );
  const cacheRead = count(
    u.cache_read_input_tokens ?? u.cached_input_tokens ?? u.cacheReadTokens ?? u.cachedInputTokens,
  );
  const cacheWrite = count(u.cache_creation_input_tokens ?? u.cacheWriteTokens);
  if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) return null;
  return {
    // Keep input and cache disjoint so totals do not double count.
    inputTokens: inputIncludesCache ? Math.max(0, input - cacheRead) : input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  };
}

/**
 * Rough token estimate (~4 chars per token) for providers that report nothing.
 * @param text - Prompt or reply text
 * @returns Estimated token count (0 for empty text)
 */
export function estimateTokens(text: string): number {
  return text.length === 0 ? 0 : Math.ceil(text.length / 4);
}
