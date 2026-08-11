---
status: verified
vantage: cross-stack
verified_on: 2026-08-11
verified_by: adamdahan
sources:
  - repo: hackchild-mobile
    path: src/features/todos/useTodos.ts
    blob: 033d7bc549b7498c3781e9f6e192c30b1a5c2e13
  - repo: hackchild-mobile
    path: src/api/client.ts
    blob: 76e99b5afa1d398dfe663c8cb2846076d256f0a4
  - repo: hackchild-backend
    path: src/routes/todos.route.js
    blob: 9153d9bcc0e05f8023b2377526ddc99a0f25e8a0
  - repo: hackchild-backend
    path: src/store/todo.store.js
    blob: 7f74238b3872b5ea216ec3c1ceb09cbb129e4507
---

# Creating a Todo

What happens between typing a title and the row existing on the server.

## Flow

1. User types a title and submits on `TodoListScreen`.
2. `useCreateTodo.onMutate` writes an optimistic row into the `['todos']` query
   cache before any network call happens.
3. `mutationFn` mints a UUID client-side and POSTs `{ title, clientId }` to
   `/v1/todos`.
4. `request()` attaches `x-client-locale` and `content-type` headers.
5. The backend route trims the title, rejects empty with `422 TITLE_REQUIRED`,
   and calls `TodoStore.create({ title })`. The `clientId` sent by the client is
   ignored — the store mints its own id server-side.
6. `onSettled` invalidates `['todos']`, which refetches and replaces the
   optimistic row with the persisted one.

## Gotchas

- **The id is now minted on the server, not the client.** `POST /v1/todos`
  ignores the `clientId` the mobile app sends and generates its own id in
  `TodoStore.create`. This means the optimistic row (keyed by the client's
  UUID, or the `'pending'` placeholder — see below) is never the same record as
  the persisted one. On reconcile, the optimistic row is replaced rather than
  matched, which can produce a brief duplicate/flicker in the list. If you need
  the old flicker-free behaviour back, the server would need to honour
  `clientId` again.
- **The optimistic row is inserted with `id: 'pending'`, not the clientId.**
  That is a real inconsistency in the current code — the placeholder uses a
  literal while the request uses a fresh UUID. Two rapid creates therefore
  collide on `keyExtractor`. Worth fixing; documented here because it is not
  obvious from either file alone.
- **Validation is server-side only.** The screen will happily fire a request for
  a whitespace-only title if submitted through any path other than the
  `onSubmitEditing` guard.
