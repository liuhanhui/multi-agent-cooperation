/**
 * Skill catalog entry summary (M12).
 * Bodies live in SKILL.md; this shape is what Hub browse + match telemetry use.
 */
export interface SkillSummary {
  /** Stable id (directory name / frontmatter name). */
  id: string;
  /** Display name (usually same as id). */
  name: string;
  /** Routing description shown in Hub and used as weak match signal. */
  description: string;
  /** Phrases that trigger on-demand injection when found in the prompt. */
  triggers: string[];
  /** Rough token estimate for budget accounting (chars/4). */
  estimatedTokens: number;
  /** Repo-relative path to SKILL.md. */
  path: string;
}

/**
 * Full skill payload including markdown body (for Hub detail + injection).
 */
export interface SkillDetail extends SkillSummary {
  /** Markdown body after YAML frontmatter. */
  body: string;
}

/**
 * Result of matching a prompt against the skill catalog under a token budget.
 */
export interface SkillMatchResult {
  /** Skills selected for injection (order preserved). */
  matched: SkillSummary[];
  /** Skills considered but not injected (budget / disabled). */
  skipped: Array<{ id: string; reason: string }>;
  /** Ids actually injected (same as matched[].id). */
  injectedIds: string[];
  /** Sum of estimatedTokens for injected skills. */
  totalTokens: number;
  /** Budget used for this match. */
  budgetTokens: number;
}
