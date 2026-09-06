import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "./types.js";
import { prependSystemSnippet, runCliNdjson } from "./cli-line-stream.js";
import { parseCodexLine } from "./codex-stream-parse.js";

export interface CodexProviderOptions {
  /** Executable name or path. Default: codex */
  command?: string;
  cwd?: string;
  timeoutMs?: number;
  /** Sandbox mode for unattended local runs. Default: workspace-write */
  sandbox?: string;
  /** Approval policy. Default: never (non-interactive). */
  askForApproval?: string;
}

/**
 * Codex CLI adapter (`codex exec --json`) → AgentStreamEvent.
 * @param opts - command path, cwd, timeout, sandbox/approval overrides
 * @returns AgentProvider with id "codex"
 */
export function createCodexProvider(opts: CodexProviderOptions = {}): AgentProvider {
  const command = opts.command ?? process.env.MAC_CODEX_COMMAND ?? "codex";
  const defaultCwd = opts.cwd ?? process.env.MAC_AGENT_CWD ?? process.cwd();
  const defaultTimeout = opts.timeoutMs ?? Number(process.env.MAC_AGENT_TIMEOUT_MS ?? 120_000);
  const sandbox = opts.sandbox ?? process.env.MAC_CODEX_SANDBOX ?? "workspace-write";
  const askForApproval =
    opts.askForApproval ?? process.env.MAC_CODEX_ASK_FOR_APPROVAL ?? "never";

  return {
    id: "codex",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      const cwd = input.cwd ?? defaultCwd;
      const timeoutMs = input.timeoutMs ?? defaultTimeout;
      // Codex has no Claude-style --append-system-prompt; fold snippet into the prompt.
      const prompt = prependSystemSnippet(input.prompt, input.systemSnippet);
      const args = [
        "exec",
        "--json",
        "--sandbox",
        sandbox,
        "--ask-for-approval",
        askForApproval,
        prompt,
      ];

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
