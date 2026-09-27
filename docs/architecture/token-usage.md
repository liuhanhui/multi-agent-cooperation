# M29 Token Usage

Architecture cell: `token-usage-ledger`  
Map delta: new cell required  
Why: M29 adds a durable, append-only accounting ledger fed by CLI adapter output.

## Goal

Show how many tokens each cat spends — per turn on the chat bubble, and in
aggregate (by cat, provider, day, thread) in the **Usage** shelf tab — using the
numbers the CLIs themselves report, never a guess presented as truth.

## Sources

| Family | Where usage comes from | Notes |
|---|---|---|
| Claude Code | stream-json `type: "result"` line: `usage`, `total_cost_usd`, `modelUsage` | `input_tokens` excludes cache; cost reported |
| Codex | `codex exec --json` `turn.completed.usage` | `input_tokens` includes `cached_input_tokens`; split out on ingest; no cost |
| Antigravity | `result.usage` when present (common key spellings) | Shape unverified; absent → no record |
| Fake | char-based estimate (~4 chars/token), `estimated: true` | Only when `estimateUsage` is on (offline demo) |

All parsers normalize into `TokenUsage` (`packages/shared/src/types/usage.ts`):
fresh input, output, cache read, cache write, total, optional cost/model, and an
`estimated` flag. `inputTokens` never contains cache reads, so totals are
comparable across families.

## Flow

1. Adapter yields `{ type: "usage" }` before its terminal event (possibly several).
2. `streamExistingAssistant` sums the turn's usage events; at `completed` or
   `failed` it records once into `UsageStore` and attaches `usage` to the
   published `message.completed` / `message.failed` payload.
3. Reads (`thread.hydrated`, `GET /api/threads/:id/messages`) join the ledger onto
   assistant messages via `attachUsage`. The message store never stores usage.
4. `GET /api/usage?days=N&threadId=…` returns `UsageSummary` (totals, byCat,
   byProvider, zero-filled byDay, recent).

Ledger: `data/usage.sqlite` (override `MAC_USAGE_DB`). It persists even when
`MAC_STORE=memory`, so historical totals can outlive the messages they describe.

## Invariants

- **INV-U1:** at most one ledger row per assistant message (unique `message_id`,
  first write wins) — retries cannot double count.
- **INV-U2:** the ledger is append-only; no update/delete/reset API exists.
- **INV-U3:** a ledger failure never fails or alters the agent turn.
- **INV-U4:** no usage event → no record and no chip (no invented numbers).
- **INV-U5:** estimates are always flagged (`estimated`, `~` prefix in the UI).
- **INV-U6:** cancelled turns (abort before terminal) are not recorded.
- **INV-U7:** Hub-action `message.updated` payloads (no usage) keep the bubble's
  existing usage in the web reducer.

## Manual verification

1. Offline: `MAC_AGENT_PROVIDER=fake pnpm dev`, invoke a cat. The bubble header
   shows `~N tok` (coral chip); hover for the breakdown.
2. Real CLI: invoke a Claude cat; the chip shows `N tok` without `~` and the
   tooltip includes cost and model. Codex shows cache read split out.
3. Open **Usage** tab: totals, daily bars, per-cat meters, recent turns. Toggle
   **This thread** / **Today / 7d / 30d**.
4. Reload the page; the chip is still there (ledger join on hydrate).
5. Restart the API; the Usage tab totals are unchanged.

## Non-goals

- budgets, quotas, or blocking invocations on spend;
- price tables to compute cost for families that do not report it;
- tokenizer-accurate estimates;
- editing or deleting ledger rows.
