import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CatConfig } from "@mac/shared";

const FORBIDDEN_SECRET_KEYS = ["apikey", "api_key", "secret", "token", "password", "privatekey"];

export class CatConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatConfigError";
  }
}

export interface CatRegistry {
  cats: CatConfig[];
  get(id: string): CatConfig | undefined;
  list(): CatConfig[];
  defaultCatId(): string | null;
}

function assertNoSecrets(raw: Record<string, unknown>, pathLabel: string): void {
  for (const key of Object.keys(raw)) {
    const normalized = key.toLowerCase().replace(/[-_]/g, "");
    if (FORBIDDEN_SECRET_KEYS.some((s) => normalized.includes(s.replace(/_/g, "")))) {
      throw new CatConfigError(
        `Forbidden secret-like field "${key}" in ${pathLabel}. Keep credentials out of agent-config.`,
      );
    }
  }
}

function parseCat(raw: unknown, index: number): CatConfig {
  if (!raw || typeof raw !== "object") {
    throw new CatConfigError(`cats[${index}] must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  assertNoSecrets(obj, `cats[${index}]`);
  const id = obj.id;
  const displayName = obj.displayName;
  const role = obj.role;
  const provider = obj.provider;
  if (typeof id !== "string" || !id.trim()) {
    throw new CatConfigError(`cats[${index}].id must be a non-empty string`);
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    throw new CatConfigError(`cats[${index}].displayName must be a non-empty string`);
  }
  if (typeof role !== "string" || !role.trim()) {
    throw new CatConfigError(`cats[${index}].role must be a non-empty string`);
  }
  if (typeof provider !== "string" || !provider.trim()) {
    throw new CatConfigError(`cats[${index}].provider must be a non-empty string`);
  }
  const cat: CatConfig = {
    id: id.trim(),
    displayName: displayName.trim(),
    role: role.trim(),
    provider: provider.trim(),
  };
  if (typeof obj.systemSnippet === "string") cat.systemSnippet = obj.systemSnippet;
  if (typeof obj.defaultModel === "string") cat.defaultModel = obj.defaultModel;
  return cat;
}

/** Normalize file JSON: `{ cats: [...] }`, a bare array, or a legacy single cat object. */
export function parseCatConfigDocument(doc: unknown): CatConfig[] {
  if (Array.isArray(doc)) {
    return doc.map((item, i) => parseCat(item, i));
  }
  if (doc && typeof doc === "object") {
    const obj = doc as Record<string, unknown>;
    if (Array.isArray(obj.cats)) {
      return obj.cats.map((item, i) => parseCat(item, i));
    }
    // Legacy single-cat file
    if (typeof obj.id === "string") {
      return [parseCat(obj, 0)];
    }
  }
  throw new CatConfigError("agent-config must be { cats: [...] }, an array, or a single cat object");
}

export function createCatRegistry(cats: CatConfig[]): CatRegistry {
  if (cats.length === 0) {
    throw new CatConfigError("agent-config must define at least one cat");
  }
  const seen = new Set<string>();
  for (const cat of cats) {
    if (seen.has(cat.id)) throw new CatConfigError(`Duplicate cat id: ${cat.id}`);
    seen.add(cat.id);
  }
  const byId = new Map(cats.map((c) => [c.id, c]));
  return {
    cats: [...cats],
    get(id: string) {
      return byId.get(id);
    },
    list() {
      return [...cats];
    },
    defaultCatId() {
      return cats[0]?.id ?? null;
    },
  };
}

/**
 * Read-only load of agent-config from disk (Iron Law: Config Immutability).
 * Does not write the file. Missing file → built-in demo pair.
 */
export function loadCatRegistry(filePath?: string): CatRegistry {
  const path = resolve(filePath ?? process.env.MAC_AGENT_CONFIG ?? "agent-config.json");
  if (!existsSync(path)) {
    return createCatRegistry([
      {
        id: "architect",
        displayName: "Architect",
        role: "architecture",
        provider: "claude-code",
        systemSnippet: "You are the architecture lead. Prefer clear tradeoffs and small diffs.",
      },
      {
        id: "reviewer",
        displayName: "Reviewer",
        role: "review",
        provider: "claude-code",
        systemSnippet: "You are the review lead. Prefer defect-first feedback and concrete fixes.",
      },
    ]);
  }
  const text = readFileSync(path, "utf8");
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new CatConfigError(`Invalid JSON in ${path}`);
  }
  return createCatRegistry(parseCatConfigDocument(doc));
}
