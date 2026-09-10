# Memory Write Lanes (M17)

Architecture cell: `memory` (write lanes)  
Map delta: update required — three single-writer lanes + conflict disposition

## Lanes

| Lane id | Subject shape | Purpose |
|---|---|---|
| `decision_lesson` | free key (e.g. `auth.token`) | Durable decision / lesson |
| `profile` | `operator` or `cat:{id}` | Profile fragment |
| `event_summary` | `event:{slug}` | Event summary |

Flow per lane: **validate → conflict check → disposition → Evidence write**.

## Conflict disposition

Same `lane` + `subjectKey` already has evidence:

| Client action | Result |
|---|---|
| omit `disposition` | HTTP **409** + `result.conflict` |
| `disposition: "reject"` | keep existing; no new evidence |
| `disposition: "accept"` | create new evidence (old retained for history; list/retrieve prefer newest) |

## API

| Method | Path | Role |
|---|---|---|
| GET | `/api/memory/lanes` | Lane id list |
| GET | `/api/memory/lanes/dispositions` | Recent outcomes (in-memory audit) |
| POST | `/api/memory/lanes/:lane/write` | Single-writer entry |

Accepted writes set `provenance.source = lane:{id}` and tags `lane:*`, `subject:*`, `kind:*`.

## Consume

Accepted evidence is readable via M16 BM25 (`retrieveEvidenceForPrompt` / invoke injection).

## Hub

**Write lanes** panel: choose lane → subject/title/body → Write; on conflict show Accept / Reject.

## Done checklist

| Criterion | Mechanism |
|---|---|
| 3 lanes | decision_lesson, profile, event_summary |
| Single writer each | dedicated `*Lane.write` |
| Write + consume tests | `write-lanes.test.ts` |
| Explicit disposition | accept / reject / 409 |
