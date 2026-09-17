# M27 — Present / Relationship Loop

Architecture cells: `proactive-relationship-loop`, `cat-life-settings`  
Map delta: two active cells  
Why: proactive delivery and its operator-owned limits form a new bounded context.

## Goal

Allow a cat to post a lightweight relationship check-in after a thread has
been quiet, while making surprise and spam impossible by default.

The global switch defaults **off**. Enabling it never bypasses:

- per-cat allow/pause;
- daily budget per cat;
- cooldown per cat;
- thread idle threshold.

The message is deterministic and local. M27 does not spend model tokens or
start an autonomous agent invocation.

## Policy

| Field | Default | Bound |
|---|---:|---:|
| global enabled | false | operator switch |
| daily budget / cat | 2 | 0–10 |
| cooldown | 120 minutes | 1–1440 |
| thread idle age | 30 minutes | 1–10080 |
| per-cat enabled | true | operator switch |

Policy and activity persist in `data/presents.sqlite`, configurable with
`MAC_PRESENT_DB`. The Hub never writes `.env` or cat configuration.

## Eligibility

Every 60 seconds the unref'ed scheduler evaluates active threads:

1. fail closed when the global switch is off;
2. require a completed operator message older than the idle threshold;
3. reject running turns and pending/streaming messages;
4. require the thread's enabled default cat;
5. atomically claim that operator message and reserve budget/cooldown;
6. append one completed assistant message and publish `message.created`;
7. settle the reservation as delivered or failed.

At most one message is delivered per scheduler pass and per operator message.
The Hub's **Run eligible check** button uses exactly the scheduler's rules.

## Delivery lifecycle

| State | Event | Next state |
|---|---|---|
| — | reserve eligible budget | `reserved` |
| `reserved` | message append succeeds | `delivered` |
| `reserved` | message append fails | `failed` |
| `delivered` / `failed` | any settle | rejected |

Reservations count against budget until settled. Failed attempts remain
auditable but do not consume the daily budget or cooldown.

## Invariants

- **INV-P1:** default policy is disabled.
- **INV-P2:** manual checks cannot bypass idle, disable, budget, cooldown, or cat pause.
- **INV-P3:** at most one delivery occurs per tick.
- **INV-P4:** each cat has at most `dailyBudgetPerCat` non-failed attempts per UTC day.
- **INV-P5:** a reserved delivery settles exactly once.
- **INV-P6:** all proactive activity remains visible; no delete/reset API exists.
- **INV-P7:** disabling is rechecked immediately before reservation.
- **INV-P8:** scheduler is stopped with the app and never keeps the parent process alive.
- **INV-P9:** each completed operator message can be claimed at most once.
- **INV-P10:** busy threads, busy cats, and active message streams are ineligible.

## HTTP and Hub

- `GET /api/presents`
- `PATCH /api/presents/policy`
- `POST /api/presents/tick`
- Hub shelf → **Present**: master switch, limits, per-cat switches, usage, manual
  bounded check, and recent delivery ledger.

## Manual verification

1. Open a thread and select **Present**.
2. Confirm the initial state is off; **Run eligible check** is disabled.
3. Enable it, leave one cat allowed, and save budget `1`.
4. Set idle age to 1 minute, send a user message, wait one minute, then choose
   **Run eligible check** and confirm the default cat appears.
5. Try again and confirm `Skipped: already_present`.
6. Turn off the master switch and confirm manual checks are disabled.
7. Restart the API and confirm policy/activity remain.

## Non-goals

- autonomous model-generated outreach
- background work, handoffs, or task creation
- sentiment scoring or relationship gamification
- quiet-hour/time-zone policy (future extension)
- deleting delivery history
