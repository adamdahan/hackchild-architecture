---
status: verified
vantage: backend-only
kind: mechanism
domain: platform
keywords: event bus, publish, register, canHandle, handler, microtask, silently dropped, adding a handler
verified_on: 2026-08-11
verified_by: adamdahan
sources:
  - repo: hackchild-backend
    path: src/events/bus.js
    blob: a26559b1f4ca31a86d1b4ea0d6ca839b7ce3e1d4
  - repo: hackchild-backend
    path: src/events/handlers/streak.handler.js
    blob: e7bcb149b11270aab9ad98649c0cfd1dff387d46
---

# The Event Bus

How a published event finds its handler.

## Flow

1. A handler calls `register(handler)` at startup, via `registerHandlers()` in
   `src/server.js`.
2. A route calls `publish(event)`.
3. `publish` finds the **first** handler whose `canHandle(event)` returns true.
4. The handler runs on a microtask. The publisher does not await it.

## Adding a handler

```js
export const myHandler = {
  canHandle: (event) => event.type === 'todo.archived',
  async handle(event) { /* ... */ },
};
```

Then register it in `src/events/handlers/index.js`. Forgetting that second step
is the most common mistake — the handler compiles, ships, and never runs.

## Gotchas

- **This is the seam static analysis cannot cross.** The publisher names an event
  type string; the handler names a predicate. Grep finds both ends only because
  the string happens to match — rename it on one side and nothing fails at build
  time.
- **An event with no matching handler is silently dropped.** No error, no log, no
  dead-letter. `publish` returns early on no match.
- **Only the first matching handler runs.** Two handlers answering true for the
  same event means the second never fires, with no warning.
- **Handler failures never reach the caller.** They are caught inside
  `queueMicrotask` and logged.
