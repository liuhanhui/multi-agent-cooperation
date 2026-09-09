# Rich Blocks / Hub Actions (M14)

Architecture cell: `hub-action-surface`  
Map delta: update required — rich blocks + action callback

## Schema

Shared types in `@mac/shared` (`ContentBlock`, `HubBlockAction`):

| Block | Interactive | Notes |
|---|---|---|
| `checklist` | yes | Hub toggles items |
| `decision` | yes | Hub selects one option |
| `diff` | no | before/after presentation |
| `card` | no | title/body/tone |
| `text` | no | optional segment |

Messages carry optional `blocks[]` alongside `content`.

## Agent → Hub

1. **Explicit**: `POST /api/threads/:id/messages` with `{ content, role, authorId, blocks }`
2. **Fence**: assistant prose may end with:

````markdown
```mac-blocks
[{"type":"checklist","id":"login","title":"Login","items":[{"id":"a","label":"Form","checked":false}]}]
```
````

`completeMessage` / append parses the fence into `message.blocks` and strips it from `content`.

## Hub → write-back

`POST /api/threads/:threadId/messages/:messageId/actions`

```json
{ "type": "checklist.toggle", "blockId": "login", "itemId": "a", "checked": true }
```

or

```json
{ "type": "decision.select", "blockId": "d1", "optionId": "jwt" }
```

Publishes `message.updated` over WS.

## Next cat visibility (Done)

On invoke, `formatBlocksForPrompt(history)` appends a `[Hub Actions — operator updates]` section into `systemSnippet` so the next cat sees checked/selected state.

## Done checklist

| Criterion | Mechanism |
|---|---|
| Agent sends checklist | blocks on POST message or `mac-blocks` fence |
| User checks → write-back | `/actions` + `updateMessageBlocks` |
| Next round cat sees result | `formatBlocksForPrompt` in invoke `systemSnippetFor` |
| Frontend renderers | `ContentBlocks` + interactive Bubble |
