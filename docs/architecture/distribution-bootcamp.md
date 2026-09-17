# Distribution and Operator Bootcamp (M24)

Architecture cell: `distribution` + thin `concierge-surface`  
Map delta: update required (new source-distribution boundary and onboarding UI)

## Source distribution

The v1.0 distribution is source + scripts, matching `docs/VISION.md`:

- Node.js 22.13+, pnpm 9.x pinned by root metadata files
- `pnpm run setup` installs from lockfile, builds, and checks
- `pnpm start -- --memory` starts built API + Web without Redis
- `pnpm run doctor` validates prerequisites and build outputs
- `pnpm run doctor:live` checks the project health endpoint
- `pnpm run smoke` owns a memory/fake API+Web run and verifies first invocation

Scripts never write `.env`, `agent-config.json`, or MCP configuration. The
operator may copy and edit `.env.example` explicitly.

## Bootcamp

`BootcampPanel` is a five-step, browser-local walkthrough:

1. health / cat identities;
2. create a thread;
3. send a first message;
4. inspect a Hub control;
5. acknowledge the four Iron Laws.

Health, thread, and message progress derive from live product state. The two
educational acknowledgements persist under `mac.bootcamp.v1` in localStorage;
they are not server truth and do not affect platform behavior.

## Acceptance matrix

| AC | Smoke evidence |
|----|----------------|
| P1 | `pnpm run setup`; `pnpm run smoke`; `/health` |
| P2 | Settings → Members/Accounts lists three CLI families |
| P3 | Walkthrough `@mention`; separate thread history |
| P4 | Dispatch tests + visible queue/cancel/failure behavior |
| P5 | A2A handoff + auto-review tests |
| P6 | Skills and Tools Hub tabs; MCP tests |
| P7 | Memory write → search → prompt injection test |
| P8 | Settings Accounts / Rules / Ops |
| P9 | Mission idea → done workflow |
| P10 | GitHub bind → simulate signal → wait wakes |
| P11 | `pnpm check` Iron Laws guard + documented boundaries |

## Non-goals

- Desktop packaging
- Bundled Redis binary
- Editing operator configuration
- Wave 6 concierge automation
