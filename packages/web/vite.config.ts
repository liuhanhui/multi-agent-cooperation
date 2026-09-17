import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { parse } from "yaml";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Compile canonical guide YAML into a static browser module at build time.
 * @returns Vite plugin that handles the private `?guide` query
 */
function guideYamlPlugin(): Plugin {
  return {
    name: "mac-guide-yaml",
    enforce: "pre",
    /**
     * @param id - Vite module id, including the private query
     * @returns Generated ESM for guide YAML, or null for unrelated modules
     */
    load(id) {
      if (!id.endsWith(".yaml?guide")) return null;
      const filePath = id.slice(0, -"?guide".length);
      const value = parse(readFileSync(filePath, "utf8")) as unknown;
      return `export default ${JSON.stringify(value)};`;
    },
  };
}

export default defineConfig(({ mode }) => {
  // Vite runs with packages/web as cwd; explicitly read the repo-root .env.
  const fileEnv = loadEnv(mode, repoRoot, "");
  const apiPort = process.env.MAC_API_PORT ?? fileEnv.MAC_API_PORT ?? "4010";
  const webPort = Number(
    process.env.MAC_WEB_PORT ?? fileEnv.MAC_WEB_PORT ?? 4011,
  );
  const proxy = {
    "/health": `http://127.0.0.1:${apiPort}`,
    "/api": `http://127.0.0.1:${apiPort}`,
    "/ws": {
      target: `ws://127.0.0.1:${apiPort}`,
      ws: true,
    },
  };

  return {
    plugins: [guideYamlPlugin(), react()],
    server: {
      host: "127.0.0.1",
      port: webPort,
      strictPort: true,
      proxy,
    },
    // Production-like `pnpm start` needs the same API/WS bridge.
    preview: {
      host: "127.0.0.1",
      port: webPort,
      strictPort: true,
      proxy,
    },
  };
});
