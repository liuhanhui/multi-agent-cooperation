#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const root = process.cwd();
const pnpmViaNode = process.env.npm_execpath?.trim();
const pnpm = pnpmViaNode ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/**
 * Run one setup command with inherited output and stop on failure.
 * @param label - Progress label
 * @param args - pnpm arguments
 * @returns Nothing
 */
function run(label, args) {
  console.log(`\n[setup] ${label}`);
  const invocationArgs = pnpmViaNode ? [pnpmViaNode, ...args] : args;
  const result = spawnSync(pnpm, invocationArgs, {
    cwd: root,
    stdio: "inherit",
    shell: !pnpmViaNode && process.platform === "win32",
  });
  if (result.error) {
    console.error(`[setup] ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const [nodeMajor, nodeMinor] = process.versions.node
  .split(".")
  .map((part) => Number(part));
const nodeSupported =
  nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 13);
if (!nodeSupported) {
  console.error(
    `[setup] Node.js 22.13+ required for node:sqlite; found ${process.versions.node}`,
  );
  process.exit(1);
}

// Lockfile install + full build are deterministic and do not mutate runtime config.
run("Installing pinned workspace dependencies", ["install", "--frozen-lockfile"]);
run("Building API, Web, and shared contracts", ["build"]);
run("Checking Iron Laws and TypeScript", ["check"]);

console.log(`
[setup] Ready.

Start (memory mode, API + Web):
  pnpm start -- --memory

Then open:
  http://127.0.0.1:4011

Optional provider setup:
  Copy .env.example to .env and edit it yourself.
  The installer never writes .env, agent-config.json, or MCP config.
`);
