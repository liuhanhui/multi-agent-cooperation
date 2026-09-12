import { useState } from "react";
import type {
  AwaitSignalKind,
  BallCustodyProjection,
  BallHolderKind,
  CatConfig,
} from "@mac/shared";

interface BallCustodyPanelProps {
  projections: BallCustodyProjection[];
  cats: CatConfig[];
  activeThreadId: string | null;
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onHold: (input: {
    subjectType: "thread" | "feature";
    subjectId: string;
    holderId: string | null;
    holderKind: BallHolderKind;
  }) => Promise<void>;
  onWait: (input: {
    subjectType: "thread" | "feature";
    subjectId: string;
    signalKind: AwaitSignalKind;
    condition: string;
  }) => Promise<void>;
  onWake: (awaitId: string) => Promise<void>;
  onCancel: (awaitId: string) => Promise<void>;
}

/**
 * Hub surface answering 「球在谁手上」with hold / wait / mock wake (M19).
 * @param props.projections - Custody triples from GET /api/custody
 * @param props.cats - For holder select
 * @param props.activeThreadId - Default subject for hold/wait
 * @param props.busy - Mutation lock
 * @param props.onRefresh / onHold / onWait / onWake / onCancel - API mutators
 */
export function BallCustodyPanel({
  projections,
  cats,
  activeThreadId,
  busy = false,
  onRefresh,
  onHold,
  onWait,
  onWake,
  onCancel,
}: BallCustodyPanelProps) {
  const [holderId, setHolderId] = useState(cats[0]?.id ?? "");
  const [signalKind, setSignalKind] = useState<AwaitSignalKind>("mock");
  const [condition, setCondition] = useState("Operator mock approval");

  /**
   * Pass the ball to the selected cat on the active thread.
   */
  async function handleHold(): Promise<void> {
    if (!activeThreadId || !holderId || busy) return;
    await onHold({
      subjectType: "thread",
      subjectId: activeThreadId,
      holderId,
      holderKind: "cat",
    });
  }

  /**
   * Park the active thread on a signal wait (not a cron job).
   */
  async function handleWait(): Promise<void> {
    if (!activeThreadId || !condition.trim() || busy) return;
    await onWait({
      subjectType: "thread",
      subjectId: activeThreadId,
      signalKind,
      condition: condition.trim(),
    });
  }

  return (
    <aside className="skills-panel custody-panel" aria-label="Ball custody">
      <header className="skills-head">
        <h2>Ball custody</h2>
        <p className="muted tight">Who holds it · wait on signals · mock wake</p>
      </header>

      <div className="evidence-form">
        <button type="button" disabled={busy} onClick={() => void onRefresh()}>
          Refresh
        </button>
        <select
          value={holderId}
          disabled={busy || cats.length === 0}
          onChange={(e) => setHolderId(e.target.value)}
          aria-label="Ball holder cat"
        >
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy || !activeThreadId} onClick={() => void handleHold()}>
          Pass ball to cat
        </button>
        <select
          value={signalKind}
          disabled={busy}
          onChange={(e) => setSignalKind(e.target.value as AwaitSignalKind)}
          aria-label="Wait signal kind"
        >
          <option value="mock">mock</option>
          <option value="human_approval">human_approval</option>
          <option value="github_pr">github_pr</option>
        </select>
        <input
          value={condition}
          disabled={busy}
          onChange={(e) => setCondition(e.target.value)}
          placeholder="Wait condition (not a cron)…"
          aria-label="Wait condition"
        />
        <button type="button" disabled={busy || !activeThreadId} onClick={() => void handleWait()}>
          Begin wait
        </button>
      </div>

      {projections.length === 0 ? (
        <p className="muted">No ball yet — pass it to a cat on the open thread.</p>
      ) : (
        <ul className="skills-list">
          {projections.slice(0, 10).map((p) => (
            <li key={`${p.subjectType}:${p.subjectId}`} className="receipt-batch">
              <strong>
                {p.subjectType}/{p.subjectId.slice(0, 8)}
              </strong>{" "}
              <span className="muted">{p.mode}</span>
              <p className="tight">
                holder: {p.holderId ?? "—"} ({p.holderKind})
              </p>
              {p.awaitState ? (
                <>
                  <p className="muted tight">
                    await {p.awaitState.status} · {p.awaitState.signalKind} ·{" "}
                    {p.awaitState.condition}
                  </p>
                  {p.awaitState.status === "waiting" ? (
                    <div className="row">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onWake(p.awaitState!.id)}
                      >
                        Mock wake
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => void onCancel(p.awaitState!.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="muted tight">no open wait</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
