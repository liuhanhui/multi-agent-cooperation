import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "./types.js";
import { estimateTokens, makeTokenUsage } from "./usage-parse.js";

export interface FakeAgentOptions {
  id?: string;
  chunks?: string[];
  delayMs?: number;
  failWith?: string;
  /**
   * M29: emit a char-based `estimated` usage event before `completed` so the
   * offline demo can show token accounting. Off by default to keep tests exact.
   */
  estimateUsage?: boolean;
}

/**
 * Deterministic provider for tests / offline demos.
 * @param opts - id, streamed chunks, per-chunk delay, forced failure, usage estimate toggle
 * @returns AgentProvider yielding delta… [usage] completed (or a single failed)
 */
export function createFakeAgentProvider(opts: FakeAgentOptions = {}): AgentProvider {
  const id = opts.id ?? "fake";
  const chunks = opts.chunks ?? ["Hello", " from ", "fake"];
  const delayMs = opts.delayMs ?? 5;

  return {
    id,
    async *invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent> {
      if (opts.failWith) {
        yield { type: "failed", error: opts.failWith };
        return;
      }
      if (input.signal?.aborted) {
        yield { type: "failed", error: "aborted" };
        return;
      }
      let full = "";
      for (const text of chunks) {
        if (input.signal?.aborted) {
          yield { type: "failed", error: "aborted" };
          return;
        }
        full += text;
        yield { type: "delta", text };
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
      if (opts.estimateUsage) {
        yield {
          type: "usage",
          usage: makeTokenUsage(
            id,
            {
              inputTokens: estimateTokens(`${input.systemSnippet ?? ""}${input.prompt}`),
              outputTokens: estimateTokens(full),
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
            { estimated: true },
          ),
        };
      }
      yield { type: "completed", text: full };
    },
  };
}
