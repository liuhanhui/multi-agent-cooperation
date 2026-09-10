import { useState } from "react";
import type { WriteDispositionChoice, WriteLaneId, WriteLaneResult } from "@mac/shared";
import { WRITE_LANE_IDS } from "@mac/shared";

interface WriteLanesPanelProps {
  dispositions: WriteLaneResult[];
  busy?: boolean;
  onWrite: (input: {
    lane: WriteLaneId;
    title: string;
    body: string;
    subjectKey: string;
    disposition?: WriteDispositionChoice;
  }) => Promise<WriteLaneResult | null>;
}

/**
 * Thin Hub surface for M17 write lanes (propose + conflict disposition).
 * @param props.dispositions - Recent lane outcomes
 * @param props.busy - Mutation lock
 * @param props.onWrite - POST lane write; may return conflict result
 */
export function WriteLanesPanel({ dispositions, busy = false, onWrite }: WriteLanesPanelProps) {
  const [lane, setLane] = useState<WriteLaneId>("decision_lesson");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subjectKey, setSubjectKey] = useState("");
  const [pendingConflict, setPendingConflict] = useState<WriteLaneResult | null>(null);

  /**
   * Submit without disposition; if 409-shaped conflict, stash for Accept/Reject.
   */
  async function handleWrite(): Promise<void> {
    if (!title.trim() || !body.trim() || !subjectKey.trim() || busy) return;
    const result = await onWrite({
      lane,
      title: title.trim(),
      body: body.trim(),
      subjectKey: subjectKey.trim(),
    });
    if (result?.conflict) {
      setPendingConflict(result);
      return;
    }
    setPendingConflict(null);
    if (result?.disposition === "accepted") {
      setTitle("");
      setBody("");
      setSubjectKey("");
    }
  }

  /**
   * Resolve a conflict with explicit accept/reject.
   * @param disposition - accept | reject
   */
  async function resolveConflict(disposition: WriteDispositionChoice): Promise<void> {
    if (!pendingConflict || busy) return;
    const result = await onWrite({
      lane: pendingConflict.lane,
      title: title.trim() || pendingConflict.conflict?.existingTitle || "update",
      body: body.trim() || "(disposition follow-up)",
      subjectKey: pendingConflict.subjectKey,
      disposition,
    });
    if (result && !result.conflict) {
      setPendingConflict(null);
      if (disposition === "accept") {
        setTitle("");
        setBody("");
        setSubjectKey("");
      }
    }
  }

  return (
    <aside className="skills-panel write-lanes-panel" aria-label="Memory write lanes">
      <header className="skills-head">
        <h2>Write lanes</h2>
        <p className="muted tight">Decision · Profile · Event · disposition on conflict</p>
      </header>

      <div className="evidence-form">
        <select
          value={lane}
          onChange={(e) => setLane(e.target.value as WriteLaneId)}
          disabled={busy}
          aria-label="Write lane"
        >
          {WRITE_LANE_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <input
          value={subjectKey}
          onChange={(e) => setSubjectKey(e.target.value)}
          placeholder={
            lane === "profile"
              ? "subjectKey (cat:architect)"
              : lane === "event_summary"
                ? "subjectKey (event:slug)"
                : "subjectKey (auth.token)"
          }
          disabled={busy}
          aria-label="Subject key"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          disabled={busy}
          aria-label="Lane title"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body"
          disabled={busy}
          rows={3}
          aria-label="Lane body"
        />
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim() || !subjectKey.trim()}
          onClick={() => void handleWrite()}
        >
          Write lane
        </button>
      </div>

      {pendingConflict?.conflict ? (
        <div className="lane-conflict">
          <p className="err tight">
            Conflict with “{pendingConflict.conflict.existingTitle}” — choose disposition
          </p>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void resolveConflict("accept")}>
              Accept (supersede)
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void resolveConflict("reject")}
            >
              Reject
            </button>
          </div>
        </div>
      ) : null}

      {dispositions.length === 0 ? (
        <p className="muted">No lane dispositions yet.</p>
      ) : (
        <ul className="skills-list">
          {dispositions.slice(0, 8).map((d, i) => (
            <li key={`${d.lane}-${d.subjectKey}-${i}`} className="skill-item">
              <p className="skill-name">
                {d.lane} · {d.disposition}
              </p>
              <p className="muted skill-triggers">
                {d.subjectKey} · {d.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
