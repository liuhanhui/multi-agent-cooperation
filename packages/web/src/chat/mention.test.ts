import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatConfig } from "@mac/shared";
import { mentionSuggestion, parseLeadingMention } from "./mention.js";

const cats: CatConfig[] = [
  {
    id: "architect",
    displayName: "Architect",
    role: "architecture",
    provider: "fake",
  },
  {
    id: "reviewer",
    displayName: "Reviewer",
    role: "review",
    provider: "fake",
  },
];

test("parseLeadingMention resolves @id", () => {
  const parsed = parseLeadingMention("@architect please design", cats);
  assert.equal(parsed.catId, "architect");
  assert.equal(parsed.prompt, "please design");
});

test("parseLeadingMention with only @id leaves empty prompt", () => {
  const parsed = parseLeadingMention("@architect", cats);
  assert.equal(parsed.catId, "architect");
  assert.equal(parsed.prompt, "");
});

test("parseLeadingMention resolves @DisplayName", () => {
  const parsed = parseLeadingMention("@Reviewer check this", cats);
  assert.equal(parsed.catId, "reviewer");
  assert.equal(parsed.prompt, "check this");
});

test("parseLeadingMention leaves plain text alone", () => {
  const parsed = parseLeadingMention("hello world", cats);
  assert.equal(parsed.catId, null);
  assert.equal(parsed.prompt, "hello world");
});

test("mentionSuggestion prefixes default cat", () => {
  assert.equal(mentionSuggestion(cats[0]), "@architect ");
});
