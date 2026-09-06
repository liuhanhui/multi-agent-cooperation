---
name: debugging
description: >
  Systematic bug localization: evidence → hypotheses → verify → fix.
  Use when: bugs, test failures, unexpected runtime behavior.
  Not for: greenfield features or known one-line typos.
triggers:
  - "bug"
  - "debug"
  - "报错"
  - "test failure"
  - "unexpected"
  - "stack trace"
---

# Debugging

**No root-cause sketch → no fix claim.**

## Loop

1. **Observe** — exact failure, command, and recent change boundary.
2. **Hypothesize** — 2–3 ranked causes; pick one to falsify.
3. **Verify** — smallest repro (prefer failing test).
4. **Fix** — change that addresses the cause; keep the repro.

## Platform notes

Prefer API/WS evidence (`message.failed`, invoke status) over guessing CLI stdout alone.

## Done signal

Cause named, fix landed, regression covered or explicitly deferred with reason.
