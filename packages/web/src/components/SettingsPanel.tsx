import { useState } from "react";
import type { HubSettingsDocument, RoutingPolicy } from "@mac/shared";

interface SettingsPanelProps {
  settings: HubSettingsDocument | null;
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onPatchRouting: (patch: Partial<RoutingPolicy>) => Promise<void>;
}

/**
 * Hub Settings product surface — nav tree + section panels (M21).
 * @param props.settings - GET /api/settings document
 * @param props.busy - Mutation lock
 * @param props.onRefresh - Reload settings
 * @param props.onPatchRouting - PATCH routing policy (immediate next invoke)
 */
export function SettingsPanel({
  settings,
  busy = false,
  onRefresh,
  onPatchRouting,
}: SettingsPanelProps) {
  const [sectionId, setSectionId] = useState<string>("accounts");

  if (!settings) {
    return (
      <aside className="skills-panel settings-panel" aria-label="Hub Settings">
        <header className="skills-head">
          <h2>Settings</h2>
          <p className="muted tight">Loading…</p>
        </header>
      </aside>
    );
  }

  const section = settings.nav.find((s) => s.id === sectionId) ?? settings.nav[0]!;

  return (
    <aside className="skills-panel settings-panel" aria-label="Hub Settings">
      <header className="skills-head">
        <h2>Settings</h2>
        <p className="muted tight">Providers · routing · usage · secrets stay in .env</p>
      </header>

      <div className="evidence-form">
        <button type="button" disabled={busy} onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      <div className="catalog-tabs" role="tablist" aria-label="Settings sections">
        {settings.nav.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section.id === s.id}
            className={`catalog-tab${section.id === s.id ? " active" : ""}`}
            onClick={() => setSectionId(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="muted tight">{section.description}</p>

      {section.id === "members" ? (
        <ul className="skills-list">
          {settings.members.map((m) => (
            <li key={m.id} className="receipt-batch">
              <strong>{m.displayName}</strong>{" "}
              <span className="muted">
                {m.id} · {m.provider} · {m.role}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {section.id === "accounts" ? (
        <ul className="skills-list">
          {settings.accounts.map((a) => (
            <li key={a.id} className="receipt-batch">
              <strong>{a.label}</strong>{" "}
              <span className="muted">{a.configured ? "ready" : "needs setup"}</span>
              <p className="muted tight">env: {a.secretEnvKey} (Hub never writes secrets)</p>
              <p className="tight">{a.setupHint}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {section.id === "skills" ? (
        <p className="tight">
          {settings.skills.count} skills · budget {settings.skills.tokenBudget} tokens
        </p>
      ) : null}

      {section.id === "mcp" ? (
        <p className="tight">
          {settings.mcp.toolCount} tools · aspects{" "}
          {settings.mcp.aspects.length ? settings.mcp.aspects.join(" · ") : "—"}
        </p>
      ) : null}

      {section.id === "system" ? (
        <ul className="skills-list">
          <li className="receipt-batch">
            version {settings.system.version} · store {settings.system.storeKind}
          </li>
          <li className="receipt-batch">
            API :{settings.system.apiPort} · Web :{settings.system.webPort}
          </li>
          <li className="receipt-batch">
            MAC_AGENT_PROVIDER={settings.system.agentProviderEnv}
          </li>
        </ul>
      ) : null}

      {section.id === "rules" ? (
        <div className="evidence-form">
          <label className="muted tight" htmlFor="settings-strategy">
            Mention strategy
          </label>
          <select
            id="settings-strategy"
            value={settings.routing.strategy}
            disabled={busy}
            onChange={(e) =>
              void onPatchRouting({
                strategy: e.target.value as RoutingPolicy["strategy"],
              })
            }
          >
            <option value="serial">serial</option>
            <option value="parallel">parallel (not implemented)</option>
          </select>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.routing.fallbackToDefaultCat}
              disabled={busy}
              onChange={(e) =>
                void onPatchRouting({ fallbackToDefaultCat: e.target.checked })
              }
            />
            Fallback to default cat when no @mention
          </label>
          <label className="muted tight" htmlFor="settings-max-targets">
            Max @targets
          </label>
          <input
            id="settings-max-targets"
            type="number"
            min={1}
            max={32}
            value={settings.routing.maxTargets}
            disabled={busy}
            onChange={(e) =>
              void onPatchRouting({ maxTargets: Number(e.target.value) })
            }
          />
          <p className="muted tight">Changes apply on the next Send / invoke.</p>
        </div>
      ) : null}

      {section.id === "ops" ? (
        <ul className="skills-list">
          <li className="receipt-batch">
            skills budget {settings.usage.skillsTokenBudget}
          </li>
          <li className="receipt-batch">invokes {settings.usage.invokeCount}</li>
          <li className="receipt-batch">
            approval decisions {settings.usage.approvalDecideCount}
          </li>
          <li className="muted tight">updated {settings.usage.updatedAt}</li>
        </ul>
      ) : null}
    </aside>
  );
}
