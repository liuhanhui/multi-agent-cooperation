import type { AgentProvider } from "../agents/types.js";
import type { InvocationCredentialStore } from "../callback-auth/credential-store.js";
import type { CatRegistry } from "../cats/load-cat-config.js";
import type { InvocationDispatcher } from "../dispatch/dispatcher.js";
import type { HandoffService } from "../handoff/handoff-service.js";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";

/**
 * Shared dependencies injected into HTTP/WS route registrars.
 * Kept in one place so create-app stays a thin composition root.
 */
export interface AppDeps {
  store: MacStore;
  hub: ThreadHub;
  storeKind: "memory" | "redis";
  version: string;
  agent?: AgentProvider;
  cats?: CatRegistry;
  /** Present when an agent is configured (M08 dispatch). */
  dispatcher?: InvocationDispatcher;
  /** Present when dispatcher exists (M09 A2A handoff). */
  handoffs?: HandoffService;
  /** M10 short-lived invocation callback tokens + auth telemetry. */
  credentials?: InvocationCredentialStore;
  /** Public base URL used when minting callbackUrl for agents. */
  publicBaseUrl?: string;
}
