/**
 * Parse one NDJSON line from `claude -p --output-format stream-json --include-partial-messages`.
 * Returns text deltas when present; ignores unrelated events.
 */
export function extractClaudeDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.type === "stream_event" && obj.event && typeof obj.event === "object") {
    const event = obj.event as Record<string, unknown>;
    const delta = event.delta;
    if (delta && typeof delta === "object") {
      const d = delta as Record<string, unknown>;
      if (d.type === "text_delta" && typeof d.text === "string" && d.text.length > 0) {
        return d.text;
      }
    }
  }

  return null;
}

/** Final result text from a stream-json `result` line, if any. */
export function extractClaudeResultText(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.type !== "result") return null;
  if (typeof obj.result === "string") return obj.result;
  if (typeof obj.result === "object" && obj.result && "content" in (obj.result as object)) {
    const content = (obj.result as { content?: unknown }).content;
    if (typeof content === "string") return content;
  }
  return null;
}

export function extractClaudeAssistantText(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.type !== "assistant") return null;
  const message = obj.message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
    }
  }
  return texts.length > 0 ? texts.join("") : null;
}
