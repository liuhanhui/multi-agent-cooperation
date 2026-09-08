import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "./types.js";
import { prependSystemSnippet, runCliNdjson } from "./cli-line-stream.js";
import { parseCodexLine } from "./codex-stream-parse.js";

export interface CodexProviderOptions {
  /** Executable name or path. Default: codex */
  command?: string;
  cwd?: string;
  timeoutMs?: number;
  /**
   * Sandbox mode when not using `--approve-for-me`.
   * Codex forbids combining `--sandbox` with `--approve-for-me`.
   * Default: workspace-write
   */
  sandbox?: string;
  /**
   * When true, pass `--approve-for-me` (implies workspace-write sandbox approvals).
   * Do not also pass `--sandbox` — Codex rejects that combination.
   * Default true; set MAC_CODEX_APPROVE_FOR_ME=0 to use `--sandbox` instead.
   */
  approveForMe?: boolean;
}

/**
 * Codex CLI adapter (`codex exec --json`) → AgentStreamEvent.
 * @param opts - command path, cwd, timeout, sandbox / approve-for-me overrides
 * @returns AgentProvider with id "codex"
 */
export function createCodexProvider(opts: CodexProviderOptions = {}): AgentProvider {
  const command = opts.command ?? process.env.MAC_CODEX_COMMAND ?? "codex";
  const defaultCwd = opts.cwd ?? process.env.MAC_AGENT_CWD ?? process.cwd();
  const defaultTimeout = opts.timeoutMs ?? Number(process.env.MAC_AGENT_TIMEOUT_MS ?? 600_000);
  const sandbox = opts.sandbox ?? process.env.MAC_CODEX_SANDBOX ?? "workspace-write";
  // Current Codex CLI: `--approve-for-me` replaces old `--ask-for-approval`,
  // and must not be combined with `--sandbox` (mutually exclusive).
  const approveForMe =
    opts.approveForMe ?? process.env.MAC_CODEX_APPROVE_FOR_ME !== "0";

  return {
    id: "codex",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      const cwd = input.cwd ?? defaultCwd;
      const timeoutMs = input.timeoutMs ?? defaultTimeout;
      // Codex has no Claude-style --append-system-prompt; fold snippet into the prompt.
      const prompt = prependSystemSnippet(input.prompt, input.systemSnippet);
      const args = ["exec", "--json"];
      if (approveForMe) {
        args.push("--approve-for-me");
      } else {
        args.push("--sandbox", sandbox);
      }
      args.push(prompt);

      yield* runCliNdjson({
        command,
        args,
        cwd,
        timeoutMs,
        signal: input.signal,
        processLabel: "codex",
        parseLine: parseCodexLine,
      });
    },
  };
}
