#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const apiEntry = join(root, "packages", "api", "dist", "index.js");

if (!existsSync(apiEntry)) {
  console.error("API not built. Run: pnpm build");
  process.exit(1);
}

const child = spawn(process.execPath, [apiEntry], {
  stdio: "inherit",
  env: { ...process.env },
  cwd: root,
});

child.on("exit", (code) => process.exit(code ?? 1));
