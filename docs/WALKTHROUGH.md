# 3–5 Minute Walkthrough

Start with:

```powershell
pnpm start -- --memory
```

Open http://127.0.0.1:4011. The **Operator Bootcamp** opens automatically on
first use and mirrors the first steps below.

## Minute 1 — Health, cats, and a room

1. Confirm the `health ok` pill.
2. Confirm Architect, Reviewer, and Builder appear at the top.
3. Enter `first-room` under Threads and click **Open**.

This covers cold start, identity, thread isolation, and default-cat selection.

## Minute 2 — First bubble and routing

1. Enter `hello lounge`.
2. Click **Echo** for an offline streaming smoke test.
3. If a real provider is configured, send:

```text
@architect explain the room in one sentence
```

4. Try `@architect @reviewer review this idea` to see serial multi-target
   routing and receipts.

## Minute 3 — Governance and memory

1. In Mission Hub, create a feature and move it from idea toward done.
2. Open **Memory**, write one evidence item, then search for its cue.
3. Open **Approvals** and create a demo request; approve or reject it.
4. Open **Ball**, pass the ball to a cat or begin a mock wait and wake it.

## Minute 4 — External signal and extension safety

GitHub:

1. Ball → begin a `github_pr` wait for `acme/mac#7`.
2. GitHub → bind `acme/mac#7` to the open thread.
3. Click **Simulate signal**.
4. Confirm the wait is `woken` and a `[github]` system note appears.

Plugin:

1. Plugins → select Hello Mac → **Install** → **Activate**.
2. Call `thread.post_message` before granting it: receipt must be `denied`.
3. Grant `thread.post_message`, call again, and see the plugin message.
4. Deactivate, then uninstall.

## Minute 5 — Operations and safety

1. Settings → Accounts: provider readiness shows status, never secret values.
2. Settings → Rules: change `maxTargets`; the next invoke uses it.
3. Settings → Ops: inspect invoke/approval counters.
4. Confirm the four Iron Laws:
   - persistent stores are never wiped;
   - parent processes are not killed;
   - runtime config is read-only to agents;
   - only project ports 4010/4011/6410 are used by default.

Finally:

```powershell
pnpm run doctor:live
pnpm run smoke
pnpm check
```

The v1.0 acceptance matrix is documented in
[`architecture/distribution-bootcamp.md`](./architecture/distribution-bootcamp.md).
