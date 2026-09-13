# GitHub Signals (M22)

Architecture cell: `github-signals` + `signal-ingress` (extends `ball-custody` / `transport`)  
Map delta: update required (new cells → active)

## Decision

First external channel = **GitHub PR/issue wait → wake** (`docs/DECISIONS.md` #3). IM deferred.

## Idea

1. Hub **Ball** wait with `signalKind=github_pr` + structured `signalRef`
2. Hub **GitHub** tab binds `threadId` ↔ `owner/repo#n` (+ optional `awaitId`)
3. Ingress (`POST /webhooks/github` HMAC, or Hub **Simulate**) wakes the await and posts a system note on the bound thread

Outbound PR comments are **not** in this slice; Done accepts wait→wake.

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/github/bindings` | List bindings (`?threadId=`) |
| POST | `/api/github/bindings` | Upsert binding |
| POST | `/api/github/signals/simulate` | Hub/dev same router as webhook |
| POST | `/webhooks/github` | Real GitHub webhook (`X-Hub-Signature-256`) |

Wait body may include `signalRef: { owner, repo, number, kind }`.

## Auth

Set `MAC_GITHUB_WEBHOOK_SECRET` offline in `.env` (Iron Law: Hub never writes secrets). GitHub App / webhook must sign with the same secret.

## Hub demo

1. Open a thread → Ball → `github_pr` wait with owner/repo/#  
2. Copy await id → GitHub tab → Bind (+ paste await id)  
3. **Simulate signal** → Ball shows woken; chat gets `[github] …` system note  

## Done criteria

- External (or simulated) event reaches the correct thread  
- Matching `github_pr` await wakes  
- Inbound auth via HMAC on `/webhooks/github`
