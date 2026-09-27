/**
 * M29 token usage accounting.
 * One record per assistant turn (keyed by assistant message id); the ledger is append-only.
 */

/**
 * Token counts reported by one CLI turn, normalized across provider families.
 * `inputTokens` never includes cache reads — Codex's cached input is split out so
 * totals are comparable with Claude's `cache_read_input_tokens`.
 */
export interface TokenUsage {
  /** Adapter family that produced the numbers (claude-code / codex / antigravity / fake). */
  provider: string;
  /** Model name when the CLI reports one; null otherwise. */
  model: string | null;
  /** Fresh (non-cached) prompt tokens. */
  inputTokens: number;
  outputTokens: number;
  /** Prompt tokens served from the provider cache. */
  cacheReadTokens: number;
  /** Prompt tokens written into the provider cache (Claude only today). */
  cacheWriteTokens: number;
  /** input + output + cacheRead + cacheWrite. */
  totalTokens: number;
  /** CLI-reported cost in USD; null when the family does not report cost. */
  costUsd: number | null;
  /** True when counts are a character-based estimate (fake provider), not CLI truth. */
  estimated: boolean;
}

/** Durable ledger row for one assistant turn. */
export interface UsageRecord extends TokenUsage {
  id: string;
  messageId: string;
  threadId: string;
  catId: string;
  /** UTC YYYY-MM-DD used for daily buckets. */
  dayKey: string;
  createdAt: string;
}

/** Summed counters for a set of usage records. */
export interface UsageTotals {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  /** Sum of reported costs; turns without a cost contribute nothing. */
  costUsd: number;
  /** How many turns in this bucket were estimates rather than CLI-reported. */
  estimatedTurns: number;
}

/** Totals grouped by one dimension value (cat id, provider, or day key). */
export interface UsageBucket extends UsageTotals {
  key: string;
}

/** GET /api/usage response. */
export interface UsageSummary {
  /** Inclusive UTC day window. */
  range: { fromDay: string; toDay: string; days: number };
  /** Set when the summary is scoped to one thread. */
  threadId: string | null;
  totals: UsageTotals;
  byCat: UsageBucket[];
  byProvider: UsageBucket[];
  /** Oldest → newest; every day in range is present (zero-filled). */
  byDay: UsageBucket[];
  /** Newest first, capped. */
  recent: UsageRecord[];
}
