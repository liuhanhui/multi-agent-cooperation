import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CatConfigError,
  createCatRegistry,
  loadCatRegistry,
  parseCatConfigDocument,
} from "./load-cat-config.js";

test("parseCatConfigDocument accepts cats array wrapper", () => {
  const cats = parseCatConfigDocument({
    cats: [
      { id: "a", displayName: "A", role: "r", provider: "claude-code" },
      { id: "b", displayName: "B", role: "r", provider: "fake" },
    ],
  });
  assert.equal(cats.length, 2);
  assert.equal(cats[0]?.id, "a");
});

test("parseCatConfigDocument accepts legacy single object", () => {
  const cats = parseCatConfigDocument({
    id: "solo",
    displayName: "Solo",
    role: "r",
    provider: "claude-code",
  });
  assert.equal(cats.length, 1);
  assert.equal(cats[0]?.id, "solo");
});

test("rejects secret-like fields", () => {
  assert.throws(
    () =>
      parseCatConfigDocument({
        cats: [
          {
            id: "x",
            displayName: "X",
            role: "r",
            provider: "claude-code",
            apiKey: "sk-leak",
          },
        ],
      }),
    CatConfigError,
  );
});

test("createCatRegistry rejects duplicates and empty", () => {
  assert.throws(() => createCatRegistry([]), /at least one/);
  assert.throws(
    () =>
      createCatRegistry([
        { id: "a", displayName: "A", role: "r", provider: "p" },
        { id: "a", displayName: "A2", role: "r", provider: "p" },
      ]),
    /Duplicate/,
  );
});

test("loadCatRegistry reads file read-only and falls back when missing", () => {
  const missing = loadCatRegistry(join(tmpdir(), `mac-missing-${Date.now()}.json`));
  assert.ok(missing.list().length >= 3);
  assert.equal(missing.get("builder")?.provider, "antigravity");
  assert.equal(missing.get("reviewer")?.provider, "codex");

  const dir = mkdtempSync(join(tmpdir(), "mac-cats-"));
  const file = join(dir, "agent-config.json");
  writeFileSync(
    file,
    JSON.stringify({
      cats: [
        { id: "one", displayName: "One", role: "r", provider: "fake", systemSnippet: "sys-one" },
        { id: "two", displayName: "Two", role: "r", provider: "fake", systemSnippet: "sys-two" },
      ],
    }),
    "utf8",
  );
  const reg = loadCatRegistry(file);
  assert.equal(reg.get("two")?.systemSnippet, "sys-two");
  assert.equal(reg.defaultCatId(), "one");
  unlinkSync(file);
});
