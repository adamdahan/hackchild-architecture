---
name: trace
description: Trace a feature across the mobile app and the backend and write it up. With no argument, traces what you just changed on your current branches.
argument-hint: leave empty to trace what you just built, or name a feature — "creating a todo"
agent: agent
---

Trace it end to end and write it up. Every repository is open in this workspace —
use them all. Never describe one side and guess at the other.

## First: work out what you are tracing

**If the user named something**, trace that.

**If they did not**, they mean the work they just did. Find it — check every
repository in the workspace, not just the one that is focused:

```sh
for r in hackchild-mobile hackchild-backend; do
  echo "── $r ── $(git -C $r branch --show-current)"
  git -C $r status --short
  git -C $r diff --stat
  git -C $r diff --stat "$(git -C $r merge-base HEAD origin/main 2>/dev/null || echo main)"...HEAD
done
```

That covers uncommitted work, staged work, and everything on the branch since it
left `main` — people run this mid-feature as often as after merging.

**Say what you found before you start**, in one line per repo, and let them
correct you:

> Tracing `feat/streak-freeze` — 3 files in backend, 2 in mobile. Starting from
> `POST /todos/:id/freeze`.

If nothing has changed anywhere, say so and ask what they want traced instead of
guessing.

## Then: check nobody has already written it

```sh
grep -i '<the feature, plus two or three synonyms>' hackchild-architecture/index/manifest.tsv
```

If a document already covers it, **stop and open it.** If your change made part
of it wrong, update that part and say which sentences you changed. Two documents
about one feature is worse than none — they disagree and nobody knows which to
believe.

## Follow the real path through the code

Start where the user touches it and follow it the whole way: screen → hook or
client call → HTTP request → route → validation → store or database → any event
published → every handler that reacts.

When working from a diff, read the **whole** file around each change, not just
the changed lines. A three-line diff can move the meaning of a function you have
not read.

Pay attention to:

- **Where the two sides disagree** — a field the client sends that the server
  ignores, an optimistic value that never matches what comes back.
- **What is fire-and-forget** — anywhere a `200` does not mean the work finished.
- **What silently does nothing** when you get it wrong.

## Write it to `hackchild-architecture/docs/<domain>/<slug>.md`

`<domain>` is the part of the product — `todos`, `platform`, `onboarding`. Reuse
a folder if one fits. Copy the shape of an existing document.

```yaml
---
kind: flow                # flow if it crosses both repos, mechanism if one
domain: todos
status: verified
vantage: cross-stack      # or backend-only / mobile-only
verified_on: <today, YYYY-MM-DD>
verified_by: <the user's github handle>
keywords: <what someone would actually type looking for this>
sources:
  - repo: hackchild-backend
    path: src/routes/todos.route.js
    blob: <git -C hackchild-backend hash-object src/routes/todos.route.js>
---
```

**5 to 15 specific files. Never a folder, never a wildcard.** Only files whose
contents this document actually describes. Watch too much and every unrelated
commit flags the document, people learn to ignore the flags, and the whole thing
quietly stops working.

If you traced uncommitted work, the fingerprints you record are of files that do
not exist on `main` yet. That is fine and expected — set `status: observed` and
say in your summary that it becomes `verified` once the code merges.

## The Gotchas section is the point

Everything else can be re-derived by re-reading the code. Gotchas cannot. They
are the reasons, the hazards, and the things that have bitten someone.

Write what you actually found — a real inconsistency between the two sides, a
value that looks safe to delete and is not, an ordering that matters. If you
suspect something but could not confirm it, say so in those words.

**Then ask the user what bit them while they were building this, and write down
what they say.** They know things the code does not record — that is the entire
reason this document is worth more than the diff. Do not invent one to fill the
section; an invented gotcha is worse than an empty one, because someone will act
on it.

## Regenerate the index and hand it back

```sh
cd hackchild-architecture && node tools/build-index.mjs
```

Then tell them, briefly: the path you wrote, the files you listed and why, the
gotchas you recorded, and that they should read it before committing — you
traced the code, but they are the one who knows whether it is *right*.

Do not commit or push. That is theirs.
