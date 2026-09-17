import type { MacStore } from "./types.js";
import { createMemoryStore } from "./memory-store.js";
import { createRedisStore } from "./redis-store.js";

export type StoreKind = "memory" | "redis";

/**
 * Resolve the explicit/default Redis URL while honoring the project port.
 * @param redisUrl - Optional call-site override
 * @returns Valid Redis URL
 */
export function resolveRedisUrl(redisUrl?: string): string {
  if (redisUrl) return redisUrl;
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const redisPort = Number(process.env.MAC_REDIS_PORT ?? 6410);
  if (!Number.isInteger(redisPort) || redisPort < 1 || redisPort > 65535) {
    throw new Error("MAC_REDIS_PORT must be an integer from 1 to 65535");
  }
  return `redis://127.0.0.1:${redisPort}`;
}

/**
 * Create the selected platform store without silently changing durability mode.
 * @param kind - memory for smoke/dev, redis for explicit durable operation
 * @param redisUrl - Optional full Redis URL; wins over environment defaults
 * @returns Connected MacStore
 */
export async function createStore(kind: StoreKind, redisUrl?: string): Promise<MacStore> {
  if (kind === "redis") {
    return createRedisStore(resolveRedisUrl(redisUrl));
  }
  return createMemoryStore();
}
