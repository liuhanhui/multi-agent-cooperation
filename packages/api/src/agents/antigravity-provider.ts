import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "./types.js";
import { prependSystemSnippet, runCliNdjson } from "./cli-line-stream.js";
import { parseAntigravityLine } from "./antigravity-stream-parse.js";

export interface AntigravityProviderOptions {
  /** Executable name or path. Default: agy */
  command?: string;
  cwd?: string;
  timeoutMs?: number;
  /** Optional model slug (`--model`). */
  model?: string;
  /**
   * When true, pass `--dangerously-skip-permissions` for unattended Hub invokes.
   * Default true (platform non-interactive); set MAC_AGY_SKIP_PERMISSIONS=0 to disable.
   */
  skipPermissions?: boolean;
}

/**
 * Google Antigravity CLI adapter (`agy -p --output-format stream-json`) → AgentStreamEvent.
 * @param opts - command path, cwd, timeout, model, skipPermissions
 * @returns AgentProvider with id "antigravity"
 */
export function createAntigravityProvider(
  opts: AntigravityProviderOptions = {},
): AgentProvider {
  const command = opts.command ?? process.env.MAC_AGY_COMMAND ?? "agy";
  const defaultCwd = opts.cwd ?? process.env.MAC_AGENT_CWD ?? process.cwd();
  const defaultTimeout = opts.timeoutMs ?? Number(process.env.MAC_AGENT_TIMEOUT_MS ?? 120_000);
  const defaultModel = opts.model ?? process.env.MAC_AGY_MODEL;
  const skipPermissions =
    opts.skipPermissions ?? process.env.MAC_AGY_SKIP_PERMISSIONS !== "0";

  return {
    id: "antigravity",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      const cwd = input.cwd ?? defaultCwd;
      const timeoutMs = input.timeoutMs ?? defaultTimeout;
      // No Claude-style append-system flag documented; fold snippet into the prompt.
      const prompt = prependSystemSnippet(input.prompt, input.systemSnippet);
      const args = ["-p", prompt, "--output-format", "stream-json"];
      if (defaultModel) {
        args.push("--model", defaultModel);
      }
      if (skipPermissions) {
        args.push("--dangerously-skip-permissions");
      }

      yield* runCliNdjson({
        command,
        args,
        cwd,
        timeoutMs,
        signal: input.signal,
        processLabel: "agy",
        parseLine: parseAntigravityLine,
      });
    },
  };
}
