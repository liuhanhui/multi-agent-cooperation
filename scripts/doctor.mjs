#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const live = process.argv.includes("--live");
const checks = [];

/**
 * Record one doctor result for the final summary.
 * @param name - Human-readable check
 * @param ok - Whether it passed
 * @param detail - Evidence or remediation
 * @param required - Whether failure makes doctor exit non-zero
 * @returns Nothing
 */
function record(name, ok, detail, required = true) {
  checks.push({ name, ok, detail, required });
  console.log(`${ok ? "✓" : required ? "✗" : "!"} ${name}: ${detail}`);
}

const [nodeMajor, nodeMinor] = process.versions.node
  .split(".")
  .map((part) => Number(part));
const nodeSupported =
  nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 13);
record(
  "Node.js",
  nodeSupported,
  `v${process.versions.node} (need 22.13+ for node:sqlite)`,
);

const pnpmViaNode = process.env.npm_execpath?.trim();
const pnpmCommand = pnpmViaNode ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const pnpmArgs = pnpmViaNode ? [pnpmViaNode, "--version"] : ["--version"];
const pnpmResult = spawnSync(pnpmCommand, pnpmArgs, {
  cwd: root,
  encoding: "utf8",
  shell: !pnpmViaNode && process.platform === "win32",
});
const pnpmVersion = pnpmResult.status === 0 ? pnpmResult.stdout.trim() : "";
const pnpmMajor = Number(pnpmVersion.split(".")[0]);
record("pnpm", pnpmMajor === 9, pnpmVersion || "not found (need pnpm 9)");

record(
  "workspace lockfile",
  existsSync(join(root, "pnpm-lock.yaml")),
  "pnpm-lock.yaml must be present",
);
record(
  "dependencies",
  existsSync(join(root, "node_modules")),
  "node_modules present (run pnpm run setup if missing)",
);
record(
  "API build",
  existsSync(join(root, "packages", "api", "dist", "index.js")),
  "packages/api/dist/index.js",
);
record(
  "Web build",
  existsSync(join(root, "packages", "web", "dist", "index.html")),
  "packages/web/dist/index.html",
);

const envExample = join(root, ".env.example");
record(".env.example", existsSync(envExample), "safe defaults documented");
record(
  ".env",
  existsSync(join(root, ".env")),
  "optional; defaults use memory store and ports 4010/4011",
  false,
);

if (existsSync(envExample)) {
  const text = readFileSync(envExample, "utf8");
  record(
    "safe default ports",
    text.includes("MAC_API_PORT=4010") &&
      text.includes("MAC_WEB_PORT=4011") &&
      text.includes("MAC_REDIS_PORT=6410"),
    "4010 / 4011 / 6410",
  );
}

if (live) {
  const apiPort = process.env.MAC_API_PORT ?? "4010";
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    const body = await response.json();
    record(
      "live API",
      response.ok && body?.status === "ok",
      `http://127.0.0.1:${apiPort}/health → ${body?.status ?? response.status}`,
    );
  } catch (error) {
    record(
      "live API",
      false,
      `not reachable on project port ${apiPort}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const failed = checks.filter((check) => check.required && !check.ok);
console.log(
  failed.length === 0
    ? "\nDoctor: ready."
    : `\nDoctor: ${failed.length} required check(s) failed.`,
);
process.exitCode = failed.length === 0 ? 0 : 1;
