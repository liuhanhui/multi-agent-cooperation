import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createAntigravityProvider } from "./agents/antigravity-provider.js";
import { createClaudeCodeProvider } from "./agents/claude-code-provider.js";
import { createCodexProvider } from "./agents/codex-provider.js";
import { createFakeAgentProvider } from "./agents/fake-provider.js";
import { createProviderRouter } from "./agents/provider-router.js";
import type { AgentProvider } from "./agents/types.js";
import { loadCatRegistry, type CatRegistry } from "./cats/load-cat-config.js";
import { buildApp } from "./create-app.js";
import { resolveEvidenceDbPath } from "./memory/evidence-store.js";
import { createStore } from "./store/create-store.js";

/**
 * Resolve `.env` for monorepo: `pnpm --filter @mac/api` runs with cwd=packages/api,
 * while the real env file lives at the repo root.
 * @returns Absolute path to the nearest `.env`, or null
 */
function resolveEnvPath(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Load optional `.env` into process.env without overwriting existing keys.
 * Walks up from cwd so root `.env` is found when API starts under packages/api.
 * Side effect: mutates process.env for keys not already set.
 */
function loadEnvFile() {
  const path = resolveEnvPath();
  if (!path) return;
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

/**
 * Build the multi-family AgentProvider used at process start.
 * When MAC_AGENT_PROVIDER=fake, every cat routes to the in-process fake adapter.
 * Otherwise each cat.provider selects claude-code / codex / antigravity (fallback: env default).
 * @param cats - Loaded cat registry (read-only)
 * @returns Router AgentProvider
 */
function createAgent(cats: CatRegistry): AgentProvider {
  const kind = (process.env.MAC_AGENT_PROVIDER ?? "claude-code").toLowerCase();
  if (kind === "fake") {
    return createFakeAgentProvider();
  }

  const providers: Record<string, AgentProvider> = {
    "claude-code": createClaudeCodeProvider(),
    codex: createCodexProvider(),
    antigravity: createAntigravityProvider(),
    fake: createFakeAgentProvider(),
  };

  const defaultProviderId = providers[kind] ? kind : "claude-code";

  return createProviderRouter({
    providers,
    defaultProviderId,
    resolveProviderId: (catId) => {
      const fromCat = cats.get(catId)?.provider;
      if (fromCat && providers[fromCat]) return fromCat;
      return defaultProviderId;
    },
  });
}

loadEnvFile();

const port = Number(process.env.MAC_API_PORT ?? 4010);
const storeKind = (process.env.MAC_STORE ?? "memory") === "redis" ? "redis" : "memory";
const store = await createStore(storeKind);
const cats = loadCatRegistry();
const agent = createAgent(cats);
const app = await buildApp({
  store,
  storeKind,
  agent,
  cats,
  version: "0.0.1",
  // Durable evidence DB (Iron Laws: never unlink this file from tooling).
  evidenceDbPath: resolveEvidenceDbPath(),
});

await app.listen({ port, host: "127.0.0.1" });
console.log(
  `[mac-api] listening on http://127.0.0.1:${port} (store=${storeKind}, agent=${agent.id}, cats=${cats.list().length})`,
);
