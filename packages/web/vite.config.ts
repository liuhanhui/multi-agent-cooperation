import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.MAC_API_PORT ?? "4010";
const webPort = Number(process.env.MAC_WEB_PORT ?? 4011);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/health": `http://127.0.0.1:${apiPort}`,
      "/api": `http://127.0.0.1:${apiPort}`,
      "/ws": {
        target: `ws://127.0.0.1:${apiPort}`,
        ws: true,
      },
    },
  },
});
