# Dispatch — InvocationQueue / cancel / reconcile (M08)

Architecture cell: `dispatch`.

## State objects

| Object | Role |
|---|---|
| `QueueEntry` | One operator invoke job (prompt + ordered `catIds`) |
| `TurnExecution` | Per-cat attempt inside a QueueEntry |
| `CancelToken` | Cancel intent on the entry + live `AbortController` in-process |

## Busy gates

1. **Per-thread**: at most one `running` QueueEntry per `threadId` — further invokes stay `queued`.
2. **Per-cat**: do not start an entry while any of its `catIds` is reserved by another running entry.

Fairness: higher `priority` first, then FIFO by `createdAt`.

## HTTP

| Method | Path | Meaning |
|---|---|---|
| POST | `/api/threads/:id/messages/invoke` | Resolve @mention → enqueue → 202 `{ queueEntryId, status, started, … }` |
| GET | `/api/threads/:id/invocations` | List entries for thread |
| GET | `/api/threads/:id/invocations/:entryId` | Entry + turns |
| POST | `/api/threads/:id/invocations/:entryId/cancel` | Cancel queued immediately; abort running via signal |

Bubbles still arrive over WebSocket when the job runs.

## Restart

`reconcileOrphanMessages` on `buildApp`: any `pending` / `streaming` message → `failed` with `orphan-recovered after restart`.
