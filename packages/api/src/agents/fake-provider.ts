import type { AgentInvokeInput, AgentProvider, AgentStreamEvent } from "./types.js";

export interface FakeAgentOptions {
  id?: string;
  chunks?: string[];
  delayMs?: number;
  failWith?: string;
}

/** Deterministic provider for tests / offline demos. */
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
      yield { type: "completed", text: full };
    },
  };
}
