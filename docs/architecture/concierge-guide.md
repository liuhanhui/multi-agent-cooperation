# M26 — Concierge + Guided Flow

Architecture cell: `concierge-surface`  
Map delta: thin → active  
Why: M24's checklist becomes a reusable, action-driven guide surface.

## Goal

Every user has an always-visible **Concierge** entry, and a new user can finish
one real product flow:

`health visible → name room → open room → type message → Echo → open Friction`

The guide advances from actual product events. It does not provide a detached
manual “Next” button that could claim progress without completing the action.

## Canonical authoring

- `guides/flows/first-room.yaml` — ordered terminal flow
- `guides/tag-manifest.yaml` — semantic target contract
- `guides/registry.yaml` — discovery metadata
- `packages/web/scripts/check-guides.mjs` — schema/registry/target gate

Targets use stable `data-guide-id` values, not CSS selectors or component
positions. Vite compiles the YAML into a static browser module at build time;
there is no duplicate TypeScript step catalog or runtime YAML parser.

## State machine

Progress is browser-local under `mac.guide.progress.v1`.

| State | Event | Result |
|---|---|---|
| `idle` | start/resume | `active` at saved step |
| `active` | target action | next step, or `completed` at final step |
| `active` | exit/close | `idle` at saved step |
| `completed` | restart | `active` at step 0 |

Malformed state, a changed flow id, or an out-of-range index starts fresh.
Progress is onboarding state only; it is not server or collaboration truth.

## Runtime behavior

`useGuideEngine` locates the current semantic target and highlights it. If a
product transition temporarily removes the target (for example while creating
a room), a `MutationObserver` waits until it appears. Supported advance modes
are `visible`, `input`, `click`, and `confirm`.

Closing the Concierge pauses active guidance. Refreshing resumes at the stored
step. Echo uses `confirm` and advances only after a new completed assistant
bubble appears in the guided thread. The launcher remains visible after
completion and supports restart. Escape closes and pauses the drawer, focus is
restored to its launcher, narrow screens use a bottom sheet, and reduced-motion
preferences disable guide pulsing.

## Invariants

- **INV-G1:** one canonical YAML flow defines the runtime sequence.
- **INV-G2:** every target is present in the tag manifest.
- **INV-G3:** progress advances only while status is `active`.
- **INV-G4:** exit preserves the current step for resume.
- **INV-G5:** final target action is required before `completed`.
- **INV-G6:** a hidden panel cannot leave a guide running.
- **INV-G7:** blocked/malformed browser storage cannot break product actions.

## Manual verification

1. Open a fresh browser profile at `http://127.0.0.1:4011`.
2. Concierge opens automatically; choose **Start guided tour**.
3. Confirm each highlighted target advances only after its required action.
4. Exit midway, refresh, open Concierge, and confirm **Resume tour** returns to
   the same step.
5. Complete the Friction-tab action; confirm the launcher shows `✓`.
6. Choose **Run tour again** and confirm it starts from health.

## Non-goals

- chat-based intent matching or AI-authored runtime steps
- cross-device/server progress synchronization
- browser automation outside the Hub
- multiple guide recommendation/ranking systems
