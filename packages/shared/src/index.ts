/** Shared contracts — keep terminal schemas here (extend, don't throw away). */

export {
  mentionSuggestion,
  parseLeadingMention,
  parseMentions,
  type MentionCat,
  type ParsedMention,
  type ParsedMentions,
} from "./mention.js";

/** Multi-target invoke strategy (M07). Parallel is reserved for a later milestone. */
export type MentionRoutingStrategy = "serial" | "parallel";

export type { HealthResponse, HealthStatus } from "./types/health.js";
export type { AgentIdentity, CatConfig } from "./types/cat.js";
export type { Thread, ThreadStatus, ThreadSummary } from "./types/thread.js";
export type { Message, MessageRole, MessageStatus } from "./types/message.js";
export type { PlatformEvent } from "./types/events.js";
export type {
  CancelToken,
  QueueEntry,
  QueueEntryStatus,
  TurnExecution,
  TurnExecutionStatus,
} from "./types/dispatch.js";
export {
  buildAutoReviewPayload,
  formatHandoffReviewPrompt,
  parseHandoffFivePiece,
  type Handoff,
  type HandoffFivePiece,
  type HandoffKind,
  type HandoffReceipt,
  type HandoffStatus,
} from "./types/handoff.js";
export type {
  CallbackAuthFailure,
  CallbackAuthFailureReason,
  InvocationCredential,
} from "./types/callback-auth.js";
export type {
  SkillDetail,
  SkillMatchResult,
  SkillSummary,
} from "./types/skill.js";

