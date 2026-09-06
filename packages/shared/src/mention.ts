/** Minimal cat fields needed to resolve @tokens (avoids circular import with index). */
export interface MentionCat {
  id: string;
  displayName: string;
}

/**
 * Result of scanning leading @mentions from operator text.
 * - targets: resolved cat ids in mention order (may be empty)
 * - prompt: remainder after the leading mention run
 * - unresolved: unknown tokens found in the leading run (fail-closed signal)
 */
export interface ParsedMentions {
  targets: string[];
  prompt: string;
  unresolved: string[];
}

/**
 * Legacy single-target shape used by M06 web helpers.
 * Prefer {@link parseMentions} for routing.
 */
export interface ParsedMention {
  catId: string | null;
  prompt: string;
  rawMention: string | null;
}

/**
 * Resolve one @token against known cats by id, then by displayName
 * (case-insensitive; whitespace stripped for name match).
 * @param token - Text after `@` without spaces
 * @param cats - Registry/member cats available for resolution
 * @returns Canonical cat id, or null when the token is unknown
 */
function resolveCatToken(token: string, cats: MentionCat[]): string | null {
  const byId = cats.find((c) => c.id.toLowerCase() === token.toLowerCase());
  if (byId) return byId.id;
  const normalized = token.replace(/\s+/g, "").toLowerCase();
  const byName = cats.find(
    (c) => c.displayName.replace(/\s+/g, "").toLowerCase() === normalized,
  );
  return byName?.id ?? null;
}

/**
 * Parse a leading run of `@cat` mentions for routing.
 * Only consecutive mentions at the start of the trimmed input count;
 * mid-sentence `@` tokens stay in the prompt (M07 scope).
 * @param input - Raw operator text (may start with one or more @tokens)
 * @param cats - Cats used to map token → catId
 * @returns Ordered targets, prompt body, and any unresolved leading tokens
 */
export function parseMentions(input: string, cats: MentionCat[]): ParsedMentions {
  let remaining = input.trim();
  const targets: string[] = [];
  const unresolved: string[] = [];

  // Consume only a leading @token run; stop on first non-mention word.
  while (true) {
    const match = /^@([^\s]+)(?:\s+|$)/.exec(remaining);
    if (!match) break;
    const token = match[1] ?? "";
    const resolved = resolveCatToken(token, cats);
    if (!resolved) {
      // Fail-closed: record unknown token and keep scanning remainder as prompt.
      unresolved.push(token);
      remaining = remaining.slice(match[0].length).trim();
      break;
    }
    targets.push(resolved);
    remaining = remaining.slice(match[0].length).trim();
  }

  return { targets, prompt: remaining, unresolved };
}

/**
 * Parse only the first leading @mention (M06 / composer convenience).
 * @param input - Raw composer input
 * @param cats - Known cats for token resolution
 * @returns First resolved catId (or null), prompt remainder, and raw token
 */
export function parseLeadingMention(input: string, cats: MentionCat[]): ParsedMention {
  const trimmed = input.trim();
  const match = /^@([^\s]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) {
    return { catId: null, prompt: trimmed, rawMention: null };
  }
  const token = match[1] ?? "";
  const rest = (match[2] ?? "").trim();
  const catId = resolveCatToken(token, cats);
  if (!catId) {
    // Keep full text so the operator can edit an unknown mention.
    return { catId: null, prompt: trimmed, rawMention: token };
  }
  return { catId, prompt: rest, rawMention: token };
}

/**
 * Build a composer prefix that @mentions a cat by id.
 * @param cat - Target cat, or null/undefined when none selected
 * @returns `@id ` ready to prepend, or empty string
 */
export function mentionSuggestion(cat: MentionCat | null | undefined): string {
  if (!cat) return "";
  return `@${cat.id} `;
}
