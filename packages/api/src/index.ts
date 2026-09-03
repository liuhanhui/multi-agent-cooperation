import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClaudeCodeProvider } from "./agents/claude-code-provider.js";
import { createFakeAgentProvider } from "./agents/fake-provider.js";
import type { AgentProvider } from "./agents/types.js";
import { loadCatRegistry } from "./cats/load-cat-config.js";
import { buildApp } from "./create-app.js";
import { createStore } from "./store/create-store.js";

function loadEnvFile() {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function createAgent(): AgentProvider {
  const kind = (process.env.MAC_AGENT_PROVIDER ?? "claude-code").toLowerCase();
  if (kind === "fake") return createFakeAgentProvider();
  return createClaudeCodeProvider();
}

loadEnvFile();

const port = Number(process.env.MAC_API_PORT ?? 4010);
const storeKind = (process.env.MAC_STORE ?? "memory") === "redis" ? "redis" : "memory";
const store = await createStore(storeKind);
const agent = createAgent();
const cats = loadCatRegistry();
const app = await buildApp({ store, storeKind, agent, cats, version: "0.0.1" });

await app.listen({ port, host: "127.0.0.1" });
console.log(
  `[mac-api] listening on http://127.0.0.1:${port} (store=${storeKind}, agent=${agent.id}, cats=${cats.list().length})`,
);
