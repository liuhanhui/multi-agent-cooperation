---
name: request-review
description: >
  Ask a peer cat for review with a structured five-piece handoff.
  Use when: self-check passed and ready for @reviewer / cross-family review.
  Not for: receiving review feedback (handle separately) or skipping quality checks.
triggers:
  - "request review"
  - "请 review"
  - "帮我看看"
  - "autoReview"
  - "handoff"
---

# Request Review

Ship a reviewable package, not a raw dump.

## Before asking

- Tests green (or say explicitly what is untested).
- Architecture cell / map delta stated if code changed.
- Five-piece handoff ready: What / Why / Tradeoff / Open / Next.

## Ask shape

Prefer platform handoff + `autoReviewTo` / `@reviewer` so the reviewer gets structure, not a bare ping.

## Done signal

Reviewer has enough context to disagree productively without re-discovering the goal.
