---
status: verified
vantage: cross-stack
kind: flow
domain: todos
keywords: complete todo, PATCH, idempotent, todo.completed, streak, fire and forget, 404 NOT_FOUND
verified_on: 2026-08-11
verified_by: adamdahan
sources:
  - repo: hackchild-mobile
    path: src/features/todos/useTodos.ts
    blob: 033d7bc549b7498c3781e9f6e192c30b1a5c2e13
  - repo: hackchild-backend
    path: src/routes/todos.route.js
    blob: 77870bee996de3f4c9934c10943f707121449787
  - repo: hackchild-backend
    path: src/events/bus.js
    blob: a26559b1f4ca31a86d1b4ea0d6ca839b7ce3e1d4
  - repo: hackchild-backend
    path: src/events/handlers/streak.handler.js
    blob: e7bcb149b11270aab9ad98649c0cfd1dff387d46
---

# Completing a Todo

Tapping a row marks it done and, asynchronously, advances the completion streak.

## Flow

1. User taps a row; `useCompleteTodo` PATCHes `/v1/todos/:id/complete`.
2. The route calls `TodoStore.complete(id)`, which returns `null` for an unknown
   id (`404 NOT_FOUND`) and is a no-op for an already-completed todo.
3. The route publishes `{ type: 'todo.completed' }` onto the in-process bus and
   returns immediately — the response does not wait for the handler.
4. `streakHandler` matches the event by predicate and increments the streak on a
   microtask.
5. Mobile invalidates `['todos']` and refetches.

## Gotchas

- **The streak update is fire-and-forget.** The 200 response says nothing about
  whether the streak advanced. If the handler throws, the client never learns —
  it is logged and swallowed in `bus.publish`.
- **Completion is idempotent, so retries are safe** — but the event fires only
  on the first completion, because `complete()` returns early for an
  already-completed todo. Replaying a request will not double-count the streak.
- **Nothing in `todos.route.js` names `streakHandler`.** The only link between
  them is the `canHandle` predicate. See
  [mechanisms/backend/event-bus.md](../mechanisms/backend/event-bus.md).
