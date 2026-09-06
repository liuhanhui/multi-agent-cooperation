# A2A Structured Handoff (M09)

Architecture cell: `dispatch` + messaging.

## Contract

Handoffs are **not** bare strings. Required five-piece payload:

| Field | Meaning |
|---|---|
| `what` | What was produced / asked |
| `why` | Why this handoff exists |
| `tradeoff` | Known tradeoffs |
| `open` | Open questions |
| `next` | What the receiver should do |

## Flows

### Explicit

`POST /api/threads/:id/handoffs` with `payload` (+ optional `triggerReview: true`)

1. Validate five-piece  
2. Append `system` message (`mac.handoff` JSON)  
3. Publish `handoff.delivered`  
4. If `triggerReview`: ack「已接收」+ enqueue review invoke for `toCatId` with `formatHandoffReviewPrompt`

### Auto after A

`POST .../messages/invoke` with `autoReviewTo: "reviewer"` (and content targeting A)

1. A completes via dispatcher  
2. `buildAutoReviewPayload` from A's output  
3. Same deliver → ack → review enqueue as above  

### Receipt

`POST /api/threads/:id/handoffs/:handoffId/ack` → `receipt.status = "received"`

## Events

- `handoff.delivered`
- `handoff.acked`
