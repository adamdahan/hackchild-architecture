---
status: verified
vantage: cross-stack
kind: flow
domain: todos
keywords: create todo, optimistic update, clientId, TITLE_REQUIRED, react-query, onMutate, TodoStore.create, id minting
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
   and calls `TodoStore.create({ id: clientId, title })`.
6. `onSettled` invalidates `['todos']`, which refetches and replaces the
   optimistic row with the persisted one.

## Gotchas

- **The id is minted on the client, not the server.** `POST /v1/todos` honours
  `clientId` verbatim. This is deliberate — it means the optimistic row and the
  persisted row are the same record, so the list does not flicker on reconcile.
  If you ever make the server mint ids, the optimistic update breaks silently:
  you get a duplicate row for a moment, not an error.
- **The optimistic row is inserted with `id: 'pending'`, not the clientId.**
  That is a real inconsistency in the current code — the placeholder uses a
  literal while the request uses a fresh UUID. Two rapid creates therefore
  collide on `keyExtractor`. Worth fixing; documented here because it is not
  obvious from either file alone.
- **Validation is server-side only.** The screen will happily fire a request for
  a whitespace-only title if submitted through any path other than the
  `onSubmitEditing` guard.
