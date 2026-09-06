import type { CliLineParseResult } from "./cli-line-stream.js";

/**
 * Parse one `codex exec --json` NDJSON line into a normalized stream hint.
 * Prefers agent_message item completions; surfaces turn.failed / error.
 * @param line - Raw stdout line
 * @returns delta | final | fail | ignore
 */
export function parseCodexLine(line: string): CliLineParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "ignore" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: "ignore" };
  }
  if (!parsed || typeof parsed !== "object") return { kind: "ignore" };
  const obj = parsed as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : "";

  if (type === "turn.failed") {
    const err = obj.error;
    const message =
      err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : "codex turn failed";
    return { kind: "fail", error: message };
  }

  if (type === "error") {
    const message =
      typeof obj.message === "string"
        ? obj.message
        : obj.error && typeof obj.error === "object" && typeof (obj.error as { message?: unknown }).message === "string"
          ? (obj.error as { message: string }).message
          : "codex error";
    // Transient reconnect notices are non-fatal in some Codex builds.
    if (/reconnecting/i.test(message)) return { kind: "ignore" };
    return { kind: "fail", error: message };
  }

  // item.completed with agent_message carries the assistant reply (often once per turn).
  if (type === "item.completed" || type === "item.updated") {
    const item = obj.item;
    if (!item || typeof item !== "object") return { kind: "ignore" };
    const it = item as Record<string, unknown>;
    if (it.type === "agent_message" && typeof it.text === "string" && it.text.length > 0) {
      // Codex json mode typically emits full messages, not token deltas.
      return type === "item.completed"
        ? { kind: "final", text: it.text }
        : { kind: "delta", text: it.text };
    }
  }

  // Older / alternate shapes: msg.type === "text"
  if (obj.msg && typeof obj.msg === "object") {
    const msg = obj.msg as Record<string, unknown>;
    if (msg.type === "text" && typeof msg.content === "string" && msg.content.length > 0) {
      return { kind: "final", text: msg.content };
    }
  }

  return { kind: "ignore" };
}
