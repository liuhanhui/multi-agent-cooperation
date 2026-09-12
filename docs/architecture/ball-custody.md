# Ball Custody / Await Contracts (M19)

Architecture cell: `ball-custody`  
Map delta: update required (cell → active)

## Custody triple（强制三件套）

Every `BallCustodyProjection` always answers:

1. **holder** — `holderId` + `holderKind`
2. **mode** — `active` | `waiting` | `idle`
3. **awaitState** — open/last wait contract, or `null`

## Await lifecycle

`waiting` → `woken` | `expired` | `cancelled`

Signal kinds: `github_pr` | `human_approval` | `mock`  
Condition text is the contract — **not** a cron / scheduled-task UI.

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/custody` | List projections (soft-expires due waits) |
| GET | `/api/custody/:type/:id` | One projection |
| POST | `/api/custody/:type/:id/hold` | Pass the ball |
| POST | `/api/custody/:type/:id/wait` | Begin signal wait |
| POST | `/api/awaits/:id/wake` | Mock / external wake |
| POST | `/api/awaits/:id/cancel` | Cancel open wait |

## Done criteria

- Hub **Ball** tab answers 「球在谁手上」
- Wait + mock wake for human/GitHub-shaped signals
- Expire / cancel without timer-job UI
