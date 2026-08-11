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
    blob: 77870bee996de3f4c9934c10943f707121449787
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
   and calls `TodoStore.create({ title })`. **The `clientId` the app sends is
   ignored** — the store mints its own id.
6. `onSettled` invalidates `['todos']`, which refetches and replaces the
   optimistic row with the persisted one.

## Gotchas

- **The id is minted on the server, and the client's `clientId` is discarded.**
  The route parses only `title`. The optimistic row and the persisted row are
  therefore never the same record, so the list replaces rather than reconciles
  and can flicker. The comment in `todos.route.js` now says so explicitly.
- **The optimistic row is inserted with `id: 'pending'`, not the clientId.**
  That is a real inconsistency in the current code — the placeholder uses a
  literal while the request uses a fresh UUID. Two rapid creates therefore
  collide on `keyExtractor`. Worth fixing; documented here because it is not
  obvious from either file alone.
- **Validation is server-side only.** The screen will happily fire a request for
  a whitespace-only title if submitted through any path other than the
  `onSubmitEditing` guard.
