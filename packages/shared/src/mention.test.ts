import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mentionSuggestion,
  parseLeadingMention,
  parseMentions,
  type MentionCat,
} from "./mention.js";

const cats: MentionCat[] = [
  { id: "architect", displayName: "Architect" },
  { id: "reviewer", displayName: "Reviewer" },
];

test("parseMentions leaves plain text with empty targets", () => {
  const parsed = parseMentions("hello world", cats);
  assert.deepEqual(parsed.targets, []);
  assert.equal(parsed.prompt, "hello world");
  assert.deepEqual(parsed.unresolved, []);
});

test("parseMentions resolves a single leading @id", () => {
  const parsed = parseMentions("@architect please design", cats);
  assert.deepEqual(parsed.targets, ["architect"]);
  assert.equal(parsed.prompt, "please design");
  assert.deepEqual(parsed.unresolved, []);
});

test("parseMentions resolves multiple leading mentions in order", () => {
  const parsed = parseMentions("@architect @reviewer please design", cats);
  assert.deepEqual(parsed.targets, ["architect", "reviewer"]);
  assert.equal(parsed.prompt, "please design");
});

test("parseMentions resolves @DisplayName tokens", () => {
  const parsed = parseMentions("@Reviewer @Architect check", cats);
  assert.deepEqual(parsed.targets, ["reviewer", "architect"]);
  assert.equal(parsed.prompt, "check");
});

test("parseMentions stops at unknown leading token (fail-closed)", () => {
  const parsed = parseMentions("@architect @unknown hi", cats);
  assert.deepEqual(parsed.targets, ["architect"]);
  assert.deepEqual(parsed.unresolved, ["unknown"]);
  assert.equal(parsed.prompt, "hi");
});

test("parseMentions ignores mid-sentence mentions", () => {
  const parsed = parseMentions("hello @architect", cats);
  assert.deepEqual(parsed.targets, []);
  assert.equal(parsed.prompt, "hello @architect");
});

test("parseLeadingMention remains a single-target convenience wrapper", () => {
  const parsed = parseLeadingMention("@architect please design", cats);
  assert.equal(parsed.catId, "architect");
  assert.equal(parsed.prompt, "please design");
  assert.equal(parsed.rawMention, "architect");
});
