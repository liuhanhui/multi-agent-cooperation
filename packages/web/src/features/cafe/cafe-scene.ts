import type {
  CatConfig,
  Message,
  QueueEntry,
  Thread,
  TurnExecution,
} from "@mac/shared";
import type { WsState } from "../../hooks/useThreadSocket";

export type CafePhase = "quiet" | "live" | "settled" | "attention";
export type CafeCatPlace = "desk" | "cushion" | "window";
export type CafeCatMood = "working" | "queued" | "ready" | "error" | "away";

export interface CafeCatScene {
  catId: string;
  displayName: string;
  place: CafeCatPlace;
  mood: CafeCatMood;
  detail: string;
}

export interface CafeActivity {
  id: string;
  authorId: string;
  content: string;
  status: Message["status"];
}

export interface CafeScene {
  phase: CafePhase;
  connection: WsState;
  roomTitle: string;
  cats: CafeCatScene[];
  recentActivity: CafeActivity[];
}

export interface DeriveCafeSceneInput {
  cats: CatConfig[];
  thread: Thread | null;
  messages: Message[];
  wsState: WsState;
  invocations?: {
    entries: QueueEntry[];
    turns: TurnExecution[];
  };
}

/**
 * Project canonical thread/message/socket contracts into an ephemeral café scene.
 * @param input - Current cats, selected thread, bubble messages, and socket state
 * @returns Render-only scene with no persistence or independent lifecycle
 */
export function deriveCafeScene(input: DeriveCafeSceneInput): CafeScene {
  if (!input.thread) {
    return {
      phase: "quiet",
      connection: input.wsState,
      roomTitle: "No room selected",
      cats: input.cats.map((cat) => ({
        catId: cat.id,
        displayName: cat.displayName,
        place: "window",
        mood: "away",
        detail: "Outside this room",
      })),
      recentActivity: [],
    };
  }

  const activeMessage = input.messages.find(
    (message) =>
      message.status === "pending" || message.status === "streaming",
  );
  const runningCatIds = new Set(
    input.invocations?.turns
      .filter((turn) => turn.status === "running")
      .map((turn) => turn.catId) ?? [],
  );
  const queuedCatIds = deriveQueuedCatIds(input.invocations);
  const hasLiveInvocation =
    runningCatIds.size > 0 || queuedCatIds.size > 0;
  const hasFailedTurn =
    input.invocations?.turns.some((turn) => turn.status === "failed") ?? false;
  const latestMessage = input.messages.at(-1);
  const phase: CafePhase = activeMessage || hasLiveInvocation
    ? "live"
    : latestMessage?.status === "failed" || hasFailedTurn
      ? "attention"
      : "settled";

  return {
    phase,
    connection: input.wsState,
    roomTitle: input.thread.title,
    cats: input.cats.map((cat) => {
      const isMember = input.thread?.memberIds.includes(cat.id) ?? false;
      const latestCatMessage = [...input.messages]
        .reverse()
        .find((message) => message.authorId === cat.id);
      const latestCatTurn = input.invocations?.turns
        .filter((turn) => turn.catId === cat.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const mood: CafeCatMood = !isMember
        ? "away"
        : runningCatIds.has(cat.id) ||
            latestCatMessage?.status === "pending" ||
            latestCatMessage?.status === "streaming"
          ? "working"
          : queuedCatIds.has(cat.id)
            ? "queued"
            : latestCatTurn?.status === "failed" ||
                latestCatMessage?.status === "failed"
            ? "error"
            : "ready";
      return {
        catId: cat.id,
        displayName: cat.displayName,
        place: !isMember
          ? "window"
          : input.thread?.defaultCatId === cat.id
            ? "desk"
            : "cushion",
        mood,
        detail: describeCatMood(mood, latestCatMessage),
      };
    }),
    recentActivity: input.messages
      .slice(-4)
      .reverse()
      .map((message) => ({
        id: message.id,
        authorId: message.authorId,
        content:
          message.content ||
          message.progress ||
          message.error ||
          describeMessageStatus(message.status),
        status: message.status,
      })),
  };
}

/**
 * Identify cats waiting in canonical queued/running dispatch entries.
 * @param invocations - Current queue entries and exact per-cat turns
 * @returns Cat ids that are targeted but do not yet have a terminal/running turn
 */
function deriveQueuedCatIds(
  invocations: DeriveCafeSceneInput["invocations"],
): Set<string> {
  const queued = new Set<string>();
  if (!invocations) return queued;
  for (const entry of invocations.entries) {
    if (entry.status === "queued") {
      entry.catIds.forEach((catId) => queued.add(catId));
      continue;
    }
    if (entry.status !== "running") continue;
    const turns = invocations.turns.filter(
      (turn) => turn.queueEntryId === entry.id,
    );
    for (const catId of entry.catIds) {
      const turn = turns.find((candidate) => candidate.catId === catId);
      if (!turn || turn.status === "pending") queued.add(catId);
    }
  }
  return queued;
}

/**
 * Explain a projected cat mood using the canonical latest message when present.
 * @param mood - Render-only mood derived from membership and message status
 * @param message - Latest message authored by this cat
 * @returns Short accessible status copy
 */
function describeCatMood(
  mood: CafeCatMood,
  message: Message | undefined,
): string {
  if (mood === "away") return "Outside this room";
  if (mood === "working") return message?.progress || "Working now";
  if (mood === "queued") return "Queued for a turn";
  if (mood === "error") return message?.error || "Needs attention";
  return message ? "Latest turn settled" : "Ready in this room";
}

/**
 * Convert a message lifecycle value into fallback activity copy.
 * @param status - Canonical message status
 * @returns Human-readable fallback when content and diagnostics are empty
 */
function describeMessageStatus(status: Message["status"]): string {
  if (status === "pending") return "Waiting to start";
  if (status === "streaming") return "Responding";
  if (status === "failed") return "Turn failed";
  return "Turn completed";
}
