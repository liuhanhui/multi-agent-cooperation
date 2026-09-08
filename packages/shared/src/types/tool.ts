/**
 * Canonical MCP/tool governance contracts (M13).
 * One semantic id maps to exactly one MCP name — no dual exposure.
 */

/** Who may see/call the tool in Hub vs agent runtimes. */
export type ToolExposureTier = "hub" | "agent" | "public";

/** Governance aspect bucket for the cut-list inventory. */
export type ToolAspect = "messaging" | "governance" | "ops" | "memory";

/**
 * Platform annotations (governance). Distinct from MCP wire ToolAnnotations hints.
 */
export interface ToolAnnotations {
  /** Mutates platform state when true. */
  sideEffect: boolean;
  /** Safe to retry with same args when true. */
  idempotent: boolean;
  /** CLI families allowed to call (documentation + policy). */
  families: string[];
  /** Aspect cut-list membership. */
  aspect: ToolAspect;
}

/**
 * Hub-visible catalog row for a canonical tool.
 */
export interface ToolCatalogEntry {
  /** Stable semantic id (e.g. thread.post_message). */
  id: string;
  /** Single MCP wire name for this semantic (e.g. thread_post_message). */
  mcpName: string;
  title: string;
  description: string;
  /** Exposure tiers; hub-listed tools always include "hub". */
  exposure: ToolExposureTier[];
  annotations: ToolAnnotations;
  /** JSON-schema-ish summary for Hub browse (not full Zod). */
  inputSchema: Record<string, unknown>;
}
