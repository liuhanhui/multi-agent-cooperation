import { randomUUID } from "node:crypto";
import type { InvocationCredential, QueueEntry, TurnExecution } from "@mac/shared";
import type { AgentProvider } from "../agents/types.js";
import { runRoutedInvocation } from "../agents/run-invocation.js";
import type { InvocationCredentialStore } from "../callback-auth/credential-store.js";
import type { ReceiptStore } from "../receipts/receipt-store.js";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";
import { TurnExecutionStore } from "./turn-execution-store.js";

export interface EnqueueInvocationInput {
  threadId: string;
  /** Operator-visible prompt stored on the user bubble / QueueEntry. */
  prompt: string;
  /**
   * Optional prompt sent to the CLI agent (e.g. Evidence-prepended).
   * Defaults to `prompt` so Hub UI never shows injection scaffolding.
   */
  agentPrompt?: string;
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
  /** M10: mint short-lived callback tokens when a job starts. */
  credentials?: InvocationCredentialStore;
  /** Public API origin for callbackUrl (e.g. http://127.0.0.1:4010). */
  publicBaseUrl?: string;
  /** M18 per-target delivery receipts + freshness. */
  receipts?: ReceiptStore;
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
  /** Per-entry CLI prompt when it differs from the Hub-visible operator prompt (M16). */
  private readonly agentPrompts = new Map<string, string>();
  private readonly autoReviews = new Map<string, { toCatId: string }>();
  /** One-shot callback credentials minted when an entry starts. */
  private readonly entryCredentials = new Map<string, InvocationCredential>();
  /** Entry ids currently executing (background). */
  private readonly inFlight = new Set<string>();
  /** queueEntryId → delivery batch id (M18). */
  private readonly entryBatches = new Map<string, string>();

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
    if (input.agentPrompt && input.agentPrompt !== input.prompt) {
      this.agentPrompts.set(entry.id, input.agentPrompt);
    }
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
      this.agentPrompts.delete(queueEntryId);
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
   * Return the live callback credential for a running entry (token included once for agents/tests).
   * @param queueEntryId - Entry id
   * @returns Credential or undefined
   */
  getCallbackCredential(queueEntryId: string): InvocationCredential | undefined {
    return this.entryCredentials.get(queueEntryId);
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

    if (this.deps.credentials) {
      const credential = this.deps.credentials.mint({
        queueEntryId: entryId,
        threadId: entry.threadId,
        catIds: entry.catIds,
      });
      this.entryCredentials.set(entryId, credential);
    }

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
    const agentPrompt = this.agentPrompts.get(entryId) ?? entry.prompt;
    const credential = this.entryCredentials.get(entryId);
    const base = this.deps.publicBaseUrl?.replace(/\/$/, "") ?? "";

    // M18: open one receipt per target before turns run.
    if (this.deps.receipts) {
      const { batch } = this.deps.receipts.createBatch({
        threadId: entry.threadId,
        targetCatIds: entry.catIds,
        queueEntryId: entryId,
      });
      this.entryBatches.set(entryId, batch.id);
    }

    try {
      const routed = await runRoutedInvocation({
        store: this.deps.store,
        hub: this.deps.hub,
        agent: this.deps.agent,
        threadId: entry.threadId,
        prompt: entry.prompt,
        agentPrompt,
        catIds: entry.catIds,
        authorId: entry.authorId,
        systemSnippetFor,
        signal: controller.signal,
        awaitCompletion: true,
        callbackUrl: credential && base ? `${base}/api/callbacks/invocation` : undefined,
        callbackToken: credential?.token,
        callbackExpiresAt: credential?.expiresAt,
        onTurn: (event) => this.handleTurnEvent(entryId, entry.threadId, event),
      });

      // Attach source user message to the batch once known.
      const batchId = this.entryBatches.get(entryId);
      if (batchId && this.deps.receipts) {
        const batch = this.deps.receipts.getBatch(batchId);
        if (batch && !batch.sourceMessageId) {
          // Recreate is heavy; store source on receipts via a lightweight patch:
          // expose setSourceMessage on ReceiptStore.
          this.deps.receipts.setSourceMessage(batchId, routed.userMessage.id);
        }
      }

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
      this.agentPrompts.delete(entryId);
      this.autoReviews.delete(entryId);
      this.entryCredentials.delete(entryId);
      this.entryBatches.delete(entryId);
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
   * On turn end, mark the matching per-target receipt delivered/failed (M18).
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

    if (event.phase === "end") {
      void this.syncReceiptFromTurn(queueEntryId, event);
    }
  }

  /**
   * Mirror a finished turn onto its TargetReceipt (freshness freeze on deliver).
   * @param queueEntryId - Running queue entry
   * @param event - End-phase turn hook payload
   */
  private async syncReceiptFromTurn(
    queueEntryId: string,
    event: {
      catId: string;
      messageId: string | null;
      status: TurnExecution["status"];
      error?: string;
    },
  ): Promise<void> {
    if (!this.deps.receipts) return;
    const batchId =
      this.entryBatches.get(queueEntryId) ??
      this.deps.receipts.getBatchByQueueEntry(queueEntryId)?.id;
    if (!batchId) return;

    try {
      if (event.status === "completed" && event.messageId) {
        const msg = await this.deps.store.getMessage(event.messageId);
        const content = msg?.content?.trim() ? msg.content : "(empty)";
        this.deps.receipts.markDelivered(
          batchId,
          event.catId,
          event.messageId,
          content,
        );
      } else if (event.status === "failed" || event.status === "cancelled") {
        this.deps.receipts.markFailed(
          batchId,
          event.catId,
          event.messageId,
          event.error ?? event.status,
        );
      }
    } catch {
      // Receipt update must not break dispatch; unit tests cover the store policy.
    }
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

    // M18: any target still pending after entry ends is not authoritative.
    const batchId =
      this.entryBatches.get(id) ??
      this.deps.receipts?.getBatchByQueueEntry(id)?.id;
    if (batchId && this.deps.receipts && status !== "completed") {
      try {
        this.deps.receipts.failPending(batchId, error ?? status);
      } catch {
        /* ignore */
      }
    }
  }
}
