import {
  formatGithubWakeNote,
  type GithubResourceRef,
  type GithubWebhookIngress,
} from "@mac/shared";
import type { BallCustodyStore } from "../custody/ball-custody-store.js";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";
import type { GithubBindingStore } from "./binding-store.js";
import { normalizeGithubWebhook } from "./normalize-webhook.js";

export interface GithubSignalRouterDeps {
  bindings: GithubBindingStore;
  custody?: BallCustodyStore;
  store: MacStore;
  hub: ThreadHub;
}

export interface GithubSignalHandleResult {
  ingress: GithubWebhookIngress;
  bindingId: string | null;
  threadId: string | null;
  awaitId: string | null;
  woken: boolean;
  messageId: string | null;
}

/**
 * ConnectorRouter slice for GitHub: normalize → bind resolve → wake → thread note.
 * Outbound PR comments are deferred; Done path is wait→wake.
 */
export class GithubSignalRouter {
  constructor(private readonly deps: GithubSignalRouterDeps) {}

  /**
   * Handle a verified GitHub webhook (or Hub simulate payload).
   * @param event - X-GitHub-Event
   * @param deliveryId - X-GitHub-Delivery
   * @param body - Parsed JSON
   * @returns Handle result (idempotent-ish: wake fails closed if already woken)
   */
  async handleWebhook(
    event: string,
    deliveryId: string,
    body: Record<string, unknown>,
  ): Promise<GithubSignalHandleResult> {
    const ingress = normalizeGithubWebhook(event, deliveryId, body);
    return this.dispatch(ingress, body);
  }

  /**
   * Hub/dev simulate path with an already-normalized ref.
   * @param ingress - Partial ingress (ref required to bind/wake)
   * @returns Handle result
   */
  async handleSimulated(ingress: {
    deliveryId?: string;
    event: string;
    action?: string | null;
    ref: GithubResourceRef;
    summary?: string;
  }): Promise<GithubSignalHandleResult> {
    const full: GithubWebhookIngress = {
      deliveryId: ingress.deliveryId ?? `sim-${Date.now()}`,
      event: ingress.event,
      action: ingress.action ?? null,
      ref: ingress.ref,
      summary: ingress.summary ?? "simulated GitHub signal",
    };
    return this.dispatch(full, {
      action: full.action,
      simulated: true,
    });
  }

  /**
   * Resolve binding / await, wake custody, append system note on the thread.
   * @param ingress - Normalized event
   * @param rawBody - Original payload fragment for wakePayload
   * @returns Result summary
   */
  private async dispatch(
    ingress: GithubWebhookIngress,
    rawBody: Record<string, unknown>,
  ): Promise<GithubSignalHandleResult> {
    const { bindings, custody, store, hub } = this.deps;
    let bindingId: string | null = null;
    let threadId: string | null = null;
    let awaitId: string | null = null;
    let woken = false;
    let messageId: string | null = null;

    if (ingress.ref) {
      const binding = bindings.findByRef(ingress.ref);
      if (binding) {
        bindingId = binding.id;
        threadId = binding.threadId;
        awaitId = binding.awaitId;
      }
      if (!awaitId && custody) {
        const waiting = custody.findWaitingByGithubRef(ingress.ref);
        if (waiting) {
          awaitId = waiting.id;
          if (!threadId && waiting.subjectType === "thread") {
            threadId = waiting.subjectId;
          }
        }
      }
    }

    if (awaitId && custody) {
      const open = custody.getAwait(awaitId);
      if (open?.status === "waiting") {
        custody.wake(awaitId, {
          source: "github",
          deliveryId: ingress.deliveryId,
          event: ingress.event,
          action: ingress.action,
          ref: ingress.ref,
          summary: ingress.summary,
          rawAction: rawBody.action ?? null,
        });
        woken = true;
      }
    }

    if (threadId) {
      const thread = await store.getThread(threadId);
      if (thread) {
        const content = formatGithubWakeNote(ingress);
        const message = await store.appendMessage({
          threadId,
          role: "system",
          authorId: "github",
          content,
          status: "completed",
        });
        messageId = message.id;
        hub.publish(threadId, { type: "message.created", message });
      }
    }

    return {
      ingress,
      bindingId,
      threadId,
      awaitId,
      woken,
      messageId,
    };
  }
}
