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

## Bug / fix log (Windows + Antigravity Hub invoke)

| Symptom | Root cause | Fix |
|---|---|---|
| `agy exited 1: 不是内部或外部命令` | `agy` not on PATH; Hub still spawned bare `agy` | Set `MAC_AGY_COMMAND` to absolute `agy.exe`; load root `.env` by walking up from `packages/api` cwd (`resolveEnvPath` in `index.ts`) |
| Builder bubble **completed with empty content** / “没反应” | Windows `spawn({ shell: true })` flattens multiline `-p` (systemSnippet + prompt); Antigravity gets a broken prompt | `shouldUseWinShell`: absolute / `.exe` paths use argv directly (no shell) |
| `timeout after 120000ms` on real coding tasks | Default 2m shorter than Antigravity print work / `--print-timeout` (~5m+) | Default `MAC_AGENT_TIMEOUT_MS` → **600000** (10m); override via `.env` (e.g. 900000) |
| Long silent runs look hung | Pending bubble had no live status until first token | `message.progress` WS events + Bubble progress line / elapsed timer (`spawning` → `running` → `stdout`) |

Env knobs (repo-root `.env`, loaded even when API cwd is `packages/api`):

```
MAC_AGY_COMMAND=C:\Users\<you>\AppData\Local\agy\bin\agy.exe
MAC_AGENT_TIMEOUT_MS=900000
```
