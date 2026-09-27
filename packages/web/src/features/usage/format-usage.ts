import type { TokenUsage } from "@mac/shared";

/**
 * Compact token count for chips and tables (e.g. 950, 1.2k, 3.4M).
 * @param tokens - Non-negative token count
 * @returns Short human string
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${trimZero((tokens / 1_000).toFixed(1))}k`;
  return `${trimZero((tokens / 1_000_000).toFixed(1))}M`;
}

/**
 * USD cost with enough precision for sub-cent CLI turns.
 * @param usd - Cost in dollars (0 allowed)
 * @returns "$0", "<$0.01" style string, or "$1.23"
 */
export function formatCost(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

/**
 * Bubble chip label; `~` marks char-based estimates so they are never read as CLI truth.
 * @param usage - Turn usage
 * @returns e.g. "1.2k tok" or "~40 tok"
 */
export function usageChipLabel(usage: TokenUsage): string {
  return `${usage.estimated ? "~" : ""}${formatTokens(usage.totalTokens)} tok`;
}

/**
 * Multi-line hover breakdown for one turn.
 * @param usage - Turn usage
 * @returns Tooltip text listing input/output/cache/cost/model
 */
export function usageTooltip(usage: TokenUsage): string {
  const lines = [
    `input ${usage.inputTokens}`,
    `output ${usage.outputTokens}`,
  ];
  if (usage.cacheReadTokens > 0) lines.push(`cache read ${usage.cacheReadTokens}`);
  if (usage.cacheWriteTokens > 0) lines.push(`cache write ${usage.cacheWriteTokens}`);
  if (usage.costUsd !== null) lines.push(`cost ${formatCost(usage.costUsd)}`);
  lines.push(`${usage.provider}${usage.model ? ` · ${usage.model}` : ""}`);
  if (usage.estimated) lines.push("estimated (~4 chars/token), not CLI-reported");
  return lines.join("\n");
}

/**
 * @param value - Fixed-point string like "1.0"
 * @returns Same without a trailing ".0"
 */
function trimZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}
