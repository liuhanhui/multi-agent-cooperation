export interface AgentIdentity {
  id: string;
  displayName: string;
  role: string;
  provider: string;
}

/**
 * Cat registry entry (M05). Loaded read-only from agent-config.json.
 * Never put secrets (apiKey / token / password) in this file.
 */
export interface CatConfig {
  id: string;
  displayName: string;
  role: string;
  provider: string;
  systemSnippet?: string;
  /** Optional model hint for future adapters */
  defaultModel?: string;
}
