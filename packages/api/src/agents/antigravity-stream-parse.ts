import type { CliLineParseResult } from "./cli-line-stream.js";

/**
 * Parse one `agy -p --output-format stream-json` NDJSON line.
 * Emits text_delta from agent_response steps; final response from result.
 * @param line - Raw stdout line
 * @returns delta | final | fail | ignore
 */
export function parseAntigravityLine(line: string): CliLineParseResult {
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
  const event = typeof obj.event === "string" ? obj.event : "";

  if (event === "step_update" && obj.step_update && typeof obj.step_update === "object") {
    const step = obj.step_update as Record<string, unknown>;
    // Only agent_response carries assistant prose; tool/checkpoint noise is ignored.
    if (step.step_type === "agent_response" && typeof step.text_delta === "string" && step.text_delta.length > 0) {
      return { kind: "delta", text: step.text_delta };
    }
    return { kind: "ignore" };
  }

  if (event === "result" && obj.result && typeof obj.result === "object") {
    const result = obj.result as Record<string, unknown>;
    const status = typeof result.status === "string" ? result.status : "";
    if (status === "ERROR" || status === "FAILED") {
      const message =
        typeof result.error === "string"
          ? result.error
          : typeof result.message === "string"
            ? result.message
            : "antigravity result error";
      return { kind: "fail", error: message };
    }
    if (typeof result.response === "string") {
      return { kind: "final", text: result.response };
    }
  }

  return { kind: "ignore" };
}
