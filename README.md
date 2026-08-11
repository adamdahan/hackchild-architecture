# hackchild-architecture — Knowledge Repository Index

Single source of truth for how the hackchild stack actually works across
`hackchild-mobile` and `hackchild-backend`.

When an AI agent needs context for a flow or feature it should:

1. Scan this index to find the matching document(s)
2. Search this repo by keyword if the index gives no clear match
3. Read **only** the relevant file(s) — never the whole repo

---

## What belongs here

| Write a document when | Don't bother when |
|---|---|
| You had to open **both repositories** to answer the question | The whole answer lives in one repo, in a straight line |
| The trail went cold at a seam — an event bus, a webhook, a feature flag | An assistant gets it right by reading one file on demand |
| An incident taught you something the code does not say | It's a rename, a config value, or already obvious |

**Flows** are cross-repo by definition. **Mechanisms** live in one repo, which is
why `mechanisms/` subdivides by repo and `flows/` does not.

---

## Document Index

### `flows/` — cross-repo behaviour

| File | Description | Key topics |
|---|---|---|
| [flows/creating-a-todo.md](flows/creating-a-todo.md) | Typing a title through to a persisted row — optimistic cache write, client-minted id, server validation | create todo, optimistic update, clientId, TITLE_REQUIRED, react-query, onMutate, TodoStore.create |
| [flows/completing-a-todo.md](flows/completing-a-todo.md) | Tapping a row through to the streak advancing asynchronously | complete todo, PATCH, idempotent, todo.completed, streak, fire and forget, 404 NOT_FOUND |

### `mechanisms/backend/` — backend internals

| File | Description | Key topics |
|---|---|---|
| [mechanisms/backend/event-bus.md](mechanisms/backend/event-bus.md) | How a published event finds its handler, and every way it can silently not | event bus, publish, register, canHandle, handler, microtask, silently dropped, adding a handler |

---

## Document status

Every document declares the source files it was written from, plus the git blob
SHA of each at the moment of writing. A nightly job compares those fingerprints
against live code.

| Status | Meaning |
|---|---|
| `verified` | Fingerprints match; written with both repos open |
| `stale` | Source code has changed since; may still be correct, needs re-checking |
| `observed` | Written from one side only — the far side is inference |

**Read the status before trusting a document.** A stale document is not
necessarily wrong, but it has not been checked since the code moved.

---

## Tools

```bash
node tools/check-fingerprints.mjs --remote --owner adamdahan   # against GitHub
node tools/check-fingerprints.mjs --local ../                  # against local clones
node tools/build-watchers.mjs                                  # regenerate index/watchers.json
```

`index/watchers.json` maps every watched source file to the documents that cite
it. It is generated — never edit it by hand.

---

## Adding a document

1. Put it in `flows/` or `mechanisms/<repo>/`
2. Add frontmatter: `status`, `vantage`, `verified_on`, `verified_by`, `sources`
3. Fill each source's `blob` with `git hash-object <file>` from that repo
4. Add a row to the index above with its path, description, and key topics
5. Run `node tools/build-watchers.mjs`

Keep a **Gotchas** section in every document. It is the part that never expires,
because it was never derivable from the code in the first place.
