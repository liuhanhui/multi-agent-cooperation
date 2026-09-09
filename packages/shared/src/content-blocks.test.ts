import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyHubBlockAction,
  formatBlocksForPrompt,
  parseMacBlocksFence,
  validateContentBlocks,
} from "./content-blocks.js";
import type { Message } from "./types/message.js";

test("validateContentBlocks accepts checklist and decision", () => {
  const blocks = validateContentBlocks([
    {
      type: "checklist",
      id: "c1",
      title: "Ship",
      items: [
        { id: "i1", label: "Write test", checked: false },
        { id: "i2", label: "Implement", checked: false },
      ],
    },
    {
      type: "decision",
      id: "d1",
      prompt: "Auth style?",
      options: [
        { id: "jwt", label: "JWT" },
        { id: "session", label: "Session" },
      ],
      selectedId: null,
    },
  ]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.type, "checklist");
});

test("parseMacBlocksFence strips fence and returns blocks", () => {
  const raw = [
    "Here is the plan.",
    "",
    "```mac-blocks",
    JSON.stringify([
      {
        type: "checklist",
        id: "login",
        title: "Login",
        items: [{ id: "a", label: "Form", checked: false }],
      },
    ]),
    "```",
  ].join("\n");
  const parsed = parseMacBlocksFence(raw);
  assert.equal(parsed.content, "Here is the plan.");
  assert.equal(parsed.blocks.length, 1);
  assert.equal(parsed.blocks[0]?.type, "checklist");
});

test("applyHubBlockAction toggles checklist and selects decision", () => {
  const blocks = validateContentBlocks([
    {
      type: "checklist",
      id: "c1",
      items: [{ id: "i1", label: "A", checked: false }],
    },
    {
      type: "decision",
      id: "d1",
      prompt: "Pick",
      options: [
        { id: "x", label: "X" },
        { id: "y", label: "Y" },
      ],
      selectedId: null,
    },
  ]);
  const toggled = applyHubBlockAction(blocks, {
    type: "checklist.toggle",
    blockId: "c1",
    itemId: "i1",
    checked: true,
  });
  assert.equal(toggled[0]?.type === "checklist" && toggled[0].items[0]?.checked, true);

  const decided = applyHubBlockAction(toggled, {
    type: "decision.select",
    blockId: "d1",
    optionId: "y",
  });
  assert.equal(decided[1]?.type === "decision" && decided[1].selectedId, "y");
});

test("formatBlocksForPrompt exposes checked state for next cat", () => {
  const messages: Message[] = [
    {
      id: "m1",
      threadId: "t1",
      seq: 1,
      role: "assistant",
      authorId: "builder",
      content: "plan",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      blocks: [
        {
          type: "checklist",
          id: "c1",
          title: "Login",
          items: [
            { id: "i1", label: "Form", checked: true },
            { id: "i2", label: "API", checked: false },
          ],
        },
      ],
    },
  ];
  const text = formatBlocksForPrompt(messages);
  assert.match(text, /\[x\] Form/);
  assert.match(text, /\[ \] API/);
  assert.match(text, /Hub Actions/);
});
