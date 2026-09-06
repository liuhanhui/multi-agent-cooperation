import { randomUUID } from "node:crypto";
import {
  buildAutoReviewPayload,
  formatHandoffReviewPrompt,
  parseHandoffFivePiece,
  type Handoff,
  type HandoffFivePiece,
  type HandoffKind,
} from "@mac/shared";
import type { InvocationDispatcher } from "../dispatch/dispatcher.js";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";
import { HandoffStore } from "./handoff-store.js";

export interface CreateHandoffInput {
  threadId: string;
  fromCatId: string;
  toCatId: string;
  kind?: HandoffKind;
  payload: HandoffFivePiece | unknown;
  sourceMessageId?: string | null;
  sourceQueueEntryId?: string | null;
  /** When true, enqueue a review invoke for toCatId with structured prompt. */
  triggerReview?: boolean;
  systemSnippetFor?: (catId: string) => string | undefined;
}

export interface HandoffServiceDeps {
  store: MacStore;
  hub: ThreadHub;
  handoffs: HandoffStore;
  dispatcher?: InvocationDispatcher;
}

/**
 * Create, deliver, ack, and optionally trigger review invokes for handoffs (M09).
 */
export class HandoffService {
  constructor(private readonly deps: HandoffServiceDeps) {}

  /**
   * Validate payload, persist handoff, deliver into thread, optionally ack+review.
   * @param input - Parties, five-piece payload, optional triggerReview
   * @returns Delivered (and possibly acked) handoff
   */
  async createAndDeliver(input: CreateHandoffInput): Promise<Handoff> {
    const payload = parseHandoffFivePiece(input.payload);
    const now = new Date().toISOString();
    let handoff: Handoff = {
      id: randomUUID(),
      threadId: input.threadId,
      fromCatId: input.fromCatId,
      toCatId: input.toCatId,
      kind: input.kind ?? "review",
      payload,
      sourceMessageId: input.sourceMessageId ?? null,
      sourceQueueEntryId: input.sourceQueueEntryId ?? null,
      status: "created",
      receipt: null,
      reviewQueueEntryId: null,
      deliveryMessageId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.deps.handoffs.put(handoff);

    handoff = await this.deliver(handoff);

    if (input.triggerReview) {
      handoff = this.ack(handoff.id, input.toCatId) ?? handoff;
      handoff = await this.triggerReviewInvoke(handoff, input.systemSnippetFor);
    }

    return this.deps.handoffs.get(handoff.id)!;
  }

  /**
   * Auto-review path after producer cat A completes: build five-piece from output.
   * @param params - thread, A/B ids, producer content, queue entry id
   */
  async createAutoReview(params: {
    threadId: string;
    fromCatId: string;
    toCatId: string;
    producerContent: string;
    sourceMessageId: string | null;
    sourceQueueEntryId: string;
    systemSnippetFor?: (catId: string) => string | undefined;
  }): Promise<Handoff> {
    const payload = buildAutoReviewPayload(
      params.producerContent,
      params.fromCatId,
      params.toCatId,
    );
    return this.createAndDeliver({
      threadId: params.threadId,
      fromCatId: params.fromCatId,
      toCatId: params.toCatId,
      kind: "review",
      payload,
      sourceMessageId: params.sourceMessageId,
      sourceQueueEntryId: params.sourceQueueEntryId,
      triggerReview: true,
      systemSnippetFor: params.systemSnippetFor,
    });
  }

  /**
   * Append a system message with structured JSON and publish handoff.delivered.
   * @param handoff - Created handoff
   * @returns Updated delivered handoff
   */
  async deliver(handoff: Handoff): Promise<Handoff> {
    const body = JSON.stringify(
      {
        type: "mac.handoff",
        handoffId: handoff.id,
        fromCatId: handoff.fromCatId,
        toCatId: handoff.toCatId,
        kind: handoff.kind,
        payload: handoff.payload,
      },
      null,
      2,
    );

    const message = await this.deps.store.appendMessage({
      threadId: handoff.threadId,
      role: "system",
      authorId: "handoff",
      content: body,
      status: "completed",
    });
    this.deps.hub.publish(handoff.threadId, { type: "message.created", message });

    const delivered: Handoff = {
      ...handoff,
      status: "delivered",
      deliveryMessageId: message.id,
      updatedAt: new Date().toISOString(),
    };
    this.deps.handoffs.put(delivered);
    this.deps.hub.publish(handoff.threadId, { type: "handoff.delivered", handoff: delivered });
    return delivered;
  }

  /**
   * Record 「已接收」receipt for the target cat.
   * @param handoffId - Target handoff
   * @param byCatId - Acknowledging cat (usually toCatId)
   * @returns Updated handoff or null if missing
   */
  ack(handoffId: string, byCatId: string): Handoff | null {
    const current = this.deps.handoffs.get(handoffId);
    if (!current) return null;
    if (current.status === "acked") return current;

    const acked: Handoff = {
      ...current,
      status: "acked",
      receipt: {
        status: "received",
        at: new Date().toISOString(),
        byCatId,
      },
      updatedAt: new Date().toISOString(),
    };
    this.deps.handoffs.put(acked);
    this.deps.hub.publish(acked.threadId, { type: "handoff.acked", handoff: acked });
    return acked;
  }

  /**
   * Enqueue a review invoke for toCatId using formatHandoffReviewPrompt.
   * @param handoff - Delivered/acked handoff
   * @param systemSnippetFor - Optional snippet resolver for dispatcher
   */
  async triggerReviewInvoke(
    handoff: Handoff,
    systemSnippetFor?: (catId: string) => string | undefined,
  ): Promise<Handoff> {
    if (!this.deps.dispatcher) {
      const failed: Handoff = {
        ...handoff,
        status: "failed",
        error: "Dispatcher not configured; cannot trigger review",
        updatedAt: new Date().toISOString(),
      };
      this.deps.handoffs.put(failed);
      return failed;
    }

    const prompt = formatHandoffReviewPrompt(handoff);
    const { entry } = this.deps.dispatcher.enqueue({
      threadId: handoff.threadId,
      prompt,
      catIds: [handoff.toCatId],
      authorId: "handoff",
      // Slightly higher priority so review follows producer promptly when queue drains.
      priority: 1,
      systemSnippetFor: systemSnippetFor ?? (() => undefined),
    });

    const updated: Handoff = {
      ...handoff,
      reviewQueueEntryId: entry.id,
      updatedAt: new Date().toISOString(),
    };
    this.deps.handoffs.put(updated);
    return updated;
  }

  /**
   * @param id - Handoff id
   */
  get(id: string): Handoff | undefined {
    return this.deps.handoffs.get(id);
  }

  /**
   * @param threadId - Thread id
   */
  list(threadId: string): Handoff[] {
    return this.deps.handoffs.listByThread(threadId);
  }
}
