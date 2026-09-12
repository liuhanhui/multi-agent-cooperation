/**
 * Hub Settings product surface (M21).
 * Runtime-mutable routing/ops live here; secrets stay in env (Iron Laws).
 */

/** Settings nav section ids (product tree; subset may be active). */
export const HUB_SETTINGS_SECTION_IDS = [
  "members",
  "accounts",
  "skills",
  "mcp",
  "system",
  "rules",
  "ops",
] as const;

export type HubSettingsSectionId = (typeof HUB_SETTINGS_SECTION_IDS)[number];

/** Nav entry for Hub Settings tree. */
export interface HubSettingsSectionMeta {
  id: HubSettingsSectionId;
  label: string;
  description: string;
  /** false = placeholder for later milestones. */
  active: boolean;
}

export const HUB_SETTINGS_NAV: HubSettingsSectionMeta[] = [
  {
    id: "members",
    label: "Members",
    description: "Cat registry identities bound to threads.",
    active: true,
  },
  {
    id: "accounts",
    label: "Accounts",
    description: "CLI provider readiness (secrets stay in .env).",
    active: true,
  },
  {
    id: "skills",
    label: "Skills",
    description: "On-demand skill catalog + token budget.",
    active: true,
  },
  {
    id: "mcp",
    label: "MCP",
    description: "Canonical tool surface / exposure tiers.",
    active: true,
  },
  {
    id: "system",
    label: "System",
    description: "Ports, store, version (read-only runtime fingerprint).",
    active: true,
  },
  {
    id: "rules",
    label: "Rules",
    description: "Routing policy that applies on the next invoke.",
    active: true,
  },
  {
    id: "ops",
    label: "Ops",
    description: "Soft usage counters and quota snapshot.",
    active: true,
  },
];

/**
 * Mutable routing policy — changes take effect on the next invoke.
 * Parallel remains reserved; storing it keeps the intent visible but invoke rejects it.
 */
export interface RoutingPolicy {
  strategy: "serial" | "parallel";
  /** When no @mention, fall back to thread.defaultCatId (product default: true). */
  fallbackToDefaultCat: boolean;
  /** Cap multi-target @mentions (serial chain length). */
  maxTargets: number;
}

export const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  strategy: "serial",
  fallbackToDefaultCat: true,
  maxTargets: 8,
};

/** Provider account row for the Accounts checklist (no secret values). */
export interface ProviderAccountStatus {
  id: "claude-code" | "codex" | "antigravity";
  label: string;
  /** Env key operators set offline (never written by Hub). */
  secretEnvKey: string;
  /** Whether the process sees a non-empty config hint. */
  configured: boolean;
  /** Operator-facing setup hint. */
  setupHint: string;
}

/** Soft usage / quota snapshot for Ops. */
export interface UsageSnapshot {
  skillsTokenBudget: number;
  invokeCount: number;
  approvalDecideCount: number;
  updatedAt: string;
}

/** Aggregate Hub settings document returned to the UI. */
export interface HubSettingsDocument {
  nav: HubSettingsSectionMeta[];
  routing: RoutingPolicy;
  accounts: ProviderAccountStatus[];
  usage: UsageSnapshot;
  system: {
    version: string;
    storeKind: string;
    apiPort: string;
    webPort: string;
    agentProviderEnv: string;
  };
  members: Array<{ id: string; displayName: string; provider: string; role: string }>;
  skills: { count: number; tokenBudget: number };
  mcp: { toolCount: number; aspects: string[] };
}
