# M28 Visible Café

Architecture cell: `visible-cafe-render`  
Map delta: new cell required  
Why: M28 adds a read-only visual projection of runtime contracts.

## Goal

Visible Café makes the selected thread feel inhabited without creating another
agent runtime. It is a frontend view: changing tabs, reconnecting, or remounting
the component cannot change cat, thread, invocation, or message state.

## Canonical inputs

`CafePanel` receives only data already owned by the Hub shell:

- the cat registry from `GET /api/cats`;
- the selected `Thread`, including membership and `defaultCatId`;
- hydrated and live `Message[]` from `useThreadSocket`;
- existing invocation queue/turn reads from M08 dispatch routes;
- the socket connection lifecycle.

There is no new Café API, store, WebSocket event, reducer, or browser-storage
key. `useVisibleCafeRuntime` polls existing invocation GET routes only while the
tab is visible; its state is an HTTP cache, not a lifecycle authority.
`deriveCafeScene` remains a pure function recomputed from canonical inputs.

## Projection

- no selected thread → quiet room; every cat remains outside;
- default cat → lead desk;
- other thread members → room cushions;
- non-members → window/outside;
- running `TurnExecution` or pending/streaming cat message → working;
- queued entry/turn → queued;
- failed latest cat message → attention;
- completed latest cat message or no cat turn → ready;
- the last four canonical messages → recent activity traces.

The labels deliberately describe the selected room, not global availability.
M08 dispatch remains the authority for actual busy gates.

## Invariants

- **INV-C1:** the Café writes no domain or browser state.
- **INV-C2:** every cat shown comes from the registry.
- **INV-C3:** location comes only from membership and `defaultCatId`.
- **INV-C4:** message working/error fallback comes only from message lifecycle.
- **INV-C5:** dispatch running/queued state comes only from QueueEntry/TurnExecution.
- **INV-C6:** socket status is displayed, never inferred.
- **INV-C7:** switching away and back reconstructs the same scene from inputs.
- **INV-C8:** reduced-motion users receive no working animation.

## Manual verification

1. Open the **Café** shelf tab without selecting a thread; confirm a quiet scene.
2. Select a thread; confirm its default cat is at the lead desk, other members
   are on cushions, and non-members remain by the window.
3. Invoke multiple cats; confirm only the running turn is working and later
   serial targets are queued.
4. Let the message complete; confirm the cat returns to ready and the activity
   trace shows the settled message.
5. Change the default cat in Chat; confirm the desk assignment follows it.
6. Disconnect/reconnect the API; confirm the visible socket badge follows the
   existing WebSocket state.

## Non-goals

- a second simulation loop or presence state machine;
- inferred global cat availability;
- movement commands, drag/drop, or persisted positions;
- new backend routes or transport events;
- replacing Chat, dispatch inspection, or Present policy controls.
