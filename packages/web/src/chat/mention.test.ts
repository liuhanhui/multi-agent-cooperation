import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatConfig } from "@mac/shared";
import { mentionSuggestion, parseLeadingMention, parseMentions } from "./mention.js";

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

test("web re-export parseMentions resolves multi-target", () => {
  const parsed = parseMentions("@architect @reviewer please design", cats);
  assert.deepEqual(parsed.targets, ["architect", "reviewer"]);
  assert.equal(parsed.prompt, "please design");
});

test("web re-export parseLeadingMention still works for composer", () => {
  const parsed = parseLeadingMention("@architect please design", cats);
  assert.equal(parsed.catId, "architect");
  assert.equal(parsed.prompt, "please design");
});

test("mentionSuggestion prefixes default cat", () => {
  assert.equal(mentionSuggestion(cats[0]), "@architect ");
});
