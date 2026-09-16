import { randomUUID } from "node:crypto";
import {
  isHardDeniedCapability,
  isHostCapability,
  isSensitiveCapability,
  type HostCapability,
  type PluginCallReceipt,
  type PluginCallStatus,
  type PluginCatalogEntry,
  type PluginRecord,
} from "@mac/shared";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";
import {
  loadPluginCatalog,
  loadPluginManifest,
  resolvePluginsRoot,
} from "./load-catalog.js";

export interface PluginHostOptions {
  pluginsRoot?: string;
  store?: MacStore;
  hub?: ThreadHub;
  /** Pre-seed catalog (tests). */
  catalog?: PluginCatalogEntry[];
}

/**
 * Plugin host: catalog → install/activate → grant gate → settled call receipts.
 * Stdio process supervision is reserved; hello-mac runs in-process for M23 Done.
 */
export class PluginHost {
  private readonly pluginsRoot: string;
  private readonly catalog: PluginCatalogEntry[];
  private readonly records = new Map<string, PluginRecord>();
  private readonly receipts: PluginCallReceipt[] = [];
  private readonly store?: MacStore;
  private readonly hub?: ThreadHub;

  constructor(opts: PluginHostOptions = {}) {
    this.pluginsRoot = resolvePluginsRoot(opts.pluginsRoot);
    this.catalog = opts.catalog ?? loadPluginCatalog(this.pluginsRoot);
    this.store = opts.store;
    this.hub = opts.hub;
    // Seed available shells from official catalog without installing.
    for (const entry of this.catalog) {
      try {
        const { manifest, sourcePath } = loadPluginManifest(
          this.pluginsRoot,
          entry.path,
        );
        if (manifest.id !== entry.id) {
          throw new Error(
            `catalog id ${entry.id} != manifest id ${manifest.id}`,
          );
        }
        this.records.set(entry.id, {
          id: entry.id,
          manifest,
          status: "available",
          grants: [],
          installedAt: null,
          activatedAt: null,
          sourcePath,
          official: entry.official,
        });
      } catch {
        // Catalog shell may point at a missing path; keep entry listable via catalog API.
      }
    }
  }

  /**
   * @returns Official catalog shell rows
   */
  listCatalog(): PluginCatalogEntry[] {
    return this.catalog.map((c) => ({ ...c }));
  }

  /**
   * @returns Installed/available plugin records
   */
  listPlugins(): PluginRecord[] {
    return [...this.records.values()].map(cloneRecord);
  }

  /**
   * @param id - Plugin id
   * @returns Record or undefined
   */
  getPlugin(id: string): PluginRecord | undefined {
    const hit = this.records.get(id);
    return hit ? cloneRecord(hit) : undefined;
  }

  /**
   * Install from catalog (or refresh manifest from disk).
   * @param id - Catalog plugin id
   * @returns Updated record
   */
  install(id: string): PluginRecord {
    const entry = this.catalog.find((c) => c.id === id);
    if (!entry) throw new Error(`Unknown catalog plugin: ${id}`);
    const { manifest, sourcePath } = loadPluginManifest(
      this.pluginsRoot,
      entry.path,
    );
    if (manifest.id !== id) {
      throw new Error(`manifest id mismatch for ${id}`);
    }
    const now = new Date().toISOString();
    const existing = this.records.get(id);
    const record: PluginRecord = {
      id,
      manifest,
      status: existing?.status === "active" ? "active" : "installed",
      grants: existing?.grants ?? [],
      installedAt: existing?.installedAt ?? now,
      activatedAt: existing?.status === "active" ? existing.activatedAt : null,
      sourcePath,
      official: entry.official,
    };
    this.records.set(id, record);
    return cloneRecord(record);
  }

  /**
   * Uninstall removes grants and returns to catalog-available shell.
   * @param id - Plugin id
   * @returns Record after uninstall
   */
  uninstall(id: string): PluginRecord {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Plugin not found: ${id}`);
    if (existing.status === "active") {
      throw new Error("deactivate before uninstall");
    }
    const record: PluginRecord = {
      ...existing,
      status: "available",
      grants: [],
      installedAt: null,
      activatedAt: null,
    };
    this.records.set(id, record);
    return cloneRecord(record);
  }

  /**
   * Activate an installed plugin (in-process mark; stdio spawn reserved).
   * @param id - Plugin id
   * @returns Active record
   */
  activate(id: string): PluginRecord {
    const record = this.require(id);
    if (record.status === "available") {
      throw new Error("install plugin before activate");
    }
    if (record.manifest.runtime === "stdio") {
      // M23: stdio supervision stub — refuse until a supervisor ships.
      throw new Error("stdio runtime not enabled in M23; use in-process example");
    }
    record.status = "active";
    record.activatedAt = new Date().toISOString();
    return cloneRecord(record);
  }

  /**
   * Deactivate without uninstalling (grants retained).
   * @param id - Plugin id
   * @returns Inactive record
   */
  deactivate(id: string): PluginRecord {
    const record = this.require(id);
    if (record.status !== "active") {
      throw new Error("plugin is not active");
    }
    record.status = "inactive";
    record.activatedAt = null;
    return cloneRecord(record);
  }

  /**
   * Grant a capability the plugin requested (operator action).
   * @param id - Plugin id
   * @param capability - Host capability
   * @returns Updated record
   */
  grant(id: string, capability: string): PluginRecord {
    if (!isHostCapability(capability)) {
      throw new Error(`Unknown capability: ${capability}`);
    }
    if (isHardDeniedCapability(capability)) {
      throw new Error(`capability ${capability} is permanently denied (Iron Laws)`);
    }
    const record = this.require(id);
    if (record.status === "available") {
      throw new Error("install plugin before granting");
    }
    if (!record.manifest.requestedCapabilities.includes(capability)) {
      throw new Error(`plugin did not request ${capability}`);
    }
    if (!record.grants.includes(capability)) {
      record.grants = [...record.grants, capability];
    }
    return cloneRecord(record);
  }

  /**
   * Revoke a previously granted capability.
   * @param id - Plugin id
   * @param capability - Host capability
   * @returns Updated record
   */
  revoke(id: string, capability: string): PluginRecord {
    if (!isHostCapability(capability)) {
      throw new Error(`Unknown capability: ${capability}`);
    }
    const record = this.require(id);
    record.grants = record.grants.filter((g) => g !== capability);
    return cloneRecord(record);
  }

  /**
   * Invoke a host capability on behalf of a plugin; settles a receipt.
   * @param pluginId - Plugin id
   * @param capability - Capability to exercise
   * @param args - Capability-specific args
   * @returns Settled receipt
   */
  async call(
    pluginId: string,
    capability: string,
    args: Record<string, unknown> = {},
  ): Promise<PluginCallReceipt> {
    const createdAt = new Date().toISOString();
    const fail = (
      status: PluginCallStatus,
      detail: string,
      cap: string,
    ): PluginCallReceipt => {
      const receipt: PluginCallReceipt = {
        id: randomUUID(),
        pluginId,
        capability: cap,
        status,
        detail,
        result: null,
        createdAt,
      };
      this.receipts.unshift(receipt);
      return { ...receipt };
    };

    if (!isHostCapability(capability)) {
      return fail("denied", "unknown capability", capability);
    }
    if (isHardDeniedCapability(capability)) {
      return fail("denied", "Iron Law blocks this capability", capability);
    }

    const record = this.records.get(pluginId);
    if (!record) return fail("error", "plugin not found", capability);
    if (record.status !== "active") {
      return fail("inactive", "plugin is not active", capability);
    }
    if (!record.manifest.requestedCapabilities.includes(capability)) {
      return fail("denied", "capability not in plugin manifest", capability);
    }
    if (isSensitiveCapability(capability) && !record.grants.includes(capability)) {
      return fail("denied", "missing grant for sensitive capability", capability);
    }

    try {
      const result = await this.execute(record, capability, args);
      const receipt: PluginCallReceipt = {
        id: randomUUID(),
        pluginId,
        capability,
        status: "ok",
        detail: "settled",
        result,
        createdAt,
      };
      this.receipts.unshift(receipt);
      return { ...receipt, result: result ? { ...result } : null };
    } catch (err) {
      return fail(
        "error",
        err instanceof Error ? err.message : String(err),
        capability,
      );
    }
  }

  /**
   * @param limit - Max receipts
   * @returns Newest receipts first
   */
  listReceipts(limit = 40): PluginCallReceipt[] {
    return this.receipts
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((r) => ({
        ...r,
        result: r.result ? { ...r.result } : null,
      }));
  }

  /**
   * Execute an allowed capability (in-process hello-mac handlers).
   * @param record - Active plugin
   * @param capability - Allowed capability
   * @param args - Args
   * @returns Result payload
   */
  private async execute(
    record: PluginRecord,
    capability: HostCapability,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (capability === "hub.notify") {
      const message =
        typeof args.message === "string" && args.message.trim()
          ? args.message.trim()
          : `${record.manifest.name} says hello`;
      return { notified: true, message, pluginId: record.id };
    }

    if (capability === "thread.read") {
      const threadId = String(args.threadId ?? "").trim();
      if (!threadId || !this.store) {
        throw new Error("thread.read requires store + threadId");
      }
      const thread = await this.store.getThread(threadId);
      if (!thread) throw new Error(`thread not found: ${threadId}`);
      return {
        threadId: thread.id,
        title: thread.title,
        defaultCatId: thread.defaultCatId,
      };
    }

    if (capability === "thread.post_message") {
      const threadId = String(args.threadId ?? "").trim();
      const content = String(args.content ?? "").trim();
      if (!threadId || !content) {
        throw new Error("thread.post_message requires threadId + content");
      }
      if (!this.store) throw new Error("store not configured for thread.post_message");
      const message = await this.store.appendMessage({
        threadId,
        role: "system",
        authorId: `plugin:${record.id}`,
        content,
        status: "completed",
      });
      this.hub?.publish(threadId, { type: "message.created", message });
      return { messageId: message.id, threadId, authorId: message.authorId };
    }

    if (capability === "memory.write") {
      // Placeholder: grant gate is the M23 Done point; full evidence write can reuse M16 later.
      return {
        accepted: true,
        note: "memory.write granted path (settlement stub)",
        cue: typeof args.cue === "string" ? args.cue : null,
      };
    }

    throw new Error(`no executor for ${capability}`);
  }

  /**
   * @param id - Plugin id
   * @returns Mutable record
   */
  private require(id: string): PluginRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`Plugin not found: ${id}`);
    return record;
  }
}

/**
 * @param record - Source
 * @returns Deep-enough clone for API responses
 */
function cloneRecord(record: PluginRecord): PluginRecord {
  return {
    ...record,
    manifest: {
      ...record.manifest,
      requestedCapabilities: [...record.manifest.requestedCapabilities],
      args: record.manifest.args ? [...record.manifest.args] : undefined,
    },
    grants: [...record.grants],
  };
}
