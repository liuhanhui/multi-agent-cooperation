#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

const root = process.cwd();
const apiPort = Number(process.env.MAC_API_PORT ?? 4010);
const webPort = Number(process.env.MAC_WEB_PORT ?? 4011);
const apiEntry = join(root, "packages", "api", "dist", "index.js");
const viteEntry = join(
  root,
  "packages",
  "web",
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);
const children = [];

/**
 * Ensure a project port is free without probing any foreign port.
 * @param port - Project API or Web port
 * @returns Promise that rejects when already occupied
 */
function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `project port ${port} is already in use; stop your own instance or configure another project port`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => {
      server.close(resolve);
    });
  });
}

/**
 * Fetch JSON and throw a useful error for non-2xx responses.
 * @param url - Project-local URL
 * @param init - Fetch options
 * @returns Parsed response body
 */
async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${url}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Retry until a project endpoint returns successfully.
 * @param url - Health URL
 * @param timeoutMs - Overall timeout
 * @returns Parsed health response
 */
async function waitForHealth(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(
    `health timeout: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * Stop only API/Web children spawned by this smoke process.
 * @returns Nothing
 */
function cleanup() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

if (!existsSync(apiEntry) || !existsSync(viteEntry)) {
  console.error("[smoke] Build output/dependencies missing. Run: pnpm run setup");
  process.exit(1);
}

try {
  await assertPortFree(apiPort);
  await assertPortFree(webPort);

  const env = {
    ...process.env,
    MAC_API_PORT: String(apiPort),
    MAC_WEB_PORT: String(webPort),
    MAC_STORE: "memory",
    MAC_AGENT_PROVIDER: "fake",
    MAC_EVIDENCE_DB: ":memory:",
  };

  const api = spawn(process.execPath, [apiEntry], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const web = spawn(
    process.execPath,
    [viteEntry, "preview", "--host", "127.0.0.1", "--port", String(webPort)],
    {
      cwd: join(root, "packages", "web"),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.push(api, web);

  const apiBase = `http://127.0.0.1:${apiPort}`;
  const webBase = `http://127.0.0.1:${webPort}`;
  const health = await waitForHealth(`${apiBase}/health`);
  if (health.status !== "ok" || health.store !== "memory") {
    throw new Error(`unexpected health: ${JSON.stringify(health)}`);
  }
  console.log("✓ API health (memory + fake provider)");

  const proxiedHealth = await waitForHealth(`${webBase}/health`);
  if (proxiedHealth.status !== "ok") {
    throw new Error("Web preview did not proxy API health");
  }
  console.log("✓ Web preview + API proxy");

  const created = await fetchJson(`${apiBase}/api/threads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: `smoke-${Date.now()}` }),
  });
  const threadId = created.thread?.id;
  if (!threadId) throw new Error("thread creation returned no id");
  console.log("✓ Thread creation");

  await fetchJson(`${apiBase}/api/threads/${threadId}/messages/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "@architect smoke hello" }),
  });

  const deadline = Date.now() + 10_000;
  let fakeReply = false;
  while (Date.now() < deadline && !fakeReply) {
    const body = await fetchJson(
      `${apiBase}/api/threads/${threadId}/messages`,
    );
    fakeReply = body.messages?.some(
      (message) =>
        message.role === "assistant" &&
        message.status === "completed" &&
        message.content.includes("Hello from fake"),
    );
    if (!fakeReply) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!fakeReply) throw new Error("fake invocation did not complete");
  console.log("✓ Fake provider invocation");
  console.log("\nSmoke: ready.");
} catch (error) {
  console.error(
    `\nSmoke failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  cleanup();
}
