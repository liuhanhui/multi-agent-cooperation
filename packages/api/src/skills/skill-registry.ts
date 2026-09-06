import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { SkillDetail, SkillSummary } from "@mac/shared";
import { estimateTokens, parseSkillMarkdown } from "./parse-skill-md.js";

export interface SkillManifestFile {
  tokenBudget?: number;
  skills?: string[];
}

export interface SkillRegistry {
  /** Token budget from manifest / env override. */
  tokenBudget: number;
  /** Root directory that was loaded. */
  rootDir: string;
  /** List summaries in manifest order. */
  list(): SkillSummary[];
  /** Full detail including body, or undefined. */
  get(id: string): SkillDetail | undefined;
}

/**
 * Load skills from a directory (manifest.json + each skill's SKILL.md).
 * @param rootDir - Absolute or relative skills root
 * @param opts.tokenBudgetOverride - Optional budget (env / AppOptions)
 * @returns Registry with list/get
 */
export function loadSkillRegistry(
  rootDir: string,
  opts: { tokenBudgetOverride?: number } = {},
): SkillRegistry {
  const root = resolve(rootDir);
  const byId = new Map<string, SkillDetail>();

  let manifest: SkillManifestFile = {};
  const manifestPath = join(root, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as SkillManifestFile;
    } catch {
      throw new Error(`Invalid skills manifest JSON: ${manifestPath}`);
    }
  }

  const orderedIds =
    Array.isArray(manifest.skills) && manifest.skills.length > 0
      ? manifest.skills.map((id) => id.trim()).filter(Boolean)
      : discoverSkillIds(root);

  for (const id of orderedIds) {
    const skillPath = join(root, id, "SKILL.md");
    if (!existsSync(skillPath)) {
      throw new Error(`Skill "${id}" listed in manifest but missing ${skillPath}`);
    }
    const detail = loadSkillFile(skillPath, id, root);
    byId.set(detail.id, detail);
  }

  const tokenBudget =
    opts.tokenBudgetOverride ??
    (typeof manifest.tokenBudget === "number" && manifest.tokenBudget > 0
      ? manifest.tokenBudget
      : 4000);

  return {
    tokenBudget,
    rootDir: root,
    list() {
      return orderedIds
        .map((id) => byId.get(id))
        .filter((s): s is SkillDetail => Boolean(s))
        .map(toSummary);
    },
    get(id: string) {
      return byId.get(id);
    },
  };
}

/**
 * Discover skill directory names that contain SKILL.md (sorted).
 * @param root - Skills root
 * @returns Directory basenames
 */
function discoverSkillIds(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(join(root, name, "SKILL.md")))
    .sort();
}

/**
 * Parse one SKILL.md into SkillDetail.
 * @param skillPath - Absolute path to SKILL.md
 * @param fallbackId - Directory name used when frontmatter name is empty
 * @param root - Skills root (for stable relative path label)
 * @returns SkillDetail
 */
function loadSkillFile(skillPath: string, fallbackId: string, root: string): SkillDetail {
  const raw = readFileSync(skillPath, "utf8");
  const parsed = parseSkillMarkdown(raw);
  const id = (parsed.name || fallbackId).trim();
  const body = parsed.body;
  const description = parsed.description.trim();
  const triggers = parsed.triggers.map((t) => t.trim()).filter(Boolean);
  const estimatedTokens = estimateTokens(`${description}\n${body}`);
  // Hub-facing path: skills/<id>/SKILL.md (stable even if cwd differs).
  const path = `${basename(root)}/${id}/SKILL.md`.replace(/\\/g, "/");
  return {
    id,
    name: id,
    description,
    triggers,
    estimatedTokens,
    path,
    body,
  };
}

/**
 * Drop body for list/match surfaces.
 * @param detail - Full skill
 * @returns Summary without body
 */
function toSummary(detail: SkillDetail): SkillSummary {
  const { body: _body, ...summary } = detail;
  return summary;
}

/**
 * Resolve default skills directory (repo `skills/` or MAC_SKILLS_DIR).
 * Walks cwd and monorepo parent (`../../skills` from packages/api).
 * @param cwd - Process cwd used when env unset
 * @returns Absolute path
 */
export function resolveSkillsRoot(cwd: string = process.cwd()): string {
  if (process.env.MAC_SKILLS_DIR) {
    return resolve(process.env.MAC_SKILLS_DIR);
  }
  const candidates = [join(cwd, "skills"), join(cwd, "..", "..", "skills")];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "manifest.json"))) {
      return resolve(candidate);
    }
  }
  return resolve(cwd, "skills");
}
