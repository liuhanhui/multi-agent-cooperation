/**
 * Rough token estimate from text length (≈4 chars per token).
 * @param text - Any string (description + body)
 * @returns Non-negative integer estimate
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export interface ParsedSkillMarkdown {
  name: string;
  description: string;
  triggers: string[];
  body: string;
}

/**
 * Parse a SKILL.md document with optional YAML frontmatter.
 * Supports a minimal subset: name, description (|> or plain), triggers list.
 * @param raw - Full file contents
 * @returns Parsed fields; name defaults to empty when missing
 */
export function parseSkillMarkdown(raw: string): ParsedSkillMarkdown {
  const normalized = raw.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return { name: "", description: "", triggers: [], body: normalized.trim() };
  }

  const end = normalized.indexOf("\n---", 3);
  if (end < 0) {
    return { name: "", description: "", triggers: [], body: normalized.trim() };
  }

  const front = normalized.slice(3, end).trim();
  const body = normalized.slice(end + 4).replace(/^\r?\n/, "").trim();

  const name = readScalar(front, "name") ?? "";
  const description = readBlockOrScalar(front, "description") ?? "";
  const triggers = readStringList(front, "triggers");

  return { name, description, triggers, body };
}

/**
 * Read a single-line scalar `key: value` from frontmatter text.
 * @param front - YAML frontmatter block
 * @param key - Field name
 * @returns Trimmed value or null
 */
function readScalar(front: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const m = front.match(re);
  if (!m?.[1]) return null;
  return stripQuotes(m[1].trim());
}

/**
 * Read `key: >` / `|` block or inline scalar.
 * @param front - YAML frontmatter block
 * @param key - Field name
 * @returns Joined description text or null
 */
function readBlockOrScalar(front: string, key: string): string | null {
  const lines = front.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${key}:\\s*`).test(l));
  if (start < 0) return null;
  const first = lines[start]!;
  const inline = first.replace(new RegExp(`^${key}:\\s*`), "");
  if (inline && inline !== ">" && inline !== "|" && inline !== ">-" && inline !== "|-") {
    return stripQuotes(inline.trim());
  }

  const collected: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    // Next top-level key ends the block.
    if (/^[a-zA-Z_][\w-]*\s*:/.test(line)) break;
    collected.push(line.replace(/^\s{2}/, ""));
  }
  return collected.join("\n").trim() || null;
}

/**
 * Read a YAML list under `key:`.
 * @param front - YAML frontmatter block
 * @param key - Field name
 * @returns List of strings (may be empty)
 */
function readStringList(front: string, key: string): string[] {
  const lines = front.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${key}:\\s*$`).test(l) || new RegExp(`^${key}:\\s*\\[`).test(l));
  if (start < 0) return [];

  const first = lines[start]!;
  const inline = first.replace(new RegExp(`^${key}:\\s*`), "").trim();
  if (inline.startsWith("[") && inline.endsWith("]")) {
    return inline
      .slice(1, -1)
      .split(",")
      .map((s) => stripQuotes(s.trim()))
      .filter(Boolean);
  }

  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^[a-zA-Z_][\w-]*\s*:/.test(line)) break;
    const m = line.match(/^\s*-\s*(.+)$/);
    if (m?.[1]) out.push(stripQuotes(m[1].trim()));
  }
  return out;
}

/**
 * Strip matching single/double quotes from a YAML scalar.
 * @param value - Raw scalar
 * @returns Unquoted string
 */
function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
