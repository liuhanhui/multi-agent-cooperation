# M25 — Friction Harness Minimum Loop

Architecture cell: `harness-eval`  
Map delta: new active cell  
Why: friction lifecycle and evaluation ownership are a new bounded context.

## Goal

Turn a concrete operator, agent, or system friction into a traceable loop:

`capture → verdict + owner → owner response`

This is deliberately not an automated benchmark platform. A friction is an
operational signal with evidence; the verdict is a human evaluation; the final
response belongs to the owner assigned by that verdict.

## Terminal contract

`FrictionRecord` is defined in `@mac/shared`. Its current projection and
ordered `events` travel together so API and Hub show the same truth.

| State | Allowed event | Next state | Required facts |
|---|---|---|---|
| — | `friction.captured` | `captured` | source, category, severity, summary, detail, reporter |
| `captured` | `friction.evaluated` | `evaluated` | outcome, rationale, evaluator, owner |
| `evaluated` | `friction.responded` | `responded` | disposition, note, assigned owner identity |
| `responded` | none | terminal | complete three-event audit trail |

## Invariants

- **INV-F1 — No bypass:** a response cannot be recorded before a verdict.
- **INV-F2 — One verdict:** evaluated or responded records cannot be evaluated again.
- **INV-F3 — Accountable response:** `responderId` must equal the verdict's `ownerId`.
- **INV-F4 — No lifecycle delete:** M25 exposes no delete or reset API.
- **INV-F5 — Detached reads:** callers receive deep clones and cannot rewrite audit events.
- **INV-F6 — Coherent projection:** status, verdict, and owner response are checked together.

## Ownership and persistence

`FrictionStore` is the only lifecycle writer. Production opens
`data/frictions.sqlite` (override with `MAC_FRICTION_DB`). Each transition
atomically appends to `friction_events` and updates `friction_records`; event
sequence is unique per friction. It creates no delete/truncate path, preserving
the Data Storage Sanctuary.

## HTTP and Hub

- `GET /api/frictions`
- `GET /api/frictions/:id`
- `POST /api/frictions`
- `POST /api/frictions/:id/verdict`
- `POST /api/frictions/:id/respond`
- Hub shelf → **Friction** shows lifecycle counts, forms, and the per-row audit trail.

## Manual demo

1. Start with `pnpm start -- --memory` and open `http://127.0.0.1:4011`.
2. Open **Friction** on the right shelf.
3. Enter a summary and concrete detail, choose category/severity, then **Capture**.
4. On the captured row, enter verdict rationale, leave owner as `builder`, then
   choose **Set verdict**.
5. Enter the owner's planned/fixed response and choose **Record response**.
6. Confirm the status is `responded` and Audit shows captured → evaluated → responded.
7. Restart the API and confirm the row remains (SQLite persistence).

## Non-goals

- benchmark suites, graders, model leaderboards, or prompt datasets
- automatic verdicts or automatic owner impersonation
- editing/deleting historical friction records
- coupling friction to Approval Hub, evidence memory, or feature lifecycle
