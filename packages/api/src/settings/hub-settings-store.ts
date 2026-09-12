import {
  DEFAULT_ROUTING_POLICY,
  HUB_SETTINGS_NAV,
  type HubSettingsDocument,
  type ProviderAccountStatus,
  type RoutingPolicy,
  type UsageSnapshot,
} from "@mac/shared";
import type { CatRegistry } from "../cats/load-cat-config.js";
import type { ToolRegistry } from "../mcp/tool-registry.js";
import type { SkillRegistry } from "../skills/skill-registry.js";

export interface HubSettingsStoreOptions {
  version: string;
  storeKind: "memory" | "redis";
  cats?: CatRegistry;
  skills?: SkillRegistry;
  tools?: ToolRegistry;
}

/**
 * Runtime Hub Settings (M21): mutable routing/ops; accounts are env-readiness only.
 * Iron Laws: never writes .env / agent-config / MCP secrets.
 */
export class HubSettingsStore {
  private routing: RoutingPolicy = { ...DEFAULT_ROUTING_POLICY };
  private invokeCount = 0;
  private approvalDecideCount = 0;
  private usageUpdatedAt = new Date().toISOString();

  constructor(private readonly opts: HubSettingsStoreOptions) {}

  /**
   * @returns Current routing policy (clone)
   */
  getRoutingPolicy(): RoutingPolicy {
    return { ...this.routing };
  }

  /**
   * Patch routing policy; takes effect on the next invoke.
   * @param patch - Partial policy fields
   * @returns Updated policy
   */
  updateRoutingPolicy(patch: Partial<RoutingPolicy>): RoutingPolicy {
    if (patch.strategy !== undefined) {
      if (patch.strategy !== "serial" && patch.strategy !== "parallel") {
        throw new Error("strategy must be serial|parallel");
      }
      this.routing.strategy = patch.strategy;
    }
    if (patch.fallbackToDefaultCat !== undefined) {
      this.routing.fallbackToDefaultCat = Boolean(patch.fallbackToDefaultCat);
    }
    if (patch.maxTargets !== undefined) {
      const n = Number(patch.maxTargets);
      if (!Number.isFinite(n) || n < 1 || n > 32) {
        throw new Error("maxTargets must be 1..32");
      }
      this.routing.maxTargets = Math.floor(n);
    }
    return this.getRoutingPolicy();
  }

  /**
   * Soft counter: successful enqueue / decide for Ops panel.
   * @param kind - invoke | approvalDecide
   */
  recordUsage(kind: "invoke" | "approvalDecide"): void {
    if (kind === "invoke") this.invokeCount += 1;
    else this.approvalDecideCount += 1;
    this.usageUpdatedAt = new Date().toISOString();
  }

  /**
   * Build the Hub Settings document for GET /api/settings.
   * @returns Full settings snapshot
   */
  getDocument(): HubSettingsDocument {
    const skillsBudget =
      this.opts.skills?.tokenBudget ??
      Number(process.env.MAC_SKILLS_TOKEN_BUDGET ?? 4000);
    const tools = this.opts.tools?.listForHub() ?? [];
    const aspects = this.opts.tools?.aspects() ?? [];

    return {
      nav: HUB_SETTINGS_NAV.map((s) => ({ ...s })),
      routing: this.getRoutingPolicy(),
      accounts: probeProviderAccounts(),
      usage: this.usageSnapshot(skillsBudget),
      system: {
        version: this.opts.version,
        storeKind: this.opts.storeKind,
        apiPort: process.env.MAC_API_PORT ?? "4010",
        webPort: process.env.MAC_WEB_PORT ?? "4011",
        agentProviderEnv: process.env.MAC_AGENT_PROVIDER ?? "claude-code",
      },
      members: (this.opts.cats?.list() ?? []).map((c) => ({
        id: c.id,
        displayName: c.displayName,
        provider: c.provider,
        role: c.role,
      })),
      skills: {
        count: this.opts.skills?.list().length ?? 0,
        tokenBudget: skillsBudget,
      },
      mcp: {
        toolCount: tools.length,
        aspects,
      },
    };
  }

  /**
   * @param skillsTokenBudget - Budget shown in Ops
   * @returns UsageSnapshot
   */
  private usageSnapshot(skillsTokenBudget: number): UsageSnapshot {
    return {
      skillsTokenBudget,
      invokeCount: this.invokeCount,
      approvalDecideCount: this.approvalDecideCount,
      updatedAt: this.usageUpdatedAt,
    };
  }
}

/**
 * Probe provider readiness from env without exposing secret values.
 * @returns Three provider account rows
 */
export function probeProviderAccounts(): ProviderAccountStatus[] {
  const agentKind = (process.env.MAC_AGENT_PROVIDER ?? "claude-code").toLowerCase();
  const fakeOk = agentKind === "fake";

  return [
    {
      id: "claude-code",
      label: "Claude Code",
      secretEnvKey: "MAC_CLAUDE_COMMAND",
      configured:
        fakeOk ||
        Boolean(process.env.MAC_CLAUDE_COMMAND?.trim()) ||
        agentKind === "claude-code",
      setupHint:
        "Install `claude` CLI or set MAC_CLAUDE_COMMAND. Use MAC_AGENT_PROVIDER=fake for smoke.",
    },
    {
      id: "codex",
      label: "Codex CLI",
      secretEnvKey: "MAC_CODEX_COMMAND",
      configured: fakeOk || Boolean(process.env.MAC_CODEX_COMMAND?.trim()) || agentKind === "codex",
      // Codex defaults to bare `codex` on PATH — treat as configured when not forced off.
      setupHint: "Install `codex` or set MAC_CODEX_COMMAND (optional sandbox via MAC_CODEX_SANDBOX).",
    },
    {
      id: "antigravity",
      label: "Antigravity (agy)",
      secretEnvKey: "MAC_AGY_COMMAND",
      configured: fakeOk || Boolean(process.env.MAC_AGY_COMMAND?.trim()),
      setupHint: "Set MAC_AGY_COMMAND to your agy.exe path (never written by Hub at runtime).",
    },
  ];
}
