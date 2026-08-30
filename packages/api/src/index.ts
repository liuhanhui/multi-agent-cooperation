import Fastify from "fastify";
import type { HealthResponse } from "@mac/shared";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

loadEnvFile();

const port = Number(process.env.MAC_API_PORT ?? 4010);
const store = (process.env.MAC_STORE ?? "memory") === "redis" ? "redis" : "memory";
const version = "0.0.1";

const app = Fastify({ logger: true });

app.get("/health", async (): Promise<HealthResponse> => ({
  status: "ok",
  service: "mac-api",
  version,
  store,
  timestamp: new Date().toISOString(),
}));

app.get("/", async () => ({
  name: "multi-agent-cooperation",
  docs: ["docs/VISION.md", "build-plan.md"],
  health: "/health",
}));

await app.listen({ port, host: "127.0.0.1" });
console.log(`[mac-api] listening on http://127.0.0.1:${port} (store=${store})`);
