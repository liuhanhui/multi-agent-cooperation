import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Evidence, EvidenceProvenance } from "@mac/shared";

export interface CreateEvidenceInput {
  title: string;
  body: string;
  tags?: string[];
  provenance: EvidenceProvenance;
}

export interface EvidenceStoreOptions {
  /**
   * SQLite path, or `:memory:` for tests.
   * Default: `data/evidence.sqlite` under resolved data root.
   */
  dbPath?: string;
}

/**
 * SQLite evidence library with FTS5 BM25 search (M16).
 * Never truncates/deletes the DB file from tooling — only row CRUD via API.
 */
export class EvidenceStore {
  private readonly db: DatabaseSync;
  readonly dbPath: string;

  /**
   * Open or create the evidence database and ensure schema.
   * @param opts.dbPath - File path or `:memory:`
   */
  constructor(opts: EvidenceStoreOptions = {}) {
    this.dbPath = opts.dbPath ?? resolveEvidenceDbPath();
    if (this.dbPath !== ":memory:") {
      mkdirSync(dirname(this.dbPath), { recursive: true });
    }
    // Iron Laws: durable evidence path — open for read/write, never unlink here.
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(
        title,
        body,
        tags,
        content='evidence',
        content_rowid='rowid'
      );
    `);
  }

  /**
   * Persist a new evidence row (provenance required).
   * @param input - title/body + mandatory provenance
   * @returns Created Evidence
   */
  create(input: CreateEvidenceInput): Evidence {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title) throw new Error("title required");
    if (!body) throw new Error("body required");
    const provenance = normalizeProvenance(input.provenance);
    const tags = uniqueTags(input.tags ?? []);
    const now = new Date().toISOString();
    const id = randomUUID();
    const tagsJson = JSON.stringify(tags);
    const provenanceJson = JSON.stringify(provenance);

    this.db
      .prepare(
        `INSERT INTO evidence (id, title, body, tags_json, provenance_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, title, body, tagsJson, provenanceJson, now, now);

    const row = this.db
      .prepare(`SELECT rowid AS rid FROM evidence WHERE id = ?`)
      .get(id) as { rid: number };
    this.db
      .prepare(`INSERT INTO evidence_fts(rowid, title, body, tags) VALUES (?, ?, ?, ?)`)
      .run(row.rid, title, body, tags.join(" "));

    return this.get(id)!;
  }

  /**
   * @param id - Evidence id
   * @returns Evidence or undefined
   */
  get(id: string): Evidence | undefined {
    const row = this.db
      .prepare(
        `SELECT id, title, body, tags_json, provenance_json, created_at, updated_at
         FROM evidence WHERE id = ?`,
      )
      .get(id) as EvidenceRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  /**
   * List newest-first (Hub browse).
   * @param limit - Max rows (default 50)
   * @returns Evidence array
   */
  list(limit = 50): Evidence[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, body, tags_json, provenance_json, created_at, updated_at
         FROM evidence ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(Math.max(1, Math.min(limit, 200))) as unknown as EvidenceRow[];
    return rows.map(mapRow);
  }

  /**
   * BM25 search via FTS5. Empty query or no matches → [].
   * @param query - Free text (tokenized to FTS OR query)
   * @param limit - Max hits
   * @returns Hits with scores (best first)
   */
  search(query: string, limit = 8): Array<{ evidence: Evidence; score: number }> {
    const fts = buildFtsQuery(query);
    if (!fts) return [];
    const rows = this.db
      .prepare(
        `SELECT e.id, e.title, e.body, e.tags_json, e.provenance_json, e.created_at, e.updated_at,
                bm25(evidence_fts) AS score
         FROM evidence_fts
         JOIN evidence e ON e.rowid = evidence_fts.rowid
         WHERE evidence_fts MATCH ?
         ORDER BY score
         LIMIT ?`,
      )
      .all(fts, Math.max(1, Math.min(limit, 50))) as unknown as Array<
      EvidenceRow & { score: number }
    >;
    return rows.map((row) => ({
      evidence: mapRow(row),
      score: Number(row.score),
    }));
  }

  /**
   * Close the SQLite handle (tests / shutdown).
   */
  close(): void {
    this.db.close();
  }
}

interface EvidenceRow {
  id: string;
  title: string;
  body: string;
  tags_json: string;
  provenance_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Map a DB row to the shared Evidence type.
 * @param row - SQLite row
 * @returns Evidence
 */
function mapRow(row: EvidenceRow): Evidence {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags_json) as unknown;
    if (Array.isArray(parsed)) {
      tags = parsed.filter((t): t is string => typeof t === "string");
    }
  } catch {
    tags = [];
  }
  let provenance: EvidenceProvenance;
  try {
    provenance = normalizeProvenance(JSON.parse(row.provenance_json) as EvidenceProvenance);
  } catch {
    throw new Error(`Corrupt provenance for evidence ${row.id}`);
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tags,
    provenance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Require provenance.source; fill recordedAt when omitted.
 * @param raw - Caller provenance
 * @returns Normalized provenance
 */
function normalizeProvenance(raw: EvidenceProvenance): EvidenceProvenance {
  const source = raw?.source?.trim() ?? "";
  if (!source) throw new Error("provenance.source required");
  const recordedAt = raw.recordedAt?.trim() || new Date().toISOString();
  const out: EvidenceProvenance = { source, recordedAt };
  if (raw.actorId?.trim()) out.actorId = raw.actorId.trim();
  if (raw.threadId?.trim()) out.threadId = raw.threadId.trim();
  if (raw.messageId?.trim()) out.messageId = raw.messageId.trim();
  return out;
}

/**
 * @param tags - Raw tags
 * @returns Deduped non-empty tags
 */
function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Tokenize free text into a safe FTS5 OR query.
 * @param query - User/routed prompt
 * @returns FTS query or null when no usable tokens
 */
export function buildFtsQuery(query: string): string | null {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    // Skip ultra-common English cue words that drown BM25.
    if (STOPWORDS.has(token)) continue;
    seen.add(token);
    unique.push(token);
    if (unique.length >= 12) break;
  }
  if (unique.length === 0) return null;
  return unique.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "why",
  "what",
  "when",
  "where",
  "how",
  "did",
  "does",
  "was",
  "were",
  "last",
  "time",
  "we",
  "you",
  "our",
  "上次",
  "为什么",
  "为何",
  "怎么",
  "什么",
]);

/**
 * Resolve default evidence DB path (repo `data/evidence.sqlite` or MAC_EVIDENCE_DB).
 * @returns Absolute path or `:memory:`
 */
export function resolveEvidenceDbPath(): string {
  if (process.env.MAC_EVIDENCE_DB) {
    const p = process.env.MAC_EVIDENCE_DB;
    if (p === ":memory:") return p;
    return isAbsolute(p) ? p : resolve(process.cwd(), p);
  }
  // Walk up for monorepo root `data/` when started from packages/api.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, "data");
    const parentPkg = resolve(dir, "packages");
    // Prefer a directory that looks like the monorepo root.
    if (existsSync(parentPkg) || existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      return resolve(candidate, "evidence.sqlite");
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd(), "data", "evidence.sqlite");
}
