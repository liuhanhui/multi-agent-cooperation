import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

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
    plugins: [react()],
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
