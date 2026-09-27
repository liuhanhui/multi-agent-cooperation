import type { FastifyInstance } from "fastify";
import type { Message } from "@mac/shared";
import type { UsageStore } from "../usage/usage-store.js";
import type { AppDeps } from "./deps.js";

/**
 * Join ledger usage onto assistant messages for Hub reads (hydrate / list).
 * The message store stays unaware of usage; this is a read-side projection only.
 * @param messages - Messages from MacStore
 * @param usage - Optional ledger; when absent messages pass through untouched
 * @returns Same order, assistant messages with a ledger row gain `usage`
 */
export function attachUsage(messages: Message[], usage: UsageStore | undefined): Message[] {
  if (!usage) return messages;
  const ids = messages.filter((m) => m.role === "assistant").map((m) => m.id);
  if (ids.length === 0) return messages;
  const byId = usage.byMessageIds(ids);
  if (byId.size === 0) return messages;
  return messages.map((m) => {
    const found = byId.get(m.id);
    return found ? { ...m, usage: found } : m;
  });
}

/**
 * Register M29 token usage summary routes.
 * @param app - Fastify application
 * @param deps - Needs `usage` (503 when disabled) and `store` for thread checks
 * @returns Nothing
 */
export function registerUsageRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { usage, store } = deps;

  /**
   * GET /api/usage?days=7&threadId=… — totals, per-cat/provider/day buckets, recent turns.
   * `days` is clamped to 1..90 by the store; unknown threadId → 404.
   */
  app.get<{ Querystring: { days?: string; threadId?: string } }>(
    "/api/usage",
    async (req, reply) => {
      if (!usage) return reply.code(503).send({ error: "Usage ledger not configured" });
      const threadId = req.query.threadId?.trim() || undefined;
      if (threadId && !(await store.getThread(threadId))) {
        return reply.code(404).send({ error: "Thread not found" });
      }
      const days = req.query.days ? Number(req.query.days) : undefined;
      return usage.summary({ days, threadId });
    },
  );
}
