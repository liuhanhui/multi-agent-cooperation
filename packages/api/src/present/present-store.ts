import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  PresentDelivery,
  PresentPolicy,
  PresentSkipReason,
  UpdatePresentPolicyInput,
} from "@mac/shared";

export interface PresentStoreOptions {
  dbPath?: string;
  catIds: string[];
}

export type PresentReservation =
  | { ok: true; delivery: PresentDelivery }
  | {
      ok: false;
      reason: Extract<
        PresentSkipReason,
        "disabled" | "already_present" | "budget_exhausted" | "cooldown"
      >;
    };

interface DeliveryRow {
  id: string;
  thread_id: string;
  cat_id: string;
  basis_message_id: string | null;
  content: string;
  day_key: string;
  status: PresentDelivery["status"];
  message_id: string | null;
  error: string | null;
  created_at: string;
  settled_at: string | null;
}

/**
 * Durable policy, reservation, and delivery ledger for M27 proactive presents.
 * The API has no delete/reset operation; failed attempts remain auditable.
 */
export class PresentStore {
  private readonly db: DatabaseSync;
  private readonly catIds: string[];
  readonly dbPath: string;

  /**
   * Open the SQLite ledger and initialize opt-in defaults.
   * @param options - Database path plus known cat ids
   */
  constructor(options: PresentStoreOptions) {
    this.dbPath = options.dbPath ?? resolvePresentDbPath();
    this.catIds = [...new Set(options.catIds.map((id) => id.trim()).filter(Boolean))];
    if (this.dbPath !== ":memory:") {
      mkdirSync(dirname(this.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS present_policy (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        policy_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS present_deliveries (
        id TEXT PRIMARY KEY NOT NULL,
        thread_id TEXT NOT NULL,
        cat_id TEXT NOT NULL,
        basis_message_id TEXT,
        content TEXT NOT NULL,
        day_key TEXT NOT NULL,
        status TEXT NOT NULL,
        message_id TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        settled_at TEXT
      );
      CREATE INDEX IF NOT EXISTS present_delivery_budget
        ON present_deliveries(cat_id, day_key, status);
    `);
    const columns = this.db
      .prepare("PRAGMA table_info(present_deliveries)")
      .all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "basis_message_id")) {
      // Non-destructive migration for the projection-only M27 development draft.
      this.db.exec(
        "ALTER TABLE present_deliveries ADD COLUMN basis_message_id TEXT",
      );
    }
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS present_delivery_basis
        ON present_deliveries(basis_message_id)
        WHERE basis_message_id IS NOT NULL
    `);
  }

  /**
   * Read policy and merge newly configured cats without enabling the global loop.
   * @returns Detached current policy
   */
  getPolicy(): PresentPolicy {
    const row = this.db
      .prepare("SELECT policy_json FROM present_policy WHERE id = 1")
      .get() as { policy_json: string } | undefined;
    const stored = row
      ? (JSON.parse(row.policy_json) as PresentPolicy)
      : this.defaultPolicy();
    const configured = new Map(
      stored.cats.map((setting) => [setting.catId, setting.enabled]),
    );
    return {
      ...stored,
      cats: this.catIds.map((catId) => ({
        catId,
        enabled: configured.get(catId) ?? true,
      })),
    };
  }

  /**
   * Validate and persist the complete policy projection.
   * @param patch - Operator-controlled partial policy
   * @param now - ISO update timestamp
   * @returns Updated policy
   */
  updatePolicy(
    patch: UpdatePresentPolicyInput,
    now = new Date().toISOString(),
  ): PresentPolicy {
    const current = this.getPolicy();
    const dailyBudgetPerCat = integerInRange(
      patch.dailyBudgetPerCat ?? current.dailyBudgetPerCat,
      0,
      10,
      "dailyBudgetPerCat",
    );
    const cooldownMinutes = integerInRange(
      patch.cooldownMinutes ?? current.cooldownMinutes,
      1,
      1_440,
      "cooldownMinutes",
    );
    const idleMinutes = integerInRange(
      patch.idleMinutes ?? current.idleMinutes,
      1,
      10_080,
      "idleMinutes",
    );
    const catMap = new Map(current.cats.map((item) => [item.catId, item.enabled]));
    if (patch.cats) {
      const seen = new Set<string>();
      for (const setting of patch.cats) {
        if (!this.catIds.includes(setting.catId)) {
          throw new Error(`Unknown cat id: ${setting.catId}`);
        }
        if (seen.has(setting.catId)) {
          throw new Error(`Duplicate cat id: ${setting.catId}`);
        }
        seen.add(setting.catId);
        catMap.set(setting.catId, Boolean(setting.enabled));
      }
    }
    const policy: PresentPolicy = {
      enabled: patch.enabled ?? current.enabled,
      dailyBudgetPerCat,
      cooldownMinutes,
      idleMinutes,
      cats: this.catIds.map((catId) => ({
        catId,
        enabled: catMap.get(catId) ?? true,
      })),
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO present_policy (id, policy_json, updated_at)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           policy_json = excluded.policy_json,
           updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(policy), now);
    return clonePolicy(policy);
  }

  /**
   * Atomically reserve one budget slot before writing a proactive message.
   * @param input - Thread, basis message, cat, content, and timestamp
   * @returns Reservation or bounded skip reason
   */
  reserve(input: {
    threadId: string;
    catId: string;
    basisMessageId: string;
    content: string;
    now: string;
  }): PresentReservation {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Policy is re-read under the write lock so a completed disable PATCH wins.
      const policy = this.getPolicy();
      if (!policy.enabled) {
        this.db.exec("ROLLBACK");
        return { ok: false, reason: "disabled" };
      }
      const existingBasis = this.db
        .prepare(
          "SELECT id FROM present_deliveries WHERE basis_message_id = ? LIMIT 1",
        )
        .get(input.basisMessageId);
      if (existingBasis) {
        this.db.exec("ROLLBACK");
        return { ok: false, reason: "already_present" };
      }
      const dayKey = input.now.slice(0, 10);
      const usageRow = this.db
        .prepare(
          `SELECT COUNT(*) AS count FROM present_deliveries
           WHERE cat_id = ? AND day_key = ? AND status <> 'failed'`,
        )
        .get(input.catId, dayKey) as { count: number };
      if (usageRow.count >= policy.dailyBudgetPerCat) {
        this.db.exec("ROLLBACK");
        return { ok: false, reason: "budget_exhausted" };
      }

      const latest = this.db
        .prepare(
          `SELECT created_at FROM present_deliveries
           WHERE cat_id = ? AND status <> 'failed'
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(input.catId) as { created_at: string } | undefined;
      if (
        latest &&
        Date.parse(input.now) - Date.parse(latest.created_at) <
          policy.cooldownMinutes * 60_000
      ) {
        this.db.exec("ROLLBACK");
        return { ok: false, reason: "cooldown" };
      }

      const delivery: PresentDelivery = {
        id: randomUUID(),
        threadId: input.threadId,
        catId: input.catId,
        basisMessageId: input.basisMessageId,
        content: input.content,
        dayKey,
        status: "reserved",
        messageId: null,
        error: null,
        createdAt: input.now,
        settledAt: null,
      };
      this.db
        .prepare(
          `INSERT INTO present_deliveries (
             id, thread_id, cat_id, basis_message_id, content, day_key, status,
             message_id, error, created_at, settled_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL)`,
        )
        .run(
          delivery.id,
          delivery.threadId,
          delivery.catId,
          delivery.basisMessageId,
          delivery.content,
          delivery.dayKey,
          delivery.status,
          delivery.createdAt,
        );
      this.db.exec("COMMIT");
      return { ok: true, delivery };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Settle a reserved attempt exactly once.
   * @param id - Delivery reservation id
   * @param result - Delivered message id or failure detail
   * @param now - ISO settlement timestamp
   * @returns Settled delivery
   */
  settle(
    id: string,
    result:
      | { status: "delivered"; messageId: string }
      | { status: "failed"; error: string },
    now = new Date().toISOString(),
  ): PresentDelivery {
    const current = this.get(id);
    if (!current) throw new Error(`Present delivery not found: ${id}`);
    if (current.status !== "reserved") {
      throw new Error(`cannot settle present delivery in status ${current.status}`);
    }
    this.db
      .prepare(
        `UPDATE present_deliveries
         SET status = ?, message_id = ?, error = ?, settled_at = ?
         WHERE id = ? AND status = 'reserved'`,
      )
      .run(
        result.status,
        result.status === "delivered" ? result.messageId : null,
        result.status === "failed" ? result.error : null,
        now,
        id,
      );
    const settled = this.get(id);
    if (!settled) throw new Error(`Present delivery not found after settle: ${id}`);
    return settled;
  }

  /**
   * @param id - Delivery id
   * @returns Delivery or undefined
   */
  get(id: string): PresentDelivery | undefined {
    const row = this.db
      .prepare("SELECT * FROM present_deliveries WHERE id = ?")
      .get(id) as DeliveryRow | undefined;
    return row ? mapDelivery(row) : undefined;
  }

  /**
   * List newest proactive attempts.
   * @param limit - Maximum rows
   * @returns Detached delivery rows
   */
  list(limit = 40): PresentDelivery[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM present_deliveries ORDER BY created_at DESC LIMIT ?",
      )
      .all(Math.max(1, Math.min(limit, 100))) as unknown as DeliveryRow[];
    return rows.map(mapDelivery);
  }

  /**
   * Count reserved/delivered budget slots per cat for one UTC day.
   * @param dayKey - YYYY-MM-DD
   * @returns Usage keyed by every configured cat id
   */
  usage(dayKey: string): Record<string, number> {
    const usage = Object.fromEntries(this.catIds.map((id) => [id, 0]));
    const rows = this.db
      .prepare(
        `SELECT cat_id, COUNT(*) AS count FROM present_deliveries
         WHERE day_key = ? AND status <> 'failed' GROUP BY cat_id`,
      )
      .all(dayKey) as unknown as Array<{ cat_id: string; count: number }>;
    for (const row of rows) usage[row.cat_id] = row.count;
    return usage;
  }

  /** Close the SQLite handle during shutdown/tests. */
  close(): void {
    this.db.close();
  }

  /**
   * @returns Conservative opt-in policy with per-cat switches enabled
   */
  private defaultPolicy(): PresentPolicy {
    return {
      enabled: false,
      dailyBudgetPerCat: 2,
      cooldownMinutes: 120,
      idleMinutes: 30,
      cats: this.catIds.map((catId) => ({ catId, enabled: true })),
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Validate an integer policy bound.
 * @param value - Candidate number
 * @param min - Inclusive minimum
 * @param max - Inclusive maximum
 * @param field - Error label
 * @returns Valid integer
 */
function integerInRange(
  value: number,
  min: number,
  max: number,
  field: string,
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer ${min}..${max}`);
  }
  return value;
}

/**
 * @param row - SQLite delivery row
 * @returns Shared delivery projection
 */
function mapDelivery(row: DeliveryRow): PresentDelivery {
  return {
    id: row.id,
    threadId: row.thread_id,
    catId: row.cat_id,
    basisMessageId: row.basis_message_id ?? `legacy:${row.id}`,
    content: row.content,
    dayKey: row.day_key,
    status: row.status,
    messageId: row.message_id,
    error: row.error,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  };
}

/**
 * @param policy - Internal policy projection
 * @returns Detached policy
 */
function clonePolicy(policy: PresentPolicy): PresentPolicy {
  return {
    ...policy,
    cats: policy.cats.map((setting) => ({ ...setting })),
  };
}

/**
 * Resolve `data/presents.sqlite` or an explicit MAC_PRESENT_DB path.
 * @returns Absolute path or `:memory:`
 */
export function resolvePresentDbPath(): string {
  const configured = process.env.MAC_PRESENT_DB;
  if (configured) {
    if (configured === ":memory:") return configured;
    return isAbsolute(configured)
      ? configured
      : resolve(process.cwd(), configured);
  }
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (
      existsSync(resolve(dir, "packages")) ||
      existsSync(resolve(dir, "pnpm-workspace.yaml"))
    ) {
      return resolve(dir, "data", "presents.sqlite");
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd(), "data", "presents.sqlite");
}
