import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  isHostCapability,
  type HostCapability,
  type PluginCatalogEntry,
  type PluginManifest,
  type PluginRuntimeKind,
} from "@mac/shared";

/**
 * Resolve the plugins root (repo plugins/ or MAC_PLUGINS_DIR).
 * Walks cwd and monorepo parent (`../../plugins` from packages/api).
 * @param override - Optional absolute/relative override
 * @returns Absolute plugins directory
 */
export function resolvePluginsRoot(override?: string): string {
  if (override) return resolve(override);
  if (process.env.MAC_PLUGINS_DIR?.trim()) {
    return resolve(process.env.MAC_PLUGINS_DIR.trim());
  }
  const cwd = process.cwd();
  const candidates = [join(cwd, "plugins"), join(cwd, "..", "..", "plugins")];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "catalog.json"))) {
      return resolve(candidate);
    }
  }
  return resolve(cwd, "plugins");
}

/**
 * Load official catalog shell from plugins/catalog.json.
 * @param pluginsRoot - Root directory
 * @returns Catalog entries (may be empty)
 */
export function loadPluginCatalog(pluginsRoot: string): PluginCatalogEntry[] {
  const catalogPath = join(pluginsRoot, "catalog.json");
  if (!existsSync(catalogPath)) return [];
  const doc = JSON.parse(readFileSync(catalogPath, "utf8")) as {
    plugins?: unknown;
  };
  if (!Array.isArray(doc.plugins)) return [];
  const out: PluginCatalogEntry[] = [];
  for (const raw of doc.plugins) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : id;
    const version = typeof row.version === "string" ? row.version.trim() : "0.0.0";
    const description =
      typeof row.description === "string" ? row.description.trim() : "";
    const path = typeof row.path === "string" ? row.path.trim() : "";
    if (!id || !path) continue;
    out.push({
      id,
      name,
      version,
      description,
      path,
      official: row.official !== false,
    });
  }
  return out;
}

/**
 * Read and validate plugin.json for a catalog path.
 * @param pluginsRoot - Root
 * @param relativeOrAbsolute - Catalog path field
 * @returns Parsed manifest + absolute source path
 */
export function loadPluginManifest(
  pluginsRoot: string,
  relativeOrAbsolute: string,
): { manifest: PluginManifest; sourcePath: string } {
  const dir = isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : join(pluginsRoot, relativeOrAbsolute);
  const file = join(dir, "plugin.json");
  if (!existsSync(file)) {
    throw new Error(`plugin.json missing at ${file}`);
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const manifest = parseManifest(raw);
  return { manifest, sourcePath: dir };
}

/**
 * @param raw - JSON object
 * @returns Validated PluginManifest
 */
function parseManifest(raw: Record<string, unknown>): PluginManifest {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  const runtime = raw.runtime as PluginRuntimeKind;
  if (!id || !name || !version) {
    throw new Error("plugin manifest requires id, name, version");
  }
  if (runtime !== "in-process" && runtime !== "stdio") {
    throw new Error("plugin runtime must be in-process|stdio");
  }
  const requested: HostCapability[] = [];
  if (Array.isArray(raw.requestedCapabilities)) {
    for (const c of raw.requestedCapabilities) {
      if (typeof c !== "string" || !isHostCapability(c)) {
        throw new Error(`Unknown requested capability: ${String(c)}`);
      }
      requested.push(c);
    }
  }
  const manifest: PluginManifest = {
    id,
    name,
    version,
    description,
    runtime,
    requestedCapabilities: requested,
  };
  if (typeof raw.command === "string") manifest.command = raw.command;
  if (Array.isArray(raw.args) && raw.args.every((a) => typeof a === "string")) {
    manifest.args = raw.args as string[];
  }
  return manifest;
}
