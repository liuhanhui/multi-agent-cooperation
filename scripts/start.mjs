#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const apiEntry = join(root, "packages", "api", "dist", "index.js");
const webDist = join(root, "packages", "web", "dist", "index.html");
const viteEntry = join(
  root,
  "packages",
  "web",
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);
const args = new Set(process.argv.slice(2));
const apiOnly = args.has("--api-only");
const memoryMode = args.has("--memory");
const unknownArgs = [...args].filter(
  (arg) => arg !== "--api-only" && arg !== "--memory",
);

if (unknownArgs.length > 0) {
  console.error(`Unknown start option(s): ${unknownArgs.join(", ")}`);
  process.exit(1);
}

if (
  !existsSync(apiEntry) ||
  (!apiOnly && (!existsSync(webDist) || !existsSync(viteEntry)))
) {
  console.error("Build output missing. Run: pnpm run setup");
  process.exit(1);
}

/**
 * Read root .env without overwriting explicit process variables.
 * @param base - Current process environment
 * @returns Environment passed to owned API/Web children
 */
function loadRootEnv(base) {
  const next = { ...base };
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return next;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const split = trimmed.indexOf("=");
    if (split <= 0) continue;
    const key = trimmed.slice(0, split).trim();
    if (key in next) continue;
    next[key] = trimmed.slice(split + 1).trim();
  }
  return next;
}

// `--memory` is a process-local override; the launcher never edits .env.
const env = {
  ...loadRootEnv(process.env),
  ...(memoryMode ? { MAC_STORE: "memory" } : {}),
};
const apiPort = Number(env.MAC_API_PORT ?? 4010);
const webPort = Number(env.MAC_WEB_PORT ?? 4011);
for (const [name, port] of [
  ["MAC_API_PORT", apiPort],
  ["MAC_WEB_PORT", webPort],
]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`${name} must be an integer from 1 to 65535`);
    process.exit(1);
  }
}
const children = [];

const api = spawn(process.execPath, [apiEntry], {
  stdio: "inherit",
  env,
  cwd: root,
});
children.push(api);

if (!apiOnly) {
  const web = spawn(
    process.execPath,
    [
      viteEntry,
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(webPort),
    ],
    {
      stdio: "inherit",
      env,
      cwd: join(root, "packages", "web"),
    },
  );
  children.push(web);
}

let exiting = false;

/**
 * Stop only processes created by this launcher, then return the first exit code.
 * @param code - Exit code from a child or signal handler
 * @returns Nothing; terminates this launcher after children receive SIGTERM
 */
function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 100).unref();
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(`[start] child failed: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (!exiting) {
      console.error(`[start] child exited (${signal ?? code ?? 1})`);
      shutdown(code ?? 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(
  `[start] API http://127.0.0.1:${apiPort}${apiOnly ? "" : ` · Web http://127.0.0.1:${webPort}`} · store=${env.MAC_STORE ?? "memory"}`,
);
