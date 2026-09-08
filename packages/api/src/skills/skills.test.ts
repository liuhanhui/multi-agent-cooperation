import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { formatSkillInjection, matchSkills, resolveSkillInjection } from "./match-skills.js";
import { parseSkillMarkdown, estimateTokens } from "./parse-skill-md.js";
import { loadSkillRegistry } from "./skill-registry.js";

test("parseSkillMarkdown reads frontmatter triggers and body", () => {
  const raw = `---
name: tdd
description: >
  Do TDD.
triggers:
  - "TDD"
  - "test first"
---

# TDD

Body here.
`;
  const parsed = parseSkillMarkdown(raw);
  assert.equal(parsed.name, "tdd");
  assert.match(parsed.description, /Do TDD/);
  assert.deepEqual(parsed.triggers, ["TDD", "test first"]);
  assert.match(parsed.body, /Body here/);
});

test("estimateTokens scales with length", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.ok(estimateTokens("a".repeat(40)) >= 10);
});

test("loadSkillRegistry loads manifest trio", () => {
  const dir = mkdtempSync(join(tmpdir(), "mac-skills-"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ tokenBudget: 500, skills: ["tdd", "debugging"] }),
    "utf8",
  );
  for (const id of ["tdd", "debugging"]) {
    mkdirSync(join(dir, id));
    writeFileSync(
      join(dir, id, "SKILL.md"),
      `---\nname: ${id}\ndescription: ${id} desc\ntriggers:\n  - "${id}"\n---\n\n# ${id}\n`,
      "utf8",
    );
  }

  const reg = loadSkillRegistry(dir);
  assert.equal(reg.tokenBudget, 500);
  assert.deepEqual(
    reg.list().map((s) => s.id),
    ["tdd", "debugging"],
  );
  assert.ok(reg.get("tdd")?.body.includes("# tdd"));
});

test("matchSkills injects hits and skips misses", () => {
  const dir = mkdtempSync(join(tmpdir(), "mac-skills-"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ tokenBudget: 10_000, skills: ["tdd", "debugging", "request-review"] }),
    "utf8",
  );
  const specs: Record<string, string[]> = {
    tdd: ["TDD", "test first"],
    debugging: ["bug", "debug"],
    "request-review": ["request review", "请 review"],
  };
  for (const [id, triggers] of Object.entries(specs)) {
    mkdirSync(join(dir, id));
    const trigYaml = triggers.map((t) => `  - "${t}"`).join("\n");
    writeFileSync(
      join(dir, id, "SKILL.md"),
      `---\nname: ${id}\ndescription: ${id}\ntriggers:\n${trigYaml}\n---\n\n# ${id}\nbody-${id}\n`,
      "utf8",
    );
  }
  const reg = loadSkillRegistry(dir);

  const hit = matchSkills(reg, "Please use TDD on this feature");
  assert.deepEqual(hit.injectedIds, ["tdd"]);
  assert.equal(hit.skipped.length, 0);

  const miss = matchSkills(reg, "hello world with no keywords");
  assert.deepEqual(miss.injectedIds, []);
  assert.equal(formatSkillInjection(reg, miss), "");

  const multi = resolveSkillInjection(reg, "fix the bug then request review");
  assert.ok(multi.match.injectedIds.includes("debugging"));
  assert.ok(multi.match.injectedIds.includes("request-review"));
  assert.match(multi.injection, /Skill: debugging/);
});

test("matchSkills respects token budget", () => {
  const dir = mkdtempSync(join(tmpdir(), "mac-skills-"));
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ tokenBudget: 80, skills: ["a", "b"] }),
    "utf8",
  );
  for (const id of ["a", "b"]) {
    mkdirSync(join(dir, id));
    writeFileSync(
      join(dir, id, "SKILL.md"),
      `---\nname: ${id}\ndescription: ${id}\ntriggers:\n  - "${id}-trigger"\n---\n\n${"x".repeat(200)}\n`,
      "utf8",
    );
  }
  const reg = loadSkillRegistry(dir);
  const match = matchSkills(reg, "a-trigger and b-trigger together");
  assert.equal(match.injectedIds.length, 1);
  assert.equal(match.injectedIds[0], "a");
  assert.ok(match.skipped.some((s) => s.id === "b" && s.reason === "token_budget"));
});
