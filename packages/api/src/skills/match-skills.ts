import type { SkillDetail, SkillMatchResult, SkillSummary } from "@mac/shared";
import type { SkillRegistry } from "./skill-registry.js";

/**
 * Match prompt text against skill triggers (case-insensitive substring).
 * Honors token budget: later skills are skipped when over budget.
 * Unmatched skills are never injected.
 * @param registry - Loaded skill catalog
 * @param prompt - User/routed prompt (mentions already stripped ok)
 * @param opts.budgetTokens - Override registry budget
 * @returns Match result with injected ids and skip reasons
 */
export function matchSkills(
  registry: SkillRegistry,
  prompt: string,
  opts: { budgetTokens?: number } = {},
): SkillMatchResult {
  const budgetTokens = opts.budgetTokens ?? registry.tokenBudget;
  const haystack = prompt.toLowerCase();
  const matched: SkillSummary[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  let totalTokens = 0;

  for (const summary of registry.list()) {
    const detail = registry.get(summary.id);
    if (!detail) continue;
    if (!skillMatchesPrompt(detail, haystack)) {
      // Done criterion: no hit → do not inject (omit from skipped noise).
      continue;
    }
    if (totalTokens + detail.estimatedTokens > budgetTokens) {
      skipped.push({ id: detail.id, reason: "token_budget" });
      continue;
    }
    matched.push({
      id: detail.id,
      name: detail.name,
      description: detail.description,
      triggers: detail.triggers,
      estimatedTokens: detail.estimatedTokens,
      path: detail.path,
    });
    totalTokens += detail.estimatedTokens;
  }

  return {
    matched,
    skipped,
    injectedIds: matched.map((m) => m.id),
    totalTokens,
    budgetTokens,
  };
}

/**
 * True when any trigger appears as a substring of the prompt.
 * @param skill - Skill with triggers
 * @param haystackLower - Prompt lowercased
 * @returns Whether the skill should be considered for injection
 */
export function skillMatchesPrompt(skill: SkillDetail | SkillSummary, haystackLower: string): boolean {
  if (!skill.triggers.length) return false;
  return skill.triggers.some((t) => {
    const needle = t.trim().toLowerCase();
    return needle.length > 0 && haystackLower.includes(needle);
  });
}

/**
 * Format matched skill bodies into a systemSnippet appendix.
 * @param registry - Catalog for body lookup
 * @param match - Result from matchSkills
 * @returns Empty string when nothing matched; otherwise a labeled block
 */
export function formatSkillInjection(registry: SkillRegistry, match: SkillMatchResult): string {
  if (match.injectedIds.length === 0) return "";
  const parts: string[] = [
    "[Skills — on-demand injection]",
    `Injected: ${match.injectedIds.join(", ")} (tokens≈${match.totalTokens}/${match.budgetTokens})`,
  ];
  for (const id of match.injectedIds) {
    const detail = registry.get(id);
    if (!detail) continue;
    parts.push(`## Skill: ${detail.id}`, detail.body.trim());
  }
  return parts.join("\n\n");
}

/**
 * Match + format in one step for invoke wiring.
 * @param registry - Skill catalog
 * @param prompt - Prompt text
 * @param opts.budgetTokens - Optional override
 * @returns match result and injection text (may be empty)
 */
export function resolveSkillInjection(
  registry: SkillRegistry,
  prompt: string,
  opts: { budgetTokens?: number } = {},
): { match: SkillMatchResult; injection: string } {
  const match = matchSkills(registry, prompt, opts);
  return { match, injection: formatSkillInjection(registry, match) };
}
