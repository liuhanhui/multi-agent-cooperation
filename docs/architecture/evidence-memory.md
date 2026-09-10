# Evidence Store + Retrieval Injection (M16)

Architecture cell: `memory`  
Map delta: update required — SQLite evidence + BM25 + invoke injection

## Decision

Per `docs/DECISIONS.md` #5: Evidence store + retrieval first; **Profile (and Decision/Event) write lanes land in M17** — see [`write-lanes.md`](./write-lanes.md).

## Model

```ts
Evidence {
  id, title, body, tags[],
  provenance: { source, recordedAt, actorId?, threadId?, messageId? }, // source required
  createdAt, updatedAt
}
```

## Persistence

| Env | Path |
|---|---|
| default (API `index.ts`) | `data/evidence.sqlite` (repo root; gitignored) |
| `MAC_EVIDENCE_DB` | override (`:memory:` allowed) |
| tests / `buildApp` default | `:memory:` unless path passed |

Iron Laws: tooling must **not** delete/flush this SQLite file.

## API

| Method | Path | Role |
|---|---|---|
| GET | `/api/evidence` | List |
| GET | `/api/evidence/search?q=` | BM25 hits |
| POST | `/api/evidence/retrieve` | Preview injection packing |
| GET | `/api/evidence/:id` | Get one |
| POST | `/api/evidence` | Write (provenance.source required) |

## Invoke injection

On `POST .../messages/invoke`:

1. Tokenize routed prompt → FTS OR query (stopwords dropped)
2. BM25 top-k under `MAC_EVIDENCE_TOKEN_BUDGET` (default 800)
3. When hits exist, prepend Evidence scaffolding to **`agentPrompt`** (CLI `-p` only)
4. Hub user bubble stores the short operator prompt (`route.prompt`) — injection never appears in chat history
5. **No hits → agentPrompt === prompt** (Do not invent memory)

> Why prompt (not only `--append-system-prompt`)? Coding CLIs (Claude Code in dontAsk) often tool-loop into the repo and miss system appends — M16 Done requires the recall path to be visible in the primary message.

Response fields: `evidenceInjected`, `evidenceSkipped`, `evidenceTokens`.

## Hub

Right rail **Evidence** panel: Write / Search / List.

## Done checklist

| Criterion | Mechanism |
|---|---|
| SQLite evidence DB | `EvidenceStore` + FTS5 |
| Write API + provenance forced | `POST /api/evidence` |
| Ask「上次为什么选 X」recalls | BM25 on invoke prompt |
| Inject into next turn | `retrieveEvidenceForPrompt` in routes-invoke |
| No evidence → no pretend | empty `injection` / empty `evidenceInjected` |
