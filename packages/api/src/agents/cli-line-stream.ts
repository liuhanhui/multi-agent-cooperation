import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentStreamEvent } from "./types.js";

/**
 * Result of parsing one stdout NDJSON/plain line from a CLI adapter.
 * Adapters map family-specific event shapes into these kinds.
 */
export type CliLineParseResult =
  | { kind: "delta"; text: string }
  | { kind: "final"; text: string }
  | { kind: "fail"; error: string }
  | { kind: "ignore" };

export interface RunCliNdjsonParams {
  /** Executable name or path. */
  command: string;
  /** argv after the executable. */
  args: string[];
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Short label for exit/timeout error strings (e.g. "codex"). */
  processLabel: string;
  /**
   * Parse one stdout line into a normalized stream event hint.
   * @param line - Raw stdout line (may be JSON or plain)
   */
  parseLine: (line: string) => CliLineParseResult;
}

/**
 * Quote one argv token for Windows `spawn({ shell: true })`.
 * Node joins args with spaces and does not escape; unquoted spaces truncate prompts.
 * @param arg - Raw argument (may contain spaces / quotes)
 * @returns cmd.exe-safe token
 */
export function quoteWinShellArg(arg: string): string {
  if (arg.length === 0) return '""';
  // No whitespace or cmd metacharacters → pass through.
  if (!/[\s"&<>|^()]/.test(arg)) return arg;
  // cmd.exe: wrap in doubles; embed doubles by doubling them.
  return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * Prepare argv for spawn: quote on Windows shell so prompts with spaces stay intact.
 * @param args - Raw argv
 * @returns Args safe for the current platform spawn mode
 */
export function prepareSpawnArgs(args: string[]): string[] {
  if (process.platform !== "win32") return args;
  return args.map(quoteWinShellArg);
}

/**
 * Whether Windows spawn must use `shell: true`.
 * Bare names like `claude`/`codex` may be `.cmd` shims; absolute `.exe` paths must NOT
 * use shell — cmd.exe flattens argv and breaks multiline `-p` prompts (empty agent replies).
 * @param command - Executable name or path
 * @returns true only when a cmd shim is likely
 */
export function shouldUseWinShell(command: string): boolean {
  if (process.platform !== "win32") return false;
  // Path separators or explicit .exe → real binary; pass argv directly.
  if (/[\\/]/.test(command) || /\.exe$/i.test(command)) return false;
  return true;
}

/**
 * Basename for Hub progress labels (hide long Windows paths).
 * @param command - Executable path or name
 * @returns Short label (e.g. agy.exe)
 */
export function shortCommandLabel(command: string): string {
  const normalized = command.replace(/\\/g, "/");
  const base = normalized.split("/").pop();
  return base && base.length > 0 ? base : command;
}

/**
 * Spawn a CLI, parse NDJSON/plain stdout lines, and yield AgentStreamEvents.
 * Emits progress before/while waiting for the first model tokens so Hub is not blank.
 * @param params - command/args, cwd, timeout, signal, parseLine
 * @yields progress / delta / completed / failed events
 */
export async function* runCliNdjson(
  params: RunCliNdjsonParams,
): AsyncIterable<AgentStreamEvent> {
  const { command, args, cwd, timeoutMs, signal, processLabel, parseLine } = params;
  const label = shortCommandLabel(command);

  yield {
    type: "progress",
    phase: "spawning",
    detail: `Starting ${processLabel} (${label})…`,
  };

  const useShell = shouldUseWinShell(command);
  // Only quote when shell will concatenate; otherwise argv preserves newlines in -p.
  const spawnCommand = useShell ? quoteWinShellArg(command) : command;
  const spawnArgs = useShell ? prepareSpawnArgs(args) : args;
  const child = spawn(spawnCommand, spawnArgs, {
    cwd,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: useShell,
  });

  const queue: AgentStreamEvent[] = [];
  let wake: (() => void) | null = null;
  let done = false;
  let failed: string | null = null;
  let streamed = "";
  let finalText: string | null = null;
  let stderr = "";
  let sawStdout = false;

  const push = (event: AgentStreamEvent) => {
    queue.push(event);
    wake?.();
  };

  // Process is alive — tell Hub before first token (coding CLIs can be silent for minutes).
  if (typeof child.pid === "number" && child.pid > 0) {
    push({
      type: "progress",
      phase: "running",
      detail: `${processLabel} running (pid ${child.pid}) · waiting for output…`,
    });
  } else {
    push({
      type: "progress",
      phase: "running",
      detail: `${processLabel} launched · waiting for output…`,
    });
  }

  const onAbort = () => {
    failed = "aborted";
    child.kill();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

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
      if (failed) return;
      if (!sawStdout) {
        sawStdout = true;
        push({
          type: "progress",
          phase: "stdout",
          detail: `${processLabel} is producing output…`,
        });
      }
      const result = parseLine(line);
      if (result.kind === "delta") {
        streamed += result.text;
        push({ type: "delta", text: result.text });
      } else if (result.kind === "final") {
        finalText = result.text;
      } else if (result.kind === "fail") {
        failed = result.error;
        child.kill();
      }
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (buf: Buffer) => {
      stderr += buf.toString("utf8");
      // Surface early stderr while still silent on stdout (auth / missing model hints).
      if (!sawStdout && !failed) {
        const hint = stderr.trim().split(/\r?\n/).filter(Boolean).at(-1)?.slice(0, 160);
        if (hint) {
          push({
            type: "progress",
            phase: "waiting",
            detail: `${processLabel} stderr: ${hint}`,
          });
        }
      }
    });
  }

  const exitPromise = new Promise<void>((resolve) => {
    child.on("error", (err) => {
      failed = err.message;
      done = true;
      wake?.();
      resolve();
    });
    child.on("close", (code, signalName) => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (!failed && code !== 0 && code !== null) {
        const hint = stderr.trim().slice(0, 400);
        failed = `${processLabel} exited ${code}${signalName ? ` signal=${signalName}` : ""}${
          hint ? `: ${hint}` : ""
        }`;
      } else if (!failed && signalName) {
        failed = `${processLabel} killed by signal ${signalName}`;
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
    signal?.removeEventListener("abort", onAbort);
    if (!child.killed) child.kill();
  }
}

/**
 * Prepend systemSnippet to the user prompt when the CLI has no native flag.
 * @param prompt - User / routed prompt
 * @param systemSnippet - Optional cat system text
 * @returns Combined prompt string
 */
export function prependSystemSnippet(prompt: string, systemSnippet?: string): string {
  if (!systemSnippet?.trim()) return prompt;
  return `[System]\n${systemSnippet.trim()}\n\n[User]\n${prompt}`;
}
