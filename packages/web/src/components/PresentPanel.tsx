import { useEffect, useState, type FormEvent } from "react";
import type {
  CatConfig,
  PresentSnapshot,
  PresentTickResult,
  UpdatePresentPolicyInput,
} from "@mac/shared";
import { FormField, TextControl } from "./ui/FormField";

interface PresentPanelProps {
  cats: CatConfig[];
  snapshot: PresentSnapshot | null;
  tickResult: PresentTickResult | null;
  activeThreadId: string | null;
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onPatch: (patch: UpdatePresentPolicyInput) => Promise<void>;
  onTick: (threadId?: string) => Promise<void>;
}

/**
 * Render M27 proactive policy, per-cat budget, switches, and activity.
 * @param props - Cats, current control snapshot, active thread, and mutations
 * @returns Present relationship-loop control panel
 */
export function PresentPanel({
  cats,
  snapshot,
  tickResult,
  activeThreadId,
  busy = false,
  onRefresh,
  onPatch,
  onTick,
}: PresentPanelProps) {
  const [dailyBudget, setDailyBudget] = useState("2");
  const [cooldown, setCooldown] = useState("120");
  const [idle, setIdle] = useState("30");

  useEffect(() => {
    if (!snapshot) return;
    setDailyBudget(String(snapshot.policy.dailyBudgetPerCat));
    setCooldown(String(snapshot.policy.cooldownMinutes));
    setIdle(String(snapshot.policy.idleMinutes));
  }, [snapshot]);

  /**
   * Persist numeric budget and timing controls.
   * @param event - Policy form submission
   * @returns Promise after policy update
   */
  async function savePolicy(event: FormEvent): Promise<void> {
    event.preventDefault();
    await onPatch({
      dailyBudgetPerCat: Number(dailyBudget),
      cooldownMinutes: Number(cooldown),
      idleMinutes: Number(idle),
    });
  }

  if (!snapshot) {
    return (
      <aside className="skills-panel present-panel" aria-label="Present loop">
        <header className="skills-head">
          <h2>Present</h2>
          <p className="muted tight">Loading proactive policy…</p>
        </header>
        <button type="button" className="ghost" onClick={() => void onRefresh()}>
          Retry
        </button>
      </aside>
    );
  }

  const { policy } = snapshot;
  const catSettings = new Map(
    policy.cats.map((setting) => [setting.catId, setting.enabled]),
  );

  return (
    <aside className="skills-panel present-panel" aria-label="Present loop">
      <header className="skills-head">
        <h2>Present</h2>
        <p className="muted tight">
          Opt-in check-ins · hard budget · immediate off switch
        </p>
      </header>

      <div className={`present-master ${policy.enabled ? "enabled" : "disabled"}`}>
        <div>
          <strong>{policy.enabled ? "Proactive presence is on" : "Proactive presence is off"}</strong>
          <p className="muted tight">
            {policy.enabled
              ? "The scheduler may post one eligible check-in per pass."
              : "No automatic or manual check-in can be delivered."}
          </p>
        </div>
        <button
          type="button"
          className={policy.enabled ? "ghost" : undefined}
          disabled={busy}
          onClick={() => void onPatch({ enabled: !policy.enabled })}
        >
          {policy.enabled ? "Turn off" : "Enable"}
        </button>
      </div>

      <form className="present-policy" onSubmit={savePolicy}>
        <div className="present-policy-grid">
          <FormField label="Daily / cat" hint="0–10">
            <TextControl
              type="number"
              min={0}
              max={10}
              value={dailyBudget}
              disabled={busy}
              onChange={(event) => setDailyBudget(event.target.value)}
            />
          </FormField>
          <FormField label="Cooldown" hint="minutes">
            <TextControl
              type="number"
              min={1}
              max={1440}
              value={cooldown}
              disabled={busy}
              onChange={(event) => setCooldown(event.target.value)}
            />
          </FormField>
          <FormField label="Idle after" hint="minutes">
            <TextControl
              type="number"
              min={1}
              max={10080}
              value={idle}
              disabled={busy}
              onChange={(event) => setIdle(event.target.value)}
            />
          </FormField>
        </div>
        <button type="submit" disabled={busy}>
          Save limits
        </button>
      </form>

      <p className="panel-title">Cats and today&apos;s budget</p>
      <ul className="skills-list present-cats">
        {cats.map((cat) => {
          const enabled = catSettings.get(cat.id) ?? false;
          const used = snapshot.usageToday[cat.id] ?? 0;
          return (
            <li key={cat.id} className="present-cat">
              <div>
                <strong>{cat.displayName}</strong>
                <p className="muted tight">
                  {used}/{policy.dailyBudgetPerCat} used today
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                aria-pressed={enabled}
                onClick={() =>
                  void onPatch({ cats: [{ catId: cat.id, enabled: !enabled }] })
                }
              >
                {enabled ? "Allowed" : "Paused"}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="present-manual">
        <button
          type="button"
          disabled={busy || !policy.enabled || !activeThreadId}
          onClick={() => void onTick(activeThreadId ?? undefined)}
        >
          Run eligible check
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => void onRefresh()}
        >
          Refresh
        </button>
        <p className="muted tight">
          Manual and scheduled checks use the same idle, opt-in, budget,
          cooldown, and per-cat rules.
        </p>
      </div>

      {tickResult ? (
        <p className={`present-result ${tickResult.outcome}`}>
          {tickResult.outcome === "delivered"
            ? `Delivered by ${tickResult.delivery.catId}`
            : tickResult.outcome === "failed"
              ? `Failed: ${tickResult.delivery.error ?? "unknown error"}`
              : `Skipped: ${tickResult.reason}`}
        </p>
      ) : null}

      <p className="panel-title">Recent activity</p>
      {snapshot.deliveries.length === 0 ? (
        <p className="muted">No proactive attempts yet.</p>
      ) : (
        <ul className="skills-list present-activity">
          {snapshot.deliveries.slice(0, 12).map((delivery) => (
            <li key={delivery.id} className="receipt-batch">
              <strong>{delivery.catId}</strong>{" "}
              <span className={`present-delivery-status ${delivery.status}`}>
                {delivery.status}
              </span>
              <p className="tight">{delivery.content}</p>
              <p className="muted tight">
                thread {delivery.threadId.slice(0, 8)} ·{" "}
                {new Date(delivery.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
