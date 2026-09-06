/** Agent adapter contracts (M04). */

export type AgentStreamEvent =
  | { type: "delta"; text: string }
  | { type: "completed"; text: string }
  | { type: "failed"; error: string };

export interface AgentInvokeInput {
  prompt: string;
  threadId: string;
  /**
   * Target cat id for this turn (M11).
   * ProviderRouter uses it to pick the CLI family from cat.provider.
   */
  catId?: string;
  systemSnippet?: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Absolute or path URL the agent may POST progress/results to (M10). */
  callbackUrl?: string;
  /** Short-lived bearer token for callbackUrl (M10). */
  callbackToken?: string;
  /** ISO expiry for callbackToken. */
  callbackExpiresAt?: string;
}

export interface AgentProvider {
  readonly id: string;
  invoke(input: AgentInvokeInput): AsyncIterable<AgentStreamEvent>;
}
