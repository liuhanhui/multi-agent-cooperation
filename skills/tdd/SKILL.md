---
name: tdd
description: >
  Red-Green-Refactor test-driven development discipline for this platform.
  Use when: writing new feature code, fixing bugs with tests, implementation work.
  Not for: pure docs, pure research, trivial one-liners with existing coverage.
triggers:
  - "TDD"
  - "test first"
  - "red-green"
  - "写测试"
  - "先写测试"
---

# TDD

**No failing test → no production code.**

## Loop

1. **RED** — write one failing test; watch it fail for the right reason.
2. **GREEN** — smallest change that passes; keep other tests green.
3. **REFACTOR** — clean names/duplication without new behavior.

## Bug fixes

Reproduce with a failing test first, then fix, then keep the regression.

## Done signal

Tests prove the intended behavior; do not claim done on manual-only checks.
