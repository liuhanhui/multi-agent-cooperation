import { useState } from "react";
import type { DeliveryBatch, TargetReceipt } from "@mac/shared";

export type ReceiptBatchView = {
  batch: DeliveryBatch;
  receipts: TargetReceipt[];
};

interface ReceiptsPanelProps {
  batches: ReceiptBatchView[];
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onSupplement: (receiptId: string, content: string) => Promise<void>;
  onAck: (receiptId: string) => Promise<void>;
}

/**
 * Thin Hub surface for per-target delivery receipts + late supplements (M18).
 * @param props.batches - Recent delivery batches for the active thread
 * @param props.busy - Mutation lock
 * @param props.onRefresh - Reload batches from API
 * @param props.onSupplement - Append non-authoritative late text
 * @param props.onAck - Ack a delivered receipt
 */
export function ReceiptsPanel({
  batches,
  busy = false,
  onRefresh,
  onSupplement,
  onAck,
}: ReceiptsPanelProps) {
  const [draftById, setDraftById] = useState<Record<string, string>>({});

  /**
   * Submit supplement for one receipt and clear its draft on success.
   * @param receiptId - Target receipt
   */
  async function submitSupplement(receiptId: string): Promise<void> {
    const content = (draftById[receiptId] ?? "").trim();
    if (!content || busy) return;
    await onSupplement(receiptId, content);
    setDraftById((prev) => ({ ...prev, [receiptId]: "" }));
  }

  return (
    <aside className="skills-panel receipts-panel" aria-label="Delivery receipts">
      <header className="skills-head">
        <h2>Receipts</h2>
        <p className="muted tight">Each cat gets a slip · late notes never rewrite the original</p>
      </header>

      <div className="evidence-form">
        <button type="button" disabled={busy} onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      {batches.length === 0 ? (
        <p className="muted">No delivery receipts for this thread yet.</p>
      ) : (
        <ul className="skills-list">
          {batches.slice(0, 6).map(({ batch, receipts }) => (
            <li key={batch.id} className="receipt-batch">
              <p className="muted tight">
                batch {batch.id.slice(0, 8)} · {receipts.length} target
                {receipts.length === 1 ? "" : "s"}
              </p>
              <ul className="skills-list">
                {receipts.map((r) => (
                  <li key={r.id}>
                    <strong>{r.targetCatId}</strong>{" "}
                    <span className="muted">{r.status}</span>
                    {r.completedContent ? (
                      <p className="tight">{r.completedContent.slice(0, 120)}</p>
                    ) : null}
                    {r.supplements.length > 0 ? (
                      <p className="muted tight">
                        +{r.supplements.length} supplement
                        {r.supplements.length === 1 ? "" : "s"} (non-authoritative)
                      </p>
                    ) : null}
                    {(r.status === "delivered" || r.status === "acked" || r.status === "failed") && (
                      <div className="evidence-form">
                        <input
                          value={draftById[r.id] ?? ""}
                          disabled={busy}
                          placeholder="Late supplement…"
                          onChange={(e) =>
                            setDraftById((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          disabled={busy || !(draftById[r.id] ?? "").trim()}
                          onClick={() => void submitSupplement(r.id)}
                        >
                          Supplement
                        </button>
                        {r.status === "delivered" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onAck(r.id)}
                          >
                            Ack
                          </button>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
