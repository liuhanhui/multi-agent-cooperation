/** Agent adapter contracts (M04). */

export type AgentStreamEvent =
  | { type: "delta"; text: string }
  | { type: "completed"; text: string }
  | { type: "failed"; error: string };

export interface AgentInvokeInput {
  prompt: string;
  threadId: string;
  systemSnippet?: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentProvider {
  readonly id: string;
  invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent>;
}
