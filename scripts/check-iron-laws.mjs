#!/usr/bin/env node
/**
 * Iron Laws machine guard (M01).
 * Fails CI if agent-facing docs lose the four laws, or if scripts advertise
 * destructive storage commands without an explicit SANCTUARY_OK token.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const requiredDocs = ["docs/IRON_LAWS.md", "AGENTS.md"];
const requiredPhrases = [
  "Data Storage Sanctuary",
  "Process Self-Preservation",
  "Config Immutability",
  "Network Boundary",
];

const forbiddenPatterns = [
  {
    re: /\b(FLUSHALL|FLUSHDB)\b/i,
    hint: "Redis flush without sanctuary approval",
  },
  {
    re: /\b(rm\s+-rf\s+.*\.(sqlite|rdb)|DELETE\s+FROM\s+evidence)\b/i,
    hint: "Destructive storage wipe pattern",
  },
];

let failed = false;

for (const doc of requiredDocs) {
  const text = readFileSync(join(root, doc), "utf8");
  for (const phrase of requiredPhrases) {
    if (!text.includes(phrase)) {
      console.error(`[iron-laws] missing "${phrase}" in ${doc}`);
      failed = true;
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(mjs|js|ts|sh|ps1)$/.test(name)) {
      const text = readFileSync(full, "utf8");
      if (text.includes("SANCTUARY_OK")) continue;
      for (const { re, hint } of forbiddenPatterns) {
        if (re.test(text)) {
          console.error(`[iron-laws] ${hint}: ${relative(root, full)}`);
          failed = true;
        }
      }
    }
  }
}

walk(join(root, "scripts"));
walk(join(root, "packages"));

if (failed) {
  console.error("[iron-laws] FAILED");
  process.exit(1);
}
console.log("[iron-laws] OK");
