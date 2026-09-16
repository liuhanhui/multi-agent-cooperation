import { useState } from "react";
import type { PluginCallReceipt, PluginCatalogEntry, PluginRecord } from "@mac/shared";

interface PluginsPanelProps {
  catalog: PluginCatalogEntry[];
  plugins: PluginRecord[];
  receipts: PluginCallReceipt[];
  activeThreadId: string | null;
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onInstall: (id: string) => Promise<void>;
  onUninstall: (id: string) => Promise<void>;
  onActivate: (id: string) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
  onGrant: (id: string, capability: string) => Promise<void>;
  onRevoke: (id: string, capability: string) => Promise<void>;
  onCall: (
    id: string,
    capability: string,
    args?: Record<string, unknown>,
  ) => Promise<void>;
}

/**
 * Hub Plugins surface — catalog shell, install/activate, grants, call receipts (M23).
 * @param props.catalog - Official catalog
 * @param props.plugins - Runtime records
 * @param props.receipts - Recent settled calls
 * @param props.activeThreadId - Default thread for post_message demo
 * @param props.busy - Mutation lock
 * @param props.on* - API mutators
 */
export function PluginsPanel({
  catalog,
  plugins,
  receipts,
  activeThreadId,
  busy = false,
  onRefresh,
  onInstall,
  onUninstall,
  onActivate,
  onDeactivate,
  onGrant,
  onRevoke,
  onCall,
}: PluginsPanelProps) {
  const [selectedId, setSelectedId] = useState("hello-mac");
  const selected =
    plugins.find((p) => p.id === selectedId) ??
    plugins[0] ??
    null;

  return (
    <aside className="skills-panel plugins-panel" aria-label="Plugins">
      <header className="skills-head">
        <h2>Plugins</h2>
        <p className="muted tight">Catalog · install · grants · no grant = no sensitive call</p>
      </header>

      <div className="evidence-form">
        <button type="button" disabled={busy} onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      <h3 className="panel-title">Official catalog</h3>
      {catalog.length === 0 ? (
        <p className="muted">Catalog shell empty.</p>
      ) : (
        <ul className="skills-list">
          {catalog.map((c) => (
            <li key={c.id} className="receipt-batch">
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => setSelectedId(c.id)}
              >
                <strong>{c.name}</strong>
              </button>{" "}
              <span className="muted">
                {c.id}@{c.version}
                {c.official ? " · official" : ""}
              </span>
              <p className="muted tight">{c.description}</p>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div className="evidence-form">
          <p className="tight">
            <strong>{selected.manifest.name}</strong>{" "}
            <span className="muted">status={selected.status}</span>
          </p>
          <p className="muted tight">
            requested: {selected.manifest.requestedCapabilities.join(", ") || "—"}
          </p>
          <p className="muted tight">
            grants: {selected.grants.length ? selected.grants.join(", ") : "(none)"}
          </p>
          <button
            type="button"
            disabled={busy || selected.status !== "available"}
            onClick={() => void onInstall(selected.id)}
          >
            Install
          </button>
          <button
            type="button"
            disabled={busy || selected.status === "available" || selected.status === "active"}
            onClick={() => void onActivate(selected.id)}
          >
            Activate
          </button>
          <button
            type="button"
            disabled={busy || selected.status !== "active"}
            onClick={() => void onDeactivate(selected.id)}
          >
            Deactivate
          </button>
          <button
            type="button"
            disabled={busy || selected.status === "available" || selected.status === "active"}
            onClick={() => void onUninstall(selected.id)}
          >
            Uninstall
          </button>
          <button
            type="button"
            disabled={busy || selected.status === "available"}
            onClick={() => void onGrant(selected.id, "thread.post_message")}
          >
            Grant thread.post_message
          </button>
          <button
            type="button"
            disabled={busy || !selected.grants.includes("thread.post_message")}
            onClick={() => void onRevoke(selected.id, "thread.post_message")}
          >
            Revoke thread.post_message
          </button>
          <button
            type="button"
            disabled={busy || selected.status !== "active"}
            onClick={() =>
              void onCall(selected.id, "hub.notify", {
                message: `${selected.manifest.name} ping`,
              })
            }
          >
            Call hub.notify
          </button>
          <button
            type="button"
            disabled={busy || selected.status !== "active" || !activeThreadId}
            onClick={() =>
              void onCall(selected.id, "thread.post_message", {
                threadId: activeThreadId,
                content: `[plugin:${selected.id}] hello from grant-gated post`,
              })
            }
          >
            Call thread.post_message
          </button>
        </div>
      ) : null}

      <h3 className="panel-title">Recent receipts</h3>
      {receipts.length === 0 ? (
        <p className="muted">No calls yet.</p>
      ) : (
        <ul className="skills-list">
          {receipts.slice(0, 12).map((r) => (
            <li key={r.id} className="receipt-batch">
              <strong>{r.status}</strong>{" "}
              <span className="muted">
                {r.pluginId} · {r.capability} · {r.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
