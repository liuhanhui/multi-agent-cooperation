import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  TokenUsage,
  UsageBucket,
  UsageRecord,
  UsageSummary,
  UsageTotals,
} from "@mac/shared";

export interface UsageStoreOptions {
  /** SQLite path; `:memory:` for tests. Default: data/usage.sqlite (or MAC_USAGE_DB). */
  dbPath?: string;
}

export interface RecordUsageInput {
  messageId: string;
  threadId: string;
  catId: string;
  usage: TokenUsage;
  /** ISO timestamp; defaults to now. */
  now?: string;
}

export interface UsageSummaryQuery {
  /** Window length in UTC days including today (1..90). Default 7. */
  days?: number;
  /** Scope every bucket to one thread. */
  threadId?: string;
  /** ISO "now" override for tests. */
  now?: string;
  /** Max `recent` rows (1..100). Default 20. */
  recentLimit?: number;
}

interface UsageRow {
  id: string;
  message_id: string;
  thread_id: string;
  cat_id: string;
  provider: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number | null;
  estimated: number;
  day_key: string;
  created_at: string;
}

interface TotalsRow {
  key: string | null;
  turns: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | null;
  estimated_turns: number | null;
}

/** Shared SELECT list for every aggregate query (NULL-safe on empty sets). */
const TOTALS_COLUMNS = `
  COUNT(*) AS turns,
  SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(cache_read_tokens) AS cache_read_tokens,
  SUM(cache_write_tokens) AS cache_write_tokens,
  SUM(COALESCE(cost_usd, 0)) AS cost_usd,
  SUM(estimated) AS estimated_turns`;

/**
 * Append-only M29 token ledger: one row per assistant message.
 * Exposes no update/delete path so historical accounting survives restarts (Iron Law 1).
 */
export class UsageStore {
  private readonly db: DatabaseSync;
  readonly dbPath: string;

  /**
   * Open (or create) the SQLite ledger.
   * @param options - Optional db path override
   */
  constructor(options: UsageStoreOptions = {}) {
    this.dbPath = options.dbPath ?? resolveUsageDbPath();
    if (this.dbPath !== ":memory:") {
      mkdirSync(dirname(this.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
        thread_id TEXT NOT NULL,
        cat_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cache_read_tokens INTEGER NOT NULL,
        cache_write_tokens INTEGER NOT NULL,
        cost_usd REAL,
        estimated INTEGER NOT NULL,
        day_key TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS token_usage_day ON token_usage(day_key);
      CREATE INDEX IF NOT EXISTS token_usage_thread ON token_usage(thread_id, day_key);
    `);
  }

  /**
   * Record usage for one assistant turn. First write wins: a second call for the
   * same message id returns the existing row unchanged (retries cannot double count).
   * @param input - Message/thread/cat identity plus normalized usage
   * @returns Stored (or pre-existing) record
   */
  record(input: RecordUsageInput): UsageRecord {
    const now = input.now ?? new Date().toISOString();
    const u = input.usage;
    this.db
      .prepare(
        `INSERT OR IGNORE INTO token_usage (
           id, message_id, thread_id, cat_id, provider, model,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
           cost_usd, estimated, day_key, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.messageId,
        input.threadId,
        input.catId,
        u.provider,
        u.model,
        u.inputTokens,
        u.outputTokens,
        u.cacheReadTokens,
        u.cacheWriteTokens,
        u.costUsd,
        u.estimated ? 1 : 0,
        now.slice(0, 10),
        now,
      );
    const row = this.db
      .prepare("SELECT * FROM token_usage WHERE message_id = ?")
      .get(input.messageId) as UsageRow | undefined;
    if (!row) throw new Error(`usage row missing after insert: ${input.messageId}`);
    return mapRecord(row);
  }

  /**
   * Look up usage for a batch of messages (read-side join for Hub bubbles).
   * @param messageIds - Assistant message ids
   * @returns Map messageId → usage (ids without a row are absent)
   */
  byMessageIds(messageIds: string[]): Map<string, TokenUsage> {
    const out = new Map<string, TokenUsage>();
    const unique = [...new Set(messageIds)];
    // Chunk to stay well under SQLite's bound-parameter limit.
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      if (chunk.length === 0) continue;
      const rows = this.db
        .prepare(
          `SELECT * FROM token_usage WHERE message_id IN (${chunk.map(() => "?").join(",")})`,
        )
        .all(...chunk) as unknown as UsageRow[];
      for (const row of rows) out.set(row.message_id, toTokenUsage(row));
    }
    return out;
  }

  /**
   * Aggregate the ledger over a UTC day window, optionally scoped to one thread.
   * @param query - days / threadId / now / recentLimit
   * @returns Totals plus per-cat, per-provider, zero-filled per-day buckets, and recent rows
   */
  summary(query: UsageSummaryQuery = {}): UsageSummary {
    const days = clampInt(query.days ?? 7, 1, 90);
    const recentLimit = clampInt(query.recentLimit ?? 20, 1, 100);
    const now = query.now ?? new Date().toISOString();
    const toDay = now.slice(0, 10);
    const dayKeys = dayRange(toDay, days);
    const fromDay = dayKeys[0] ?? toDay;
    const threadId = query.threadId ?? null;

    const where = threadId
      ? "WHERE day_key >= ? AND day_key <= ? AND thread_id = ?"
      : "WHERE day_key >= ? AND day_key <= ?";
    const params: string[] = threadId ? [fromDay, toDay, threadId] : [fromDay, toDay];

    const totalsRow = this.db
      .prepare(`SELECT NULL AS key, ${TOTALS_COLUMNS} FROM token_usage ${where}`)
      .get(...params) as unknown as TotalsRow;

    const grouped = (column: "cat_id" | "provider" | "day_key"): UsageBucket[] =>
      (
        this.db
          .prepare(
            `SELECT ${column} AS key, ${TOTALS_COLUMNS} FROM token_usage ${where}
             GROUP BY ${column} ORDER BY SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) DESC`,
          )
          .all(...params) as unknown as TotalsRow[]
      ).map((row) => ({ key: row.key ?? "", ...mapTotals(row) }));

    const byDayMap = new Map(grouped("day_key").map((bucket) => [bucket.key, bucket]));
    const recentRows = this.db
      .prepare(`SELECT * FROM token_usage ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, recentLimit) as unknown as UsageRow[];

    return {
      range: { fromDay, toDay, days },
      threadId,
      totals: mapTotals(totalsRow),
      byCat: grouped("cat_id"),
      byProvider: grouped("provider"),
      // Zero-fill so charts get one bar per day even when idle.
      byDay: dayKeys.map((key) => byDayMap.get(key) ?? { key, ...emptyTotals() }),
      recent: recentRows.map(mapRecord),
    };
  }

  /** Close the SQLite handle during shutdown/tests. */
  close(): void {
    this.db.close();
  }
}

/**
 * @returns Zeroed totals
 */
function emptyTotals(): UsageTotals {
  return {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    estimatedTurns: 0,
  };
}

/**
 * @param row - Aggregate SQL row (SUM is NULL on empty sets)
 * @returns Shared totals projection
 */
function mapTotals(row: TotalsRow): UsageTotals {
  const inputTokens = row.input_tokens ?? 0;
  const outputTokens = row.output_tokens ?? 0;
  const cacheReadTokens = row.cache_read_tokens ?? 0;
  const cacheWriteTokens = row.cache_write_tokens ?? 0;
  return {
    turns: row.turns,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    costUsd: row.cost_usd ?? 0,
    estimatedTurns: row.estimated_turns ?? 0,
  };
}

/**
 * @param row - Ledger row
 * @returns Usage fields only
 */
function toTokenUsage(row: UsageRow): TokenUsage {
  return {
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    totalTokens:
      row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens,
    costUsd: row.cost_usd,
    estimated: row.estimated === 1,
  };
}

/**
 * @param row - Ledger row
 * @returns Shared record projection
 */
function mapRecord(row: UsageRow): UsageRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    threadId: row.thread_id,
    catId: row.cat_id,
    dayKey: row.day_key,
    createdAt: row.created_at,
    ...toTokenUsage(row),
  };
}

/**
 * Clamp to an integer range; non-finite input falls back to the minimum.
 * @param value - Candidate
 * @param min - Inclusive lower bound
 * @param max - Inclusive upper bound
 * @returns Integer within [min, max]
 */
function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * List `days` consecutive UTC day keys ending at `toDay`.
 * @param toDay - Last day (YYYY-MM-DD)
 * @param days - Count
 * @returns Oldest → newest day keys
 */
function dayRange(toDay: string, days: number): string[] {
  const end = Date.parse(`${toDay}T00:00:00.000Z`);
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(new Date(end - offset * 86_400_000).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * Resolve `data/usage.sqlite` at the workspace root, or an explicit MAC_USAGE_DB path.
 * @returns Absolute path or `:memory:`
 */
export function resolveUsageDbPath(): string {
  const configured = process.env.MAC_USAGE_DB;
  if (configured) {
    if (configured === ":memory:") return configured;
    return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  }
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      return resolve(dir, "data", "usage.sqlite");
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd(), "data", "usage.sqlite");
}
