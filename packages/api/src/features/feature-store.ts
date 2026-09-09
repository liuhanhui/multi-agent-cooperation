import { randomUUID } from "node:crypto";
import type { BulletinBoard, Feature, FeatureStage } from "@mac/shared";
import {
  canAdvanceFeatureStage,
  FEATURE_STAGES,
} from "@mac/shared";

export interface CreateFeatureInput {
  title: string;
  summary?: string;
  stage?: FeatureStage;
  ballHolderId?: string | null;
  threadIds?: string[];
}

export interface UpdateFeatureInput {
  title?: string;
  summary?: string;
  ballHolderId?: string | null;
  /** Replace thread bindings (must stay unique). */
  threadIds?: string[];
}

/**
 * In-memory FeatureStore for Mission Hub (M15).
 * Portable SOP transitions are enforced in advanceStage.
 */
export class FeatureStore {
  private readonly byId = new Map<string, Feature>();

  /**
   * Create a feature in idea (default) and optionally bind threads / ball holder.
   * @param input - title required; optional summary/stage/threads/holder
   * @returns Created Feature
   */
  create(input: CreateFeatureInput): Feature {
    const title = input.title.trim();
    if (!title) throw new Error("title required");
    const stage = input.stage ?? "idea";
    if (!FEATURE_STAGES.includes(stage)) throw new Error(`Invalid stage: ${stage}`);
    const now = new Date().toISOString();
    const feature: Feature = {
      id: randomUUID(),
      title,
      summary: (input.summary ?? "").trim(),
      stage,
      ballHolderId: input.ballHolderId ?? null,
      threadIds: uniqueIds(input.threadIds ?? []),
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(feature.id, feature);
    return clone(feature);
  }

  /**
   * @param id - Feature id
   * @returns Feature or undefined
   */
  get(id: string): Feature | undefined {
    const f = this.byId.get(id);
    return f ? clone(f) : undefined;
  }

  /**
   * List all features (newest updated first).
   * @returns Feature array
   */
  list(): Feature[] {
    return [...this.byId.values()]
      .map(clone)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Patch mutable fields (not stage — use advanceStage).
   * @param id - Feature id
   * @param input - Partial fields
   * @returns Updated feature
   */
  update(id: string, input: UpdateFeatureInput): Feature {
    const feature = this.byId.get(id);
    if (!feature) throw new Error(`Feature not found: ${id}`);
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new Error("title required");
      feature.title = title;
    }
    if (input.summary !== undefined) feature.summary = input.summary.trim();
    if (input.ballHolderId !== undefined) feature.ballHolderId = input.ballHolderId;
    if (input.threadIds !== undefined) feature.threadIds = uniqueIds(input.threadIds);
    feature.updatedAt = new Date().toISOString();
    return clone(feature);
  }

  /**
   * Advance (or step back) along the light SOP transition table.
   * @param id - Feature id
   * @param to - Target stage
   * @returns Updated feature
   */
  advanceStage(id: string, to: FeatureStage): Feature {
    const feature = this.byId.get(id);
    if (!feature) throw new Error(`Feature not found: ${id}`);
    if (!FEATURE_STAGES.includes(to)) throw new Error(`Invalid stage: ${to}`);
    if (!canAdvanceFeatureStage(feature.stage, to)) {
      throw new Error(`SOP forbids ${feature.stage} → ${to}`);
    }
    feature.stage = to;
    feature.updatedAt = new Date().toISOString();
    return clone(feature);
  }

  /**
   * Bind a thread id to the feature (idempotent).
   * @param id - Feature id
   * @param threadId - Thread to attach
   * @returns Updated feature
   */
  bindThread(id: string, threadId: string): Feature {
    const feature = this.byId.get(id);
    if (!feature) throw new Error(`Feature not found: ${id}`);
    const tid = threadId.trim();
    if (!tid) throw new Error("threadId required");
    if (!feature.threadIds.includes(tid)) {
      feature.threadIds = [...feature.threadIds, tid];
      feature.updatedAt = new Date().toISOString();
    }
    return clone(feature);
  }

  /**
   * Project features onto a bulletin board (columns by SOP stage).
   * @returns BulletinBoard for Hub Mission view
   */
  bulletin(): BulletinBoard {
    const all = this.list();
    return {
      stages: [...FEATURE_STAGES],
      columns: FEATURE_STAGES.map((stage) => ({
        stage,
        features: all.filter((f) => f.stage === stage),
      })),
    };
  }
}

/**
 * @param ids - Raw id list
 * @returns Deduped non-empty ids preserving order
 */
function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * @param feature - Source
 * @returns Structured clone for callers
 */
function clone(feature: Feature): Feature {
  return {
    ...feature,
    threadIds: [...feature.threadIds],
  };
}
