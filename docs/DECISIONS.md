# M01 decisions (pinned 2026-08-30)

These answers unblock Wave 4/5. Change only with an explicit decision update.

| # | Question | Decision | Why |
|---|----------|----------|-----|
| 1 | Redis optional downgrade? | **Yes** — Redis for runtime; `--memory` in-process store for smoke/dev | Lowers first-run friction; production path still Redis |
| 2 | First adapters (order) | **1. Claude Code → 2. Codex CLI → 3. opencode** (Gemini route later if needed) | Strongest coding CLIs first; opencode covers multi-model fallback |
| 3 | First external channel | **GitHub signals** (PR/issue wait → wake) | Natural for coding agents; IM deferred to post-v1.0 or Wave 5 stretch |
| 4 | Desktop in v1.0? | **No** — v1.0 = source + one-line/scripts; desktop optional Wave 5 stretch | Ship platform completeness before packaging |
| 5 | Memory phase-1 | **Evidence store + retrieval injection first**; Profile lane in M17 | Prove recall before relationship lanes |

## Port / data sanctuary (dev)

| Service | Default port | Notes |
|---------|--------------|-------|
| API | `4010` | Avoid Clowder runtime `3003/3004` |
| Web | `4011` | |
| Redis | `6410` | Only when not `--memory` |

Never flush production Redis or delete SQLite evidence DBs from agent tooling.
