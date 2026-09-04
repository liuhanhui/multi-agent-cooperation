import type { CatConfig } from "@mac/shared";

export interface ParsedMention {
  catId: string | null;
  prompt: string;
  rawMention: string | null;
}

/**
 * Leading @mention helper for M06 (full routing lands in M07).
 * Supports `@id` or `@DisplayName` (case-insensitive, spaces → camel not required).
 */
export function parseLeadingMention(input: string, cats: CatConfig[]): ParsedMention {
  const trimmed = input.trim();
  const match = /^@([^\s]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) {
    return { catId: null, prompt: trimmed, rawMention: null };
  }
  const token = match[1] ?? "";
  const rest = (match[2] ?? "").trim();
  const byId = cats.find((c) => c.id.toLowerCase() === token.toLowerCase());
  if (byId) {
    return { catId: byId.id, prompt: rest, rawMention: token };
  }
  const byName = cats.find(
    (c) => c.displayName.replace(/\s+/g, "").toLowerCase() === token.replace(/\s+/g, "").toLowerCase(),
  );
  if (byName) {
    return { catId: byName.id, prompt: rest, rawMention: token };
  }
  return { catId: null, prompt: trimmed, rawMention: token };
}

export function mentionSuggestion(cat: CatConfig | null | undefined): string {
  if (!cat) return "";
  return `@${cat.id} `;
}
