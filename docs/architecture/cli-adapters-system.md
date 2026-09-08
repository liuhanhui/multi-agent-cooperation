# CLI Adapters (M11)

Architecture cell: `cli-integration` (+ cat `provider` on `identity-session`).

## Families

| provider id | CLI | stdout format | systemSnippet |
|---|---|---|---|
| `claude-code` | `claude -p … --output-format stream-json` | stream-json (partial deltas) | `--append-system-prompt` |
| `codex` | `codex exec --json --approve-for-me` (or `--sandbox` alone; not both) | jsonl (full agent_message items) | prepended into prompt |
| `antigravity` | `agy -p … --output-format stream-json` | stream-json (`text_delta` + `result`) | prepended into prompt |
| `fake` | in-process | plain | ignored / available |

Capability discovery: `GET /api/providers`.

## Per-cat routing

Each cat declares `provider` in `agent-config.json`. On invoke, `ProviderRouter` picks the adapter from `AgentInvokeInput.catId` → `cat.provider`.

Default demo trio (missing config file / `agent-config.example.json`):

- `@architect` → claude-code
- `@reviewer` → codex
- `@builder` → antigravity

`MAC_AGENT_PROVIDER=fake` forces the single in-process fake for offline demos.

## Done checklist

| Criterion | Mechanism |
|---|---|
| Three cats same thread | Thread create seeds all registry ids; example config has 3 families |
| Cross-family review | autoReview / handoff runs reviewer on a different provider than producer |
| Output format table | `capabilities.ts` + `/api/providers` |

## Real CLI smoke (optional)

With `claude`, `codex`, and `agy` on PATH and credentials configured:

1. Copy `agent-config.example.json` → `agent-config.json` (read-only; do not edit at runtime).
2. `pnpm --filter @mac/api start`
3. Create a thread, `@architect` write a short plan with `autoReviewTo=reviewer`, watch two bubbles from different families.
