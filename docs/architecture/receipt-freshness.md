# Delivery Receipts + Freshness (M18)

Architecture cell: `bubble-pipeline` + `dispatch` (receipt freshness)

## Invariants

1. **Per-target receipt** — each cat in a multi-target invoke gets its own `TargetReceipt` inside a `DeliveryBatch`.
2. **Completed is authoritative** — on deliver, `completedContent` is frozen immediately.
3. **Supplements append only** — late text never mutates `completedContent` (`authoritative: false`).
4. **Stale reject** — any attempt to replace completed body fails (`freshnessVerdict` / `canOverwriteCompletedContent`).

## Flow

```
enqueue invoke
  → ReceiptStore.createBatch(targetCatIds)
  → per-turn end: markDelivered | markFailed
  → Hub/API: list / supplement / ack
```

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/threads/:threadId/receipts` | Recent batches + nested receipts |
| GET | `/api/receipts/:id` | Single receipt |
| POST | `/api/receipts/:id/supplements` | Append non-authoritative late text |
| POST | `/api/receipts/:id/ack` | Ack after delivery |

## Code map

| Path | Role |
|------|------|
| `shared/types/receipt.ts` | Schema + freshness helpers |
| `api/receipts/receipt-store.ts` | In-memory store + policy |
| `api/http/routes-receipts.ts` | REST |
| `api/dispatch/dispatcher.ts` | Create batch + sync on turn end |
| `web/ReceiptsPanel.tsx` | Thin Hub surface |

## Done criteria

- Multi-target: one receipt status per target
- Late supplement does not overwrite completed
