# Callback Auth (M10)

Architecture cell: `callback-auth`.

## Credential

When an invocation **starts**, the dispatcher mints a short-lived `InvocationCredential`:

- Bound to `queueEntryId` + `threadId` + allowed `catIds`
- Default TTL 15 minutes
- Returned once on invoke `202` as `callbackToken` / `callbackExpiresAt` / `callbackUrl`
- Also passed into `AgentInvokeInput` for CLI adapters

## Callback

`POST /api/callbacks/invocation`

```
Authorization: Bearer <callbackToken>
{ "content": "...", "authorId": "architect" }
```

- Missing / invalid / expired → **401** with `code: callback_auth_*`
- Failures recorded at `GET /api/callbacks/auth-failures` (observable)
- Success → appends completed assistant message on the **credential's thread only**

## Done checklist

| Criterion | Mechanism |
|---|---|
| No credential → 401 | preHandler + `callback_auth_missing` |
| Expired observable | `callback_auth_expired` + auth-failures list |
| Valid writes correct thread | message.threadId === credential.threadId |
