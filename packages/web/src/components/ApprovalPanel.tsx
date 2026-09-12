import { useState } from "react";
import type {
  ApprovalChoice,
  ApprovalProducerCatalogEntry,
  ApprovalProducerId,
  ApprovalRequest,
} from "@mac/shared";

interface ApprovalPanelProps {
  producers: ApprovalProducerCatalogEntry[];
  pending: ApprovalRequest[];
  ledger: ApprovalRequest[];
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onSubmitDemo: (producerId: ApprovalProducerId) => Promise<void>;
  onDecide: (input: {
    id: string;
    choice: ApprovalChoice;
    note?: string;
  }) => Promise<void>;
}

/**
 * Hub Approval surface — humans only decide here (M20).
 * @param props.producers - Producer catalog
 * @param props.pending - Open requests
 * @param props.ledger - Recent decided rows (traceable to subject)
 * @param props.busy - Mutation lock
 * @param props.onRefresh - Reload lists
 * @param props.onSubmitDemo - Seed a demo ingress for a producer
 * @param props.onDecide - Approve or reject
 */
export function ApprovalPanel({
  producers,
  pending,
  ledger,
  busy = false,
  onRefresh,
  onSubmitDemo,
  onDecide,
}: ApprovalPanelProps) {
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  return (
    <aside className="skills-panel approval-panel" aria-label="Approval Hub">
      <header className="skills-head">
        <h2>Approvals</h2>
        <p className="muted tight">Only decide here · every row traces to a subject</p>
      </header>

      <div className="evidence-form">
        <button type="button" disabled={busy} onClick={() => void onRefresh()}>
          Refresh
        </button>
        {producers.map((p) => (
          <button
            key={p.id}
            type="button"
            className="ghost"
            disabled={busy}
            title={p.description}
            onClick={() => void onSubmitDemo(p.id)}
          >
            Demo: {p.label}
          </button>
        ))}
      </div>

      <p className="panel-title">Pending</p>
      {pending.length === 0 ? (
        <p className="muted">Nothing to approve — seed a demo or wait for a producer.</p>
      ) : (
        <ul className="skills-list">
          {pending.map((a) => (
            <li key={a.id} className="receipt-batch">
              <strong>{a.title}</strong>
              <p className="muted tight">
                {a.producerId} · {a.subjectType}/{a.subjectId}
              </p>
              <p className="tight">{a.summary}</p>
              <input
                value={noteById[a.id] ?? ""}
                disabled={busy}
                placeholder="Decision note (optional)"
                onChange={(e) =>
                  setNoteById((prev) => ({ ...prev, [a.id]: e.target.value }))
                }
                aria-label={`Note for ${a.id}`}
              />
              <div className="row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onDecide({
                      id: a.id,
                      choice: "approve",
                      note: noteById[a.id],
                    })
                  }
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    void onDecide({
                      id: a.id,
                      choice: "reject",
                      note: noteById[a.id],
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="panel-title">Ledger</p>
      {ledger.length === 0 ? (
        <p className="muted">No decisions yet.</p>
      ) : (
        <ul className="skills-list">
          {ledger.slice(0, 8).map((a) => (
            <li key={a.id} className="receipt-batch">
              <strong>{a.title}</strong>{" "}
              <span className="muted">{a.status}</span>
              <p className="muted tight">
                {a.subjectType}/{a.subjectId} · by {a.decidedBy ?? "—"}
                {a.decisionNote ? ` · ${a.decisionNote}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
