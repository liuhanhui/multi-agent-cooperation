# Mission Hub / Light SOP (M15)

Architecture cell: `portable-governance`  
Map delta: update required — FeatureStore + bulletin + Hub Mission board

## SOP

Repo reference: `sop/feature-lifecycle.yaml`  
Canonical transitions (also in `@mac/shared`):

| From | Allowed targets |
|---|---|
| idea | spec |
| spec | wip, idea |
| wip | review, spec |
| review | done, wip |
| done | — |

No Risk-Routed graph in M15 — keep portable and thin.

## Feature model

```ts
Feature {
  id, title, summary,
  stage,                 // idea | spec | wip | review | done
  ballHolderId,          // cat id | null
  threadIds,             // bound threads
  createdAt, updatedAt
}
```

## API

| Method | Path | Role |
|---|---|---|
| GET | `/api/features` | List |
| GET | `/api/features/:id` | Get one |
| POST | `/api/features` | Create (default stage `idea`) |
| PATCH | `/api/features/:id` | Patch title/summary/holder/threads |
| POST | `/api/features/:id/advance` | `{ stage }` — SOP-gated |
| POST | `/api/features/:id/bind-thread` | `{ threadId }` — idempotent |
| GET | `/api/bulletin` | Columns projection for Mission Hub |

Store: in-memory `FeatureStore` (`packages/api/src/features/`).

## Hub

`MissionBoard` under the chat header:

1. Create feature (optionally seeds `threadIds` with the active thread)
2. Advance with allowed → stage buttons
3. Bind active thread on a card

## Done checklist

| Criterion | Mechanism |
|---|---|
| Create feature | `POST /api/features` + Mission Create |
| Advance stages | `POST .../advance` + card buttons |
| Hub visible | `GET /api/bulletin` → Mission columns |
| Bind ≥1 thread | create seed and/or `POST .../bind-thread` |
