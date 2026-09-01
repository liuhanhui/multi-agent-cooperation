import type { MacStore } from "./types.js";
import { createMemoryStore } from "./memory-store.js";
import { createRedisStore } from "./redis-store.js";

export type StoreKind = "memory" | "redis";

export async function createStore(kind: StoreKind, redisUrl?: string): Promise<MacStore> {
  if (kind === "redis") {
    const url = redisUrl ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6410";
    return createRedisStore(url);
  }
  return createMemoryStore();
}
