import type { AgentProvider } from "../agents/types.js";
import type { CatRegistry } from "../cats/load-cat-config.js";
import type { InvocationDispatcher } from "../dispatch/dispatcher.js";
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
}
