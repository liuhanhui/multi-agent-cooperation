import type {
  Message,
  PresentSkipReason,
  PresentSnapshot,
  PresentTickResult,
  Thread,
  UpdatePresentPolicyInput,
} from "@mac/shared";
import type { CatRegistry } from "../cats/load-cat-config.js";
import type { TurnExecutionStore } from "../dispatch/turn-execution-store.js";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";
import { PresentStore } from "./present-store.js";

export interface PresentServiceOptions {
  store: MacStore;
  hub: ThreadHub;
  presents: PresentStore;
  cats?: CatRegistry;
  executions?: TurnExecutionStore;
  now?: () => Date;
}

interface PresentCandidate {
  thread: Thread;
  basis: Message;
  catId: string;
}

/**
 * Enforce opt-in, idle, per-cat budget, and cooldown before posting check-ins.
 */
export class PresentService {
  private readonly now: () => Date;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /**
   * Bind message storage, event fan-out, durable policy, cats, and optional clock.
   * @param options - Present service dependencies
   */
  constructor(private readonly options: PresentServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Return policy, today's usage, and recent delivery audit rows.
   * @returns Present control-plane snapshot
   */
  snapshot(): PresentSnapshot {
    const now = this.now().toISOString();
    return {
      policy: this.options.presents.getPolicy(),
      deliveries: this.options.presents.list(),
      usageToday: this.options.presents.usage(now.slice(0, 10)),
    };
  }

  /**
   * Apply operator policy without touching environment or cat configuration.
   * @param patch - Global budget/cooldown/idle and per-cat switches
   * @returns Updated control-plane snapshot
   */
  updatePolicy(patch: UpdatePresentPolicyInput): PresentSnapshot {
    this.options.presents.updatePolicy(patch, this.now().toISOString());
    return this.snapshot();
  }

  /**
   * Evaluate eligible threads and deliver at most one proactive check-in.
   * @param input.threadId - Optional thread constraint for a manual check
   * @returns Delivered, skipped, or failed result
   */
  async tick(
    input: { threadId?: string } = {},
  ): Promise<PresentTickResult> {
    if (this.running) return { outcome: "skipped", reason: "busy" };
    this.running = true;
    try {
      const policy = this.options.presents.getPolicy();
      if (!policy.enabled) return { outcome: "skipped", reason: "disabled" };

      const allThreads = await this.options.store.listThreads();
      const threads = allThreads.filter(
        (thread) =>
          thread.status === "active" &&
          (!input.threadId || thread.id === input.threadId),
      );
      if (threads.length === 0) {
        return { outcome: "skipped", reason: "no_threads" };
      }

      const now = this.now();
      const idleCutoff = now.getTime() - policy.idleMinutes * 60_000;
      const candidates: PresentCandidate[] = [];
      let skipReason: PresentSkipReason = "no_operator_message";

      for (const thread of threads) {
        if (this.options.executions?.isThreadBusy(thread.id)) {
          skipReason = "thread_busy";
          continue;
        }
        const messages = await this.options.store.listMessages(thread.id);
        if (
          messages.some(
            (message) =>
              message.status === "pending" || message.status === "streaming",
          )
        ) {
          skipReason = "message_active";
          continue;
        }
        const basis = [...messages]
          .reverse()
          .find(
            (message) =>
              message.role === "user" && message.status === "completed",
          );
        if (!basis) {
          skipReason = "no_operator_message";
          continue;
        }
        // Only explicit operator activity starts a relationship-loop eligibility window.
        if (Date.parse(basis.updatedAt) > idleCutoff) {
          skipReason = "not_idle";
          continue;
        }
        const catId = thread.defaultCatId;
        if (
          !catId ||
          !thread.memberIds.includes(catId) ||
          !this.options.cats?.get(catId) ||
          !policy.cats.find((setting) => setting.catId === catId)?.enabled
        ) {
          skipReason = "no_enabled_cat";
          continue;
        }
        if (this.options.executions?.isCatBusy(catId)) {
          skipReason = "thread_busy";
          continue;
        }
        candidates.push({ thread, basis, catId });
      }

      candidates.sort(
        (a, b) =>
          a.basis.updatedAt.localeCompare(b.basis.updatedAt) ||
          a.thread.id.localeCompare(b.thread.id),
      );

      for (const candidate of candidates) {
        const { thread, basis, catId } = candidate;
        const livePolicy = this.options.presents.getPolicy();
        if (!livePolicy.enabled) {
          return { outcome: "skipped", reason: "disabled" };
        }
        const liveCatEnabled =
          livePolicy.cats.find((setting) => setting.catId === catId)?.enabled ??
          false;
        if (!liveCatEnabled) {
          skipReason = "no_enabled_cat";
          continue;
        }
        const cat = this.options.cats?.get(catId);
        if (!cat) {
          skipReason = "no_enabled_cat";
          continue;
        }
        const content = `🐾 ${cat.displayName} is checking in — want to pick up “${thread.title}” again?`;
        const reservation = this.options.presents.reserve({
          threadId: thread.id,
          catId,
          basisMessageId: basis.id,
          content,
          now: now.toISOString(),
        });
        if (!reservation.ok) {
          skipReason = reservation.reason;
          continue;
        }

        try {
          const message = await this.options.store.appendMessage({
            threadId: thread.id,
            role: "assistant",
            authorId: catId,
            content,
            status: "completed",
          });
          const delivery = this.options.presents.settle(
            reservation.delivery.id,
            { status: "delivered", messageId: message.id },
            this.now().toISOString(),
          );
          this.options.hub.publish(thread.id, {
            type: "message.created",
            message,
          });
          return { outcome: "delivered", delivery };
        } catch (error) {
          const delivery = this.options.presents.settle(
            reservation.delivery.id,
            {
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            },
            this.now().toISOString(),
        );
          return { outcome: "failed", delivery };
        }
      }

      return { outcome: "skipped", reason: skipReason };
    } finally {
      this.running = false;
    }
  }

  /**
   * Start the unref'ed eligibility loop once.
   * @param intervalMs - Scheduler interval
   * @returns Nothing
   */
  start(intervalMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        console.error(
          `[present] tick failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, intervalMs);
    this.timer.unref();
  }

  /**
   * Stop only this service's scheduler during app shutdown.
   * @returns Nothing
   */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
