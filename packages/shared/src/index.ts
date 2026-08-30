/** Shared contracts — keep terminal schemas here (extend, don't throw away). */

export type HealthStatus = "ok" | "degraded";

export interface HealthResponse {
  status: HealthStatus;
  service: "mac-api";
  version: string;
  store: "memory" | "redis";
  timestamp: string;
}

export interface AgentIdentity {
  id: string;
  displayName: string;
  role: string;
  provider: string;
}

/** Placeholder ports for Wave 1 — real stores arrive in M03. */
export interface ThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
