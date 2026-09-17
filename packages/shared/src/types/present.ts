/**
 * M27 proactive relationship-loop contracts.
 * Policy is opt-in; every reservation consumes bounded budget before delivery.
 */

export interface CatPresentSetting {
  catId: string;
  enabled: boolean;
}

export interface PresentPolicy {
  enabled: boolean;
  dailyBudgetPerCat: number;
  cooldownMinutes: number;
  idleMinutes: number;
  cats: CatPresentSetting[];
  updatedAt: string;
}

export type PresentDeliveryStatus = "reserved" | "delivered" | "failed";

export interface PresentDelivery {
  id: string;
  threadId: string;
  catId: string;
  basisMessageId: string;
  content: string;
  dayKey: string;
  status: PresentDeliveryStatus;
  messageId: string | null;
  error: string | null;
  createdAt: string;
  settledAt: string | null;
}

export type PresentSkipReason =
  | "disabled"
  | "no_threads"
  | "not_idle"
  | "no_operator_message"
  | "message_active"
  | "thread_busy"
  | "no_enabled_cat"
  | "already_present"
  | "budget_exhausted"
  | "cooldown"
  | "busy";

export type PresentTickResult =
  | {
      outcome: "delivered";
      delivery: PresentDelivery;
    }
  | {
      outcome: "skipped";
      reason: PresentSkipReason;
    }
  | {
      outcome: "failed";
      delivery: PresentDelivery;
    };

export interface PresentSnapshot {
  policy: PresentPolicy;
  deliveries: PresentDelivery[];
  usageToday: Record<string, number>;
}

export interface UpdatePresentPolicyInput {
  enabled?: boolean;
  dailyBudgetPerCat?: number;
  cooldownMinutes?: number;
  idleMinutes?: number;
  cats?: CatPresentSetting[];
}
