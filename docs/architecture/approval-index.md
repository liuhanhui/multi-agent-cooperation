# Approval Hub (M20)

Architecture cell: `approval-index` (+ thin `human-disposition-feedback`)  
Map delta: update required (cell → active)

## Idea

Humans only decide on the **Approval** panel. Producers submit ingress; approve/reject is ledgered and always traceable to `subjectType` + `subjectId`.

## Producer catalog (first 2)

| Id | Role |
|----|------|
| `memory_write` | Lane / evidence write needing disposition |
| `handoff` | A2A handoff gated on operator yes |

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/approvals/producers` | Catalog |
| GET | `/api/approvals?status=` | Pending / ledger |
| POST | `/api/approvals` | Producer ingress |
| POST | `/api/approvals/:id/decide` | Human approve\|reject |

## Custody bridge

If ingress includes `awaitId`, **approve** wakes that ball-custody await (human_approval path).

## Done criteria

- Hub Approvals tab is the only disposition UI
- Decisions list subject + producer + actor + note
