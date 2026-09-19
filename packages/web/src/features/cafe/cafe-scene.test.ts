import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CatConfig,
  Message,
  QueueEntry,
  Thread,
  TurnExecution,
} from "@mac/shared";
import { deriveCafeScene } from "./cafe-scene";

const cats: CatConfig[] = [
  { id: "architect", displayName: "Architect", role: "design", provider: "fake" },
  { id: "reviewer", displayName: "Reviewer", role: "review", provider: "fake" },
  { id: "builder", displayName: "Builder", role: "build", provider: "fake" },
];

const thread: Thread = {
  id: "thread-1",
  title: "Visible room",
  status: "active",
  createdAt: "2026-09-17T08:00:00.000Z",
  updatedAt: "2026-09-17T08:05:00.000Z",
  lastSeq: 2,
  memberIds: ["architect", "reviewer"],
  defaultCatId: "architect",
};

/**
 * Build a minimal assistant message for scene projection tests.
 * @param patch - Fields that distinguish lifecycle and author
 * @returns Complete message contract
 */
function message(patch: Partial<Message>): Message {
  return {
    id: patch.id ?? "message-1",
    threadId: thread.id,
    seq: patch.seq ?? 1,
    role: "assistant",
    authorId: patch.authorId ?? "architect",
    content: patch.content ?? "",
    status: patch.status ?? "completed",
    createdAt: patch.createdAt ?? "2026-09-17T08:04:00.000Z",
    updatedAt: patch.updatedAt ?? "2026-09-17T08:04:00.000Z",
    ...patch,
  };
}

test("projects membership, default seat, and live message state without stored UI state", () => {
  const scene = deriveCafeScene({
    cats,
    thread,
    messages: [
      message({
        authorId: "reviewer",
        status: "streaming",
        content: "Reviewing the boundary",
      }),
    ],
    wsState: "live",
  });

  assert.equal(scene.phase, "live");
  assert.equal(scene.connection, "live");
  assert.deepEqual(
    scene.cats.map(({ catId, place, mood }) => ({ catId, place, mood })),
    [
      { catId: "architect", place: "desk", mood: "ready" },
      { catId: "reviewer", place: "cushion", mood: "working" },
      { catId: "builder", place: "window", mood: "away" },
    ],
  );
});

test("uses terminal message truth for settled and attention scenes", () => {
  const settled = deriveCafeScene({
    cats,
    thread,
    messages: [message({ status: "completed", content: "Done" })],
    wsState: "live",
  });
  assert.equal(settled.phase, "settled");
  assert.equal(settled.cats[0]?.mood, "ready");
  assert.equal(settled.recentActivity[0]?.content, "Done");

  const attention = deriveCafeScene({
    cats,
    thread,
    messages: [
      message({
        status: "failed",
        error: "provider unavailable",
        content: "",
      }),
    ],
    wsState: "down",
  });
  assert.equal(attention.phase, "attention");
  assert.equal(attention.cats[0]?.mood, "error");
  assert.equal(attention.connection, "down");
});

test("returns a quiet scene when no thread is selected", () => {
  const scene = deriveCafeScene({
    cats,
    thread: null,
    messages: [],
    wsState: "idle",
  });

  assert.equal(scene.phase, "quiet");
  assert.equal(scene.roomTitle, "No room selected");
  assert.ok(scene.cats.every((cat) => cat.place === "window"));
});

test("uses dispatch turns for the exact running cat and serial queue order", () => {
  const entry: QueueEntry = {
    id: "entry-1",
    threadId: thread.id,
    prompt: "Work serially",
    catIds: ["architect", "reviewer"],
    authorId: "operator",
    status: "running",
    priority: 0,
    createdAt: "2026-09-17T08:06:00.000Z",
    updatedAt: "2026-09-17T08:07:00.000Z",
  };
  const turns: TurnExecution[] = [
    {
      id: "turn-1",
      queueEntryId: entry.id,
      threadId: thread.id,
      catId: "architect",
      messageId: "message-1",
      attempt: 1,
      status: "completed",
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
    {
      id: "turn-2",
      queueEntryId: entry.id,
      threadId: thread.id,
      catId: "reviewer",
      messageId: "message-2",
      attempt: 1,
      status: "running",
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
  ];

  const scene = deriveCafeScene({
    cats,
    thread,
    messages: [message({ authorId: "architect", status: "completed" })],
    wsState: "live",
    invocations: { entries: [entry], turns },
  });

  assert.equal(scene.cats.find((cat) => cat.catId === "architect")?.mood, "ready");
  assert.equal(scene.cats.find((cat) => cat.catId === "reviewer")?.mood, "working");
});

test("shows queued cats before an assistant bubble exists", () => {
  const entry: QueueEntry = {
    id: "entry-queued",
    threadId: thread.id,
    prompt: "Review later",
    catIds: ["reviewer"],
    authorId: "operator",
    status: "queued",
    priority: 0,
    createdAt: "2026-09-17T08:06:00.000Z",
    updatedAt: "2026-09-17T08:06:00.000Z",
  };
  const scene = deriveCafeScene({
    cats,
    thread,
    messages: [],
    wsState: "live",
    invocations: { entries: [entry], turns: [] },
  });

  assert.equal(scene.phase, "live");
  assert.equal(scene.cats.find((cat) => cat.catId === "reviewer")?.mood, "queued");
});
