export type HealthStatus = "ok" | "degraded";

export interface HealthResponse {
  status: HealthStatus;
  service: "mac-api";
  version: string;
  store: "memory" | "redis";
  timestamp: string;
  /** Active AgentProvider id when configured (M04+). */
  agent?: string;
}
