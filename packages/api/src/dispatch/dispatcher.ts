import { randomUUID } from "node:crypto";
import type { QueueEntry, TurnExecution } from "@mac/shared";
import type { AgentProvider } from "../agents/types.js";
import { runRoutedInvocation } from "../agents/run-invocation.js";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";
import { TurnExecutionStore } from "./turn-execution-store.js";

export interface EnqueueInvocationInput {
  threadId: string;
  prompt: string;
  catIds: string[];
  authorId?: string;
  priority?: number;
  systemSnippetFor: (catId: string) => string | undefined;
  /**
   * When set, after this entry completes successfully, create an auto handoff
   * from the last producer cat to `toCatId` and enqueue a review invoke (M09).
   */
  autoReview?: { toCatId: string };
}

export interface EnqueueInvocationResult {
  entry: QueueEntry;
  /** True when this entry was promoted to running immediately. */
  started: boolean;
}

export interface DispatcherDeps {
  store: MacStore;
  hub: ThreadHub;
  agent: AgentProvider;
  executions: TurnExecutionStore;
  /** Optional M09 handoff service for auto-review after completion. */
  handoffs?: {
    createAutoReview: (params: {
      threadId: string;
      fromCatId: string;
      toCatId: string;
      producerContent: string;
      sourceMessageId: string | null;
      sourceQueueEntryId: string;
      systemSnippetFor?: (catId: string) => string | undefined;
    }) => Promise<unknown>;
  };
}

interface LiveCancel {
  controller: AbortController;
}

/**
 * InvocationQueue processor with per-thread + per-cat busy gates and cancel (M08).
 */
export class InvocationDispatcher {
  private readonly liveCancels = new Map<string, LiveCancel>();
  private readonly snippetResolvers = new Map<
    string,
    (catId: string) => string | undefined
  >();
  private readonly autoReviews = new Map<string, { toCatId: string }>();
  /** Entry ids currently executing (background). */
  private readonly inFlight = new Set<string>();

  constructor(private readonly deps: DispatcherDeps) {}

  /**
   * Late-bind HandoffService after both dispatcher and handoffs exist (avoids cycle).
   * @param handoffs - Service exposing createAutoReview
   */
  attachHandoffs(
    handoffs: NonNullable<DispatcherDeps["handoffs"]>,
  ): void {
    this.deps.handoffs = handoffs;
  }

  /**
   * Enqueue an invoke job; start immediately when thread/cats are free.
   * @param input - thread, prompt, ordered catIds, snippet resolver
   * @returns Created QueueEntry and whether it started now
   */
  enqueue(input: EnqueueInvocationInput): EnqueueInvocationResult {
    const now = new Date().toISOString();
    const entry: QueueEntry = {
      id: randomUUID(),
      threadId: input.threadId,
      prompt: input.prompt,
      catIds: [...input.catIds],
      authorId: input.authorId ?? "operator",
      status: "queued",
      priority: input.priority ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.deps.executions.putEntry(entry);
    this.snippetResolvers.set(entry.id, input.systemSnippetFor);
    if (input.autoReview) {
      this.autoReviews.set(entry.id, input.autoReview);
    }

    const started = this.tryStart(entry.id);
    // Keep pumping in case other queued jobs became runnable.
    void this.pump();
    return {
      entry: this.deps.executions.getEntry(entry.id)!,
      started,
    };
  }

  /**
   * Request cancel for a queued or running entry.
   * @param queueEntryId - Target QueueEntry id
   * @param reason - Optional audit reason
   * @returns Updated entry, or null if unknown
   */
  cancel(queueEntryId: string, reason?: string): QueueEntry | null {
    const entry = this.deps.executions.getEntry(queueEntryId);
    if (!entry) return null;
    if (entry.status === "completed" || entry.status === "failed" || entry.status === "cancelled") {
      return entry;
    }

    const now = new Date().toISOString();
    if (entry.status === "queued") {
      this.deps.executions.putEntry({
        ...entry,
        status: "cancelled",
        cancelRequestedAt: now,
        cancelReason: reason,
        error: reason ?? "cancelled",
        updatedAt: now,
      });
      this.snippetResolvers.delete(queueEntryId);
      void this.pump();
      return this.deps.executions.getEntry(queueEntryId)!;
    }

    // Running: mark cancel intent and abort live controller.
    this.deps.executions.putEntry({
      ...entry,
      cancelRequestedAt: now,
      cancelReason: reason,
      updatedAt: now,
    });
    this.liveCancels.get(queueEntryId)?.controller.abort(reason ?? "cancelled");
    return this.deps.executions.getEntry(queueEntryId)!;
  }

  /**
   * @param id - QueueEntry id
   */
  getEntry(id: string): QueueEntry | undefined {
    return this.deps.executions.getEntry(id);
  }

  /**
   * @param threadId - Thread filter
   */
  listEntries(threadId: string): QueueEntry[] {
    return this.deps.executions.listEntriesByThread(threadId);
  }

  /**
   * @param queueEntryId - Parent entry
   */
  listTurns(queueEntryId: string): TurnExecution[] {
    return this.deps.executions.listTurnsByEntry(queueEntryId);
  }

  /**
   * After a job finishes, start any newly-runnable queued entries.
   */
  private async pump(): Promise<void> {
    while (true) {
      const next = this.pickNextRunnable();
      if (!next) return;
      if (!this.tryStart(next.id)) return;
      // tryStart launches background work; loop to fill free threads/cats.
    }
  }

  /**
   * Pick highest-priority, oldest queued entry whose thread and cats are free.
   */
  private pickNextRunnable(): QueueEntry | null {
    const queued = this.deps.executions
      .listEntries()
      .filter((e) => e.status === "queued")
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.createdAt < b.createdAt ? -1 : 1;
      });

    for (const entry of queued) {
      if (this.deps.executions.isThreadBusy(entry.threadId)) continue;
      if (entry.catIds.some((id) => this.deps.executions.isCatBusy(id))) continue;
      return entry;
    }
    return null;
  }

  /**
   * Synchronously promote a queued entry to running and launch background work.
   * @param entryId - Queue entry id
   * @returns true if this call started the entry
   */
  private tryStart(entryId: string): boolean {
    const entry = this.deps.executions.getEntry(entryId);
    if (!entry || entry.status !== "queued") return false;
    if (this.deps.executions.isThreadBusy(entry.threadId)) return false;
    if (entry.catIds.some((id) => this.deps.executions.isCatBusy(id))) return false;
    if (this.inFlight.has(entryId)) return false;

    const controller = new AbortController();
    this.liveCancels.set(entryId, { controller });
    this.inFlight.add(entryId);

    this.deps.executions.putEntry({
      ...entry,
      status: "running",
      updatedAt: new Date().toISOString(),
    });

    void this.execute(entryId, controller);
    return true;
  }

  /**
   * Await the full routed invoke chain, then finalize entry status and pump.
   * @param entryId - Running entry
   * @param controller - AbortController for cancel
   */
  private async execute(entryId: string, controller: AbortController): Promise<void> {
    const entry = this.deps.executions.getEntry(entryId);
    if (!entry) {
      this.inFlight.delete(entryId);
      this.liveCancels.delete(entryId);
      return;
    }

    const systemSnippetFor =
      this.snippetResolvers.get(entryId) ?? ((_catId: string) => undefined);

    try {
      await runRoutedInvocation({
        store: this.deps.store,
        hub: this.deps.hub,
        agent: this.deps.agent,
        threadId: entry.threadId,
        prompt: entry.prompt,
        catIds: entry.catIds,
        authorId: entry.authorId,
        systemSnippetFor,
        signal: controller.signal,
        awaitCompletion: true,
        onTurn: (event) => this.handleTurnEvent(entryId, entry.threadId, event),
      });

      const current = this.deps.executions.getEntry(entryId)!;
      const turns = this.deps.executions.listTurnsByEntry(entryId);
      if (controller.signal.aborted || current.cancelRequestedAt) {
        this.finalizeEntry(entryId, "cancelled", current.cancelReason ?? "cancelled");
      } else if (turns.some((t) => t.status === "failed")) {
        const failedTurn = turns.find((t) => t.status === "failed");
        this.finalizeEntry(entryId, "failed", failedTurn?.error ?? "turn failed");
      } else {
        this.finalizeEntry(entryId, "completed");
        await this.maybeAutoReview(entryId, entry, turns);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.finalizeEntry(
        entryId,
        controller.signal.aborted ? "cancelled" : "failed",
        message,
      );
    } finally {
      this.liveCancels.delete(entryId);
      this.snippetResolvers.delete(entryId);
      this.autoReviews.delete(entryId);
      this.inFlight.delete(entryId);
      void this.pump();
    }
  }

  /**
   * After a successful producer job, optionally hand off to a reviewer cat (M09).
   * Skips when autoReview unset, or when this job was already a multi-target chain
   * that included the reviewer (avoid double review).
   */
  private async maybeAutoReview(
    entryId: string,
    entry: QueueEntry,
    turns: TurnExecution[],
  ): Promise<void> {
    const auto = this.autoReviews.get(entryId);
    if (!auto || !this.deps.handoffs) return;
    if (entry.catIds.includes(auto.toCatId)) return;

    const completedTurns = turns.filter((t) => t.status === "completed" && t.messageId);
    const last = completedTurns.at(-1);
    if (!last?.messageId) return;

    const message = await this.deps.store.getMessage(last.messageId);
    const producerContent = message?.content ?? "";
    const systemSnippetFor = this.snippetResolvers.get(entryId);

    await this.deps.handoffs.createAutoReview({
      threadId: entry.threadId,
      fromCatId: last.catId,
      toCatId: auto.toCatId,
      producerContent,
      sourceMessageId: last.messageId,
      sourceQueueEntryId: entryId,
      systemSnippetFor,
    });
  }

  /**
   * Persist TurnExecution rows from runRoutedInvocation turn hooks.
   */
  private handleTurnEvent(
    queueEntryId: string,
    threadId: string,
    event: {
      phase: "start" | "end";
      catId: string;
      attempt: number;
      messageId: string | null;
      status: TurnExecution["status"];
      error?: string;
      turnId: string;
    },
  ): void {
    const now = new Date().toISOString();
    const existing = this.deps.executions.getTurn(event.turnId);
    const turn: TurnExecution = {
      id: event.turnId,
      queueEntryId,
      threadId,
      catId: event.catId,
      messageId: event.messageId,
      attempt: event.attempt,
      status: event.status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      error: event.error,
    };
    this.deps.executions.putTurn(turn);
  }

  /**
   * Write terminal QueueEntry status and close leftover turns.
   */
  private finalizeEntry(
    id: string,
    status: "completed" | "failed" | "cancelled",
    error?: string,
  ): void {
    const entry = this.deps.executions.getEntry(id);
    if (!entry) return;
    if (entry.status === "completed" || entry.status === "failed" || entry.status === "cancelled") {
      return;
    }
    this.deps.executions.putEntry({
      ...entry,
      status,
      error,
      updatedAt: new Date().toISOString(),
    });

    for (const turn of this.deps.executions.listTurnsByEntry(id)) {
      if (turn.status === "pending" || turn.status === "running") {
        this.deps.executions.putTurn({
          ...turn,
          status: status === "cancelled" ? "cancelled" : "failed",
          error: error ?? turn.error,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }
}
