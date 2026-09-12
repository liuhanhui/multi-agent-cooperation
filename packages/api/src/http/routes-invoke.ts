import type { FastifyInstance } from "fastify";
import {
  formatBlocksForPrompt,
  type MentionRoutingStrategy,
  type SkillMatchResult,
} from "@mac/shared";
import { retrieveEvidenceForPrompt } from "../memory/retrieve-evidence.js";
import { resolveMentionRoute } from "../routing/resolve-route.js";
import { resolveSkillInjection } from "../skills/match-skills.js";
import { chunkText } from "./chunk-text.js";
import type { AppDeps } from "./deps.js";

/**
 * Register invoke (via dispatcher) + stream-echo + invocation inspect/cancel routes.
 * @param app - Fastify instance
 * @param deps - store/hub/agent/cats/dispatcher
 */
export function registerInvokeRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { store, hub, agent, cats, dispatcher, skills, evidence, settings } = deps;

  /**
   * Resolve @mention route, then enqueue on InvocationDispatcher (M08).
   * Returns 202 with queueEntryId; bubbles still arrive over WS when the job runs.
   */
  app.post<{
    Params: { id: string };
    Body: {
      content?: string;
      authorId?: string;
      systemSnippet?: string;
      catId?: string;
      strategy?: MentionRoutingStrategy;
      priority?: number;
      /** After this invoke completes, auto handoff + review invoke for this cat (M09). */
      autoReviewTo?: string;
    };
  }>("/api/threads/:id/messages/invoke", async (req, reply) => {
    if (!agent) return reply.code(503).send({ error: "No agent provider configured" });
    if (!dispatcher) return reply.code(503).send({ error: "Dispatcher not configured" });
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const content = req.body?.content?.trim() ?? "";
    if (!content) return reply.code(400).send({ error: "content required" });

    const catList = cats?.list() ?? [];
    const policy = settings?.getRoutingPolicy();
    const route = resolveMentionRoute({
      content,
      thread,
      cats: catList,
      explicitCatId: req.body?.catId,
      // Body strategy wins; otherwise Hub Settings routing policy applies immediately.
      strategy: req.body?.strategy ?? policy?.strategy ?? "serial",
      fallbackToDefaultCat: policy?.fallbackToDefaultCat,
      maxTargets: policy?.maxTargets,
    });
    if (!route.ok) {
      return reply.code(400).send({ error: route.error });
    }

    const autoReviewTo = req.body?.autoReviewTo?.trim();
    if (autoReviewTo) {
      if (cats && !cats.get(autoReviewTo)) {
        return reply.code(400).send({ error: `Unknown autoReviewTo cat: ${autoReviewTo}` });
      }
      if (thread.memberIds.length > 0 && !thread.memberIds.includes(autoReviewTo)) {
        return reply.code(400).send({ error: `autoReviewTo ${autoReviewTo} is not a thread member` });
      }
    }

    // On-demand skills: match routed prompt; inject only hits under token budget (M12).
    let skillMatch: SkillMatchResult | undefined;
    let skillInjection = "";
    if (skills) {
      const resolved = resolveSkillInjection(skills, route.prompt);
      skillMatch = resolved.match;
      skillInjection = resolved.injection;
    }

    // M14: prior Hub checklist/decision state must be visible to the next cat turn.
    const history = await store.listMessages(thread.id);
    const hubActionsInjection = formatBlocksForPrompt(history);

    // M16: BM25 evidence retrieval — empty injection when no hits (do not invent memory).
    // Put the block on the CLI user prompt (`-p`), not only --append-system-prompt:
    // coding agents often tool-search the repo and miss system appends.
    const evidenceRetrieval = evidence
      ? retrieveEvidenceForPrompt(evidence, route.prompt)
      : undefined;
    const evidenceInjection = evidenceRetrieval?.injection ?? "";
    const invokePrompt = evidenceInjection
      ? [
          evidenceInjection,
          "",
          "---",
          "Answer from the Hub Evidence block above when it is relevant.",
          "Do not search the repo or invent memory for these facts; if Evidence is missing, say you lack Hub evidence.",
          "",
          `[Operator]\n${route.prompt}`,
        ].join("\n")
      : route.prompt;

    const { entry, started } = dispatcher.enqueue({
      threadId: thread.id,
      prompt: route.prompt,
      agentPrompt: invokePrompt,
      catIds: route.catIds,
      authorId: req.body?.authorId ?? "operator",
      priority: req.body?.priority,
      autoReview: autoReviewTo ? { toCatId: autoReviewTo } : undefined,
      systemSnippetFor: (catId) => {
        const base =
          (route.catIds.length === 1 ? req.body?.systemSnippet : undefined) ??
          cats?.get(catId)?.systemSnippet;
        // Evidence lives on agentPrompt; keep skills + Hub actions on system.
        const parts = [base, skillInjection, hubActionsInjection].filter(
          (p): p is string => Boolean(p && p.trim()),
        );
        return parts.length > 0 ? parts.join("\n\n") : undefined;
      },
    });

    const callback = started ? dispatcher.getCallbackCredential(entry.id) : undefined;
    settings?.recordUsage("invoke");

    return reply.code(202).send({
      queueEntryId: entry.id,
      status: entry.status,
      started,
      catIds: entry.catIds,
      catId: entry.catIds[0],
      strategy: route.strategy,
      autoReviewTo: autoReviewTo ?? null,
      entry,
      // One-shot visibility for agents/tests; also embedded in AgentInvokeInput.
      callbackToken: callback?.token,
      callbackExpiresAt: callback?.expiresAt,
      callbackUrl: callback ? `/api/callbacks/invocation` : undefined,
      // M12: which skills were injected (empty when no trigger hit).
      skillsInjected: skillMatch?.injectedIds ?? [],
      skillsSkipped: skillMatch?.skipped ?? [],
      skillsTokens: skillMatch
        ? { used: skillMatch.totalTokens, budget: skillMatch.budgetTokens }
        : null,
      // M16: evidence ids injected (empty when no BM25 hit).
      evidenceInjected: evidenceRetrieval?.injectedIds ?? [],
      evidenceSkipped: evidenceRetrieval?.skipped ?? [],
      evidenceTokens: evidenceRetrieval
        ? { used: evidenceRetrieval.totalTokens, budget: evidenceRetrieval.budgetTokens }
        : null,
    });
  });

  /**
   * List queue entries for a thread (newest first).
   */
  app.get<{ Params: { id: string } }>("/api/threads/:id/invocations", async (req, reply) => {
    if (!dispatcher) return reply.code(503).send({ error: "Dispatcher not configured" });
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const entries = dispatcher.listEntries(thread.id);
    return { entries };
  });

  /**
   * Fetch one queue entry + its TurnExecution rows.
   */
  app.get<{ Params: { id: string; entryId: string } }>(
    "/api/threads/:id/invocations/:entryId",
    async (req, reply) => {
      if (!dispatcher) return reply.code(503).send({ error: "Dispatcher not configured" });
      const thread = await store.getThread(req.params.id);
      if (!thread) return reply.code(404).send({ error: "Thread not found" });
      const entry = dispatcher.getEntry(req.params.entryId);
      if (!entry || entry.threadId !== thread.id) {
        return reply.code(404).send({ error: "Invocation not found" });
      }
      const turns = dispatcher.listTurns(entry.id);
      return { entry, turns };
    },
  );

  /**
   * Cancel a queued or running invocation (AbortSignal → agent stop).
   */
  app.post<{ Params: { id: string; entryId: string }; Body: { reason?: string } }>(
    "/api/threads/:id/invocations/:entryId/cancel",
    async (req, reply) => {
      if (!dispatcher) return reply.code(503).send({ error: "Dispatcher not configured" });
      const thread = await store.getThread(req.params.id);
      if (!thread) return reply.code(404).send({ error: "Thread not found" });
      const entry = dispatcher.getEntry(req.params.entryId);
      if (!entry || entry.threadId !== thread.id) {
        return reply.code(404).send({ error: "Invocation not found" });
      }
      const updated = dispatcher.cancel(entry.id, req.body?.reason);
      return { entry: updated, turns: dispatcher.listTurns(entry.id) };
    },
  );

  /**
   * Demo stream without an agent adapter (bypasses dispatcher — not a real invoke).
   */
  app.post<{
    Params: { id: string };
    Body: { content?: string; authorId?: string };
  }>("/api/threads/:id/messages/stream-echo", async (req, reply) => {
    const thread = await store.getThread(req.params.id);
    if (!thread) return reply.code(404).send({ error: "Thread not found" });
    const content = req.body?.content?.trim() ?? "";
    if (!content) return reply.code(400).send({ error: "content required" });

    const userMessage = await store.appendMessage({
      threadId: thread.id,
      role: "user",
      authorId: req.body?.authorId ?? "operator",
      content,
      status: "completed",
    });
    hub.publish(thread.id, { type: "message.created", message: userMessage });

    const assistantMessage = await store.appendMessage({
      threadId: thread.id,
      role: "assistant",
      authorId: "echo",
      content: "",
      status: "pending",
    });
    hub.publish(thread.id, { type: "message.created", message: assistantMessage });

    void (async () => {
      try {
        for (const delta of chunkText(content)) {
          const updated = await store.applyDelta(assistantMessage.id, delta);
          hub.publish(thread.id, {
            type: "message.delta",
            messageId: updated.id,
            threadId: thread.id,
            seq: updated.seq,
            delta,
          });
          await new Promise((r) => setTimeout(r, 60));
        }
        const completed = await store.completeMessage(assistantMessage.id);
        hub.publish(thread.id, { type: "message.completed", message: completed });
      } catch (err) {
        const failed = await store.failMessage(
          assistantMessage.id,
          err instanceof Error ? err.message : String(err),
        );
        hub.publish(thread.id, {
          type: "message.failed",
          message: failed,
          error: failed.error ?? "stream failed",
        });
      }
    })();

    return reply.code(202).send({ userMessage, assistantMessage });
  });
}
