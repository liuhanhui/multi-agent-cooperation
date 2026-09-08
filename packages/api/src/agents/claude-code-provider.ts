import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "./types.js";
import {
  extractClaudeAssistantText,
  extractClaudeDelta,
  extractClaudeResultText,
} from "./claude-stream-parse.js";
import { prepareSpawnArgs, quoteWinShellArg, shouldUseWinShell } from "./cli-line-stream.js";

export interface ClaudeCodeProviderOptions {
  /** Executable name or path. Default: claude */
  command?: string;
  /** Working directory for the CLI. Default: process.cwd() */
  cwd?: string;
  /** Permission mode passed to Claude Code. Default: dontAsk */
  permissionMode?: string;
  /** Default timeout for an invocation. Default: 600_000 (10m; coding CLIs need more than 2m). */
  timeoutMs?: number;
}

export function createClaudeCodeProvider(opts: ClaudeCodeProviderOptions = {}): AgentProvider {
  const command = opts.command ?? process.env.MAC_CLAUDE_COMMAND ?? "claude";
  const defaultCwd = opts.cwd ?? process.env.MAC_AGENT_CWD ?? process.cwd();
  const permissionMode =
    opts.permissionMode ?? process.env.MAC_CLAUDE_PERMISSION_MODE ?? "dontAsk";
  const defaultTimeout = opts.timeoutMs ?? Number(process.env.MAC_AGENT_TIMEOUT_MS ?? 600_000);

  return {
    id: "claude-code",
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      const cwd = input.cwd ?? defaultCwd;
      const timeoutMs = input.timeoutMs ?? defaultTimeout;
      const args = [
        "-p",
        input.prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--permission-mode",
        permissionMode,
      ];
      if (input.systemSnippet) {
        args.push("--append-system-prompt", input.systemSnippet);
      }

      // Same Windows shell policy as runCliNdjson (argv for .exe; shell for .cmd shims).
      const useShell = shouldUseWinShell(command);
      const child = spawn(
        useShell ? quoteWinShellArg(command) : command,
        useShell ? prepareSpawnArgs(args) : args,
        {
          cwd,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          shell: useShell,
        },
      );

      const queue: AgentStreamEvent[] = [];
      let wake: (() => void) | null = null;
      let done = false;
      let failed: string | null = null;
      let streamed = "";
      let finalText: string | null = null;
      let stderr = "";

      const push = (event: AgentStreamEvent) => {
        queue.push(event);
        wake?.();
      };

      const onAbort = () => {
        failed = "aborted";
        child.kill();
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });

      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              failed = `timeout after ${timeoutMs}ms`;
              child.kill();
            }, timeoutMs)
          : null;

      if (child.stdout) {
        const rl = createInterface({ input: child.stdout });
        rl.on("line", (line) => {
          const delta = extractClaudeDelta(line);
          if (delta) {
            streamed += delta;
            push({ type: "delta", text: delta });
            return;
          }
          const assistant = extractClaudeAssistantText(line);
          if (assistant && assistant.length > streamed.length) {
            const extra = assistant.slice(streamed.length);
            if (extra) {
              streamed = assistant;
              push({ type: "delta", text: extra });
            }
          }
          const result = extractClaudeResultText(line);
          if (result) finalText = result;
        });
      }

      if (child.stderr) {
        child.stderr.on("data", (buf: Buffer) => {
          stderr += buf.toString("utf8");
        });
      }

      const exitPromise = new Promise<void>((resolve) => {
        child.on("error", (err) => {
          failed = err.message;
          done = true;
          wake?.();
          resolve();
        });
        child.on("close", (code, signal) => {
          if (timer) clearTimeout(timer);
          input.signal?.removeEventListener("abort", onAbort);
          if (!failed && code !== 0 && code !== null) {
            const hint = stderr.trim().slice(0, 400);
            failed = `claude exited ${code}${signal ? ` signal=${signal}` : ""}${hint ? `: ${hint}` : ""}`;
          } else if (!failed && signal) {
            failed = `claude killed by signal ${signal}`;
          }
          done = true;
          wake?.();
          resolve();
        });
      });

      try {
        while (!done || queue.length > 0) {
          if (queue.length === 0) {
            await new Promise<void>((r) => {
              wake = r;
            });
            wake = null;
            continue;
          }
          const event = queue.shift();
          if (event) yield event;
        }
        await exitPromise;

        if (failed) {
          yield { type: "failed", error: failed };
          return;
        }
        const text = finalText ?? streamed;
        yield { type: "completed", text };
      } finally {
        if (timer) clearTimeout(timer);
        input.signal?.removeEventListener("abort", onAbort);
        if (!child.killed) child.kill();
      }
    },
  };
}
