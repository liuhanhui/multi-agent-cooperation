/**
 * Plugin host contracts (M23).
 * Manifest + grants gate sensitive host capabilities; settlement is in-memory for v1.
 */

/** Host capabilities a plugin may request; sensitive ones require an explicit grant. */
export const HOST_CAPABILITIES = [
  "hub.notify",
  "thread.read",
  "thread.post_message",
  "memory.write",
  /** Always denied by host (Iron Law: Config Immutability). */
  "config.write",
  /** Always denied by host (Iron Law: Data Storage Sanctuary). */
  "store.flush",
] as const;

export type HostCapability = (typeof HOST_CAPABILITIES)[number];

/** Capabilities that remain forbidden even if listed in a grant. */
export const HARD_DENIED_CAPABILITIES: readonly HostCapability[] = [
  "config.write",
  "store.flush",
];

/** Capabilities that need an operator grant before call(). */
export const SENSITIVE_CAPABILITIES: readonly HostCapability[] = [
  "thread.post_message",
  "memory.write",
  "config.write",
  "store.flush",
];

/** Declared entry runtime for a plugin (stdio child is reserved; in-process ships first). */
export type PluginRuntimeKind = "in-process" | "stdio";

/** Official / local plugin catalog entry (shell until installed). */
export interface PluginCatalogEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  /** Relative path under plugins/ or absolute path for tests. */
  path: string;
  official: boolean;
}

/** plugin.json on disk. */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  runtime: PluginRuntimeKind;
  /** Capabilities this plugin may ask for (still need grants for sensitive ones). */
  requestedCapabilities: HostCapability[];
  /** Optional stdio command (M23 simplified: unused for in-process hello). */
  command?: string;
  args?: string[];
}

export type PluginLifecycleStatus =
  | "available"
  | "installed"
  | "active"
  | "inactive";

/** Runtime record after install from catalog. */
export interface PluginRecord {
  id: string;
  manifest: PluginManifest;
  status: PluginLifecycleStatus;
  /** Operator-granted capabilities (subset of requested). */
  grants: HostCapability[];
  installedAt: string | null;
  activatedAt: string | null;
  sourcePath: string;
  official: boolean;
}

/** Durable-ish call settlement receipt (in-memory for M23). */
export type PluginCallStatus = "ok" | "denied" | "error" | "inactive";

export interface PluginCallReceipt {
  id: string;
  pluginId: string;
  capability: string;
  status: PluginCallStatus;
  detail: string;
  result: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * @param capability - Candidate
 * @returns true when known host capability id
 */
export function isHostCapability(capability: string): capability is HostCapability {
  return (HOST_CAPABILITIES as readonly string[]).includes(capability);
}

/**
 * @param capability - Capability id
 * @returns true when permanently blocked by Iron Laws
 */
export function isHardDeniedCapability(capability: HostCapability): boolean {
  return (HARD_DENIED_CAPABILITIES as readonly string[]).includes(capability);
}

/**
 * @param capability - Capability id
 * @returns true when operator grant is required
 */
export function isSensitiveCapability(capability: HostCapability): boolean {
  return (SENSITIVE_CAPABILITIES as readonly string[]).includes(capability);
}
