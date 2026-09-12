import type { AgentProvider } from "../agents/types.js";
import type { InvocationCredentialStore } from "../callback-auth/credential-store.js";
import type { CatRegistry } from "../cats/load-cat-config.js";
import type { InvocationDispatcher } from "../dispatch/dispatcher.js";
import type { FeatureStore } from "../features/feature-store.js";
import type { HandoffService } from "../handoff/handoff-service.js";
import type { EvidenceStore } from "../memory/evidence-store.js";
import type { WriteLaneService } from "../memory/lanes/write-lane-service.js";
import type { ReceiptStore } from "../receipts/receipt-store.js";
import type { BallCustodyStore } from "../custody/ball-custody-store.js";
import type { ApprovalStore } from "../approval/approval-store.js";
import type { HubSettingsStore } from "../settings/hub-settings-store.js";
import type { ToolRegistry } from "../mcp/tool-registry.js";
import type { SkillRegistry } from "../skills/skill-registry.js";
import type { MacStore } from "../store/types.js";
import type { ThreadHub } from "../ws/thread-hub.js";

/**
 * Shared dependencies injected into HTTP/WS route registrars.
 * Kept in one place so create-app stays a thin composition root.
 */
export interface AppDeps {
  store: MacStore;
  hub: ThreadHub;
  storeKind: "memory" | "redis";
  version: string;
  agent?: AgentProvider;
  cats?: CatRegistry;
  /** Present when an agent is configured (M08 dispatch). */
  dispatcher?: InvocationDispatcher;
  /** Present when dispatcher exists (M09 A2A handoff). */
  handoffs?: HandoffService;
  /** M10 short-lived invocation callback tokens + auth telemetry. */
  credentials?: InvocationCredentialStore;
  /** Public base URL used when minting callbackUrl for agents. */
  publicBaseUrl?: string;
  /** M12 skills catalog for browse + on-demand injection. */
  skills?: SkillRegistry;
  /** M13 canonical tools for Hub catalog + callback/MCP bridge. */
  tools?: ToolRegistry;
  /** M15 Mission Hub feature store + bulletin. */
  features?: FeatureStore;
  /** M16 SQLite evidence store + BM25 retrieval. */
  evidence?: EvidenceStore;
  /** M17 memory write lanes (single writer per lane). */
  writeLanes?: WriteLaneService;
  /** M18 per-target delivery receipts + freshness. */
  receipts?: ReceiptStore;
  /** M19 ball custody projection + await contracts. */
  custody?: BallCustodyStore;
  /** M20 Approval Hub — human disposition ledger. */
  approvals?: ApprovalStore;
  /** M21 Hub Settings — nav tree, routing policy, usage. */
  settings?: HubSettingsStore;
}
