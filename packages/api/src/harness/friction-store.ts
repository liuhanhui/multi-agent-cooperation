import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  assertFrictionLifecycle,
  type CaptureFrictionInput,
  type EvaluateFrictionInput,
  type FrictionCategory,
  type FrictionRecord,
  type FrictionSeverity,
  type FrictionSource,
  type FrictionStatus,
  type FrictionVerdictOutcome,
  type OwnerResponseDisposition,
  type RespondFrictionInput,
} from "@mac/shared";

const SOURCES = new Set<FrictionSource>(["operator", "agent", "system"]);
const CATEGORIES = new Set<FrictionCategory>([
  "tooling",
  "routing",
  "memory",
  "workflow",
  "ux",
  "other",
]);
const SEVERITIES = new Set<FrictionSeverity>(["low", "medium", "high"]);
const OUTCOMES = new Set<FrictionVerdictOutcome>([
  "confirmed",
  "not_reproducible",
  "duplicate",
  "wont_fix",
]);
const DISPOSITIONS = new Set<OwnerResponseDisposition>([
  "planned",
  "fixed",
  "declined",
  "escalated",
]);

export interface FrictionStoreOptions {
  /** SQLite path, or `:memory:` for isolated tests. */
  dbPath?: string;
}

/**
 * Lifecycle port consumed by HTTP composition and replaceable in tests.
 */
export interface FrictionStorePort {
  capture(input: CaptureFrictionInput): FrictionRecord;
  evaluate(id: string, input: EvaluateFrictionInput): FrictionRecord;
  respond(id: string, input: RespondFrictionInput): FrictionRecord;
  get(id: string): FrictionRecord | undefined;
  list(status?: FrictionStatus, limit?: number): FrictionRecord[];
}

/**
 * Durable M25 lifecycle owner for friction records.
 * No update/delete bypass exists: capture → evaluate → owner response only.
 */
export class FrictionStore implements FrictionStorePort {
  private readonly byId = new Map<string, FrictionRecord>();
  private readonly db: DatabaseSync;
  readonly dbPath: string;

  /**
   * Open the SQLite ledger and hydrate current projections.
   * @param options.dbPath - Durable path or `:memory:`
   */
  constructor(options: FrictionStoreOptions = {}) {
    this.dbPath = options.dbPath ?? resolveFrictionDbPath();
    if (this.dbPath !== ":memory:") {
      mkdirSync(dirname(this.dbPath), { recursive: true });
    }
    // Iron Law: this store creates/updates rows but never deletes or truncates them.
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS friction_records (
        id TEXT PRIMARY KEY NOT NULL,
        record_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS friction_events (
        id TEXT PRIMARY KEY NOT NULL,
        friction_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(friction_id, seq)
      );
    `);
    this.load();
  }

  /**
   * Capture one concrete friction signal.
   * @param input - Source, category, severity, report, and optional thread
   * @returns Newly captured record
   */
  capture(input: CaptureFrictionInput): FrictionRecord {
    if (!SOURCES.has(input.source)) throw new Error("unknown friction source");
    if (!CATEGORIES.has(input.category)) throw new Error("unknown friction category");
    if (!SEVERITIES.has(input.severity)) throw new Error("unknown friction severity");
    const summary = input.summary.trim();
    const detail = input.detail.trim();
    const reporterId = input.reporterId.trim();
    if (!summary) throw new Error("summary required");
    if (!detail) throw new Error("detail required");
    if (!reporterId) throw new Error("reporterId required");

    const now = new Date().toISOString();
    const id = randomUUID();
    const record: FrictionRecord = {
      id,
      source: input.source,
      category: input.category,
      severity: input.severity,
      summary,
      detail,
      reporterId,
      threadId: input.threadId?.trim() || null,
      status: "captured",
      verdict: null,
      ownerResponse: null,
      events: [
        {
          id: randomUUID(),
          type: "friction.captured",
          actorId: reporterId,
          at: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    assertFrictionLifecycle(record);
    this.persist(record, record.events[0]);
    this.byId.set(id, record);
    return clone(record);
  }

  /**
   * Evaluate a captured friction and assign the accountable owner.
   * @param id - Friction id
   * @param input - Outcome, rationale, evaluator, and owner
   * @returns Evaluated record
   */
  evaluate(id: string, input: EvaluateFrictionInput): FrictionRecord {
    const current = this.require(id);
    if (current.status !== "captured") {
      throw new Error(`cannot evaluate friction in status ${current.status}`);
    }
    if (!OUTCOMES.has(input.outcome)) throw new Error("unknown verdict outcome");
    const rationale = input.rationale.trim();
    const evaluatorId = input.evaluatorId.trim();
    const ownerId = input.ownerId.trim();
    if (!rationale) throw new Error("rationale required");
    if (!evaluatorId) throw new Error("evaluatorId required");
    if (!ownerId) throw new Error("ownerId required");

    const record = clone(current);
    const now = new Date().toISOString();
    record.status = "evaluated";
    record.verdict = {
      outcome: input.outcome,
      rationale,
      evaluatorId,
      ownerId,
      evaluatedAt: now,
    };
    record.events.push({
      id: randomUUID(),
      type: "friction.evaluated",
      actorId: evaluatorId,
      at: now,
      outcome: input.outcome,
      ownerId,
    });
    record.updatedAt = now;
    assertFrictionLifecycle(record);
    this.persist(record, record.events.at(-1));
    this.byId.set(id, record);
    return clone(record);
  }

  /**
   * Record the assigned owner's terminal response.
   * @param id - Evaluated friction id
   * @param input - Owner disposition, note, and responder id
   * @returns Responded record
   */
  respond(id: string, input: RespondFrictionInput): FrictionRecord {
    const current = this.require(id);
    if (current.status !== "evaluated" || !current.verdict) {
      throw new Error(`cannot respond to friction in status ${current.status}`);
    }
    if (!DISPOSITIONS.has(input.disposition)) {
      throw new Error("unknown owner response disposition");
    }
    const responderId = input.responderId.trim();
    const note = input.note.trim();
    if (!responderId) throw new Error("responderId required");
    if (!note) throw new Error("response note required");
    if (responderId !== current.verdict.ownerId) {
      throw new Error(
        `response must come from assigned owner ${current.verdict.ownerId}`,
      );
    }

    const record = clone(current);
    const now = new Date().toISOString();
    record.status = "responded";
    record.ownerResponse = {
      disposition: input.disposition,
      note,
      responderId,
      respondedAt: now,
    };
    record.events.push({
      id: randomUUID(),
      type: "friction.responded",
      actorId: responderId,
      at: now,
      disposition: input.disposition,
    });
    record.updatedAt = now;
    assertFrictionLifecycle(record);
    this.persist(record, record.events.at(-1));
    this.byId.set(id, record);
    return clone(record);
  }

  /**
   * @param id - Friction id
   * @returns Record or undefined
   */
  get(id: string): FrictionRecord | undefined {
    const record = this.byId.get(id);
    return record ? clone(record) : undefined;
  }

  /**
   * List newest activity first with an optional lifecycle filter.
   * @param status - captured, evaluated, responded, or omitted
   * @param limit - Maximum rows
   * @returns Friction records
   */
  list(status?: FrictionStatus, limit = 60): FrictionRecord[] {
    return [...this.byId.values()]
      .filter((record) => (status ? record.status === status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map(clone);
  }

  /**
   * @param id - Required friction id
   * @returns Mutable internal record
   */
  private require(id: string): FrictionRecord {
    const record = this.byId.get(id);
    if (!record) throw new Error(`Friction not found: ${id}`);
    return record;
  }

  /**
   * Close the SQLite handle during tests or process shutdown.
   * @returns Nothing
   */
  close(): void {
    this.db.close();
  }

  /**
   * Hydrate the latest projections; embedded events remain the audit trail.
   * @returns Nothing
   */
  private load(): void {
    const rows = this.db
      .prepare("SELECT record_json FROM friction_records")
      .all() as Array<{ record_json: string }>;
    for (const row of rows) {
      const record = JSON.parse(row.record_json) as FrictionRecord;
      const persistedEvents = this.loadEvents(record.id);
      if (persistedEvents.length === 0 && record.events.length > 0) {
        // Backfill databases created by the initial M25 projection-only draft.
        this.backfillEvents(record);
      } else {
        record.events = persistedEvents;
      }
      assertFrictionLifecycle(record);
      this.byId.set(record.id, record);
    }
  }

  /**
   * Atomically append one event and update the current searchable projection.
   * @param record - Valid lifecycle record
   * @param event - Newly appended terminal event
   * @returns Nothing
   */
  private persist(
    record: FrictionRecord,
    event: FrictionRecord["events"][number] | undefined,
  ): void {
    if (!event) throw new Error("lifecycle transition requires an event");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO friction_records (id, record_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             record_json = excluded.record_json,
             updated_at = excluded.updated_at`,
        )
        .run(record.id, JSON.stringify(record), record.updatedAt);
      this.db
        .prepare(
          `INSERT INTO friction_events
             (id, friction_id, seq, event_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          event.id,
          record.id,
          record.events.length,
          JSON.stringify(event),
          event.at,
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Read ordered immutable events for one friction record.
   * @param frictionId - Parent friction id
   * @returns Events ordered by their monotonic sequence
   */
  private loadEvents(frictionId: string): FrictionRecord["events"] {
    const rows = this.db
      .prepare(
        `SELECT event_json FROM friction_events
         WHERE friction_id = ? ORDER BY seq ASC`,
      )
      .all(frictionId) as Array<{ event_json: string }>;
    return rows.map(
      (row) =>
        JSON.parse(row.event_json) as FrictionRecord["events"][number],
    );
  }

  /**
   * Migrate embedded legacy events into the append-only event table.
   * @param record - Projection containing the original ordered event array
   * @returns Nothing
   */
  private backfillEvents(record: FrictionRecord): void {
    const statement = this.db.prepare(
      `INSERT OR IGNORE INTO friction_events
         (id, friction_id, seq, event_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      record.events.forEach((event, index) => {
        statement.run(
          event.id,
          record.id,
          index + 1,
          JSON.stringify(event),
          event.at,
        );
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

/**
 * Clone all nested lifecycle fields so API consumers cannot mutate the store.
 * @param record - Internal source
 * @returns Detached record
 */
function clone(record: FrictionRecord): FrictionRecord {
  return {
    ...record,
    verdict: record.verdict ? { ...record.verdict } : null,
    ownerResponse: record.ownerResponse ? { ...record.ownerResponse } : null,
    events: record.events.map((event) => ({ ...event })),
  };
}

/**
 * Resolve the durable M25 SQLite path from env or the monorepo data directory.
 * @returns Absolute path or `:memory:`
 */
export function resolveFrictionDbPath(): string {
  const configured = process.env.MAC_FRICTION_DB;
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
      return resolve(dir, "data", "frictions.sqlite");
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd(), "data", "frictions.sqlite");
}
