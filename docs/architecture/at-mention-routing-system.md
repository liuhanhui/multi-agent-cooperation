# @mention Routing System (M07)

Architecture cell: `routing-context` (initial) · dispatch entry deferred to M08.

## Behavior

| Input | Targets | Prompt |
|---|---|---|
| `hello` | `[thread.defaultCatId]` | `hello` |
| `@A hello` | `[A]` | `hello` |
| `@A @B please design` | `[A, B]` (serial) | `please design` |
| `@ghost hi` | — | **400** unknown mention |

Only a **leading** consecutive `@token` run is parsed. Mid-sentence `@` stays in the prompt.

## Components

| Piece | Location |
|---|---|
| Parser | `@mac/shared` `parseMentions` |
| Policy | `packages/api/src/routing/resolve-route.ts` |
| Serial execute | `runRoutedInvocation` (await each assistant turn before next) |
| HTTP | `POST /api/threads/:id/messages/invoke` |

## Strategy

- `serial` (default, M07 Done): invoke cats one after another; same prompt each time.
- `parallel`: enum reserved; returns 400 until implemented.

## Response (202)

```json
{
  "userMessage": { "...": "..." },
  "assistantMessage": { "...": "first pending bubble" },
  "assistantMessages": [{ "...": "..." }],
  "catIds": ["architect", "reviewer"],
  "catId": "architect",
  "strategy": "serial"
}
```

Later assistant turns for multi-target arrive only over WebSocket (`message.created` / `delta` / `completed`).
