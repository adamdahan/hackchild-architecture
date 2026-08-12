---
name: trace
description: Trace a feature across the mobile app and the backend, then write the analysis into the architecture repo.
argument-hint: the feature to trace — e.g. "creating a todo", "the streak counter"
agent: agent
---

Trace **${input:feature:which feature?}** end to end and write it up.

You have every repository open in this workspace. Use them. Do not answer from
one side and guess at the other — that is the entire failure this exists to
prevent.

## 1. Check nobody has already done this

```sh
grep -i '<the feature, and two or three synonyms>' hackchild-architecture/index/manifest.tsv
```

If a document already covers it, **stop.** Open it, tell the user it exists, and
offer to update it instead. Writing a second document about the same thing is
worse than writing none — the two disagree and nobody knows which to believe.

## 2. Follow the actual path through the code

Start where the user touches it and follow it all the way through. For a mobile
feature that means: the screen, the hook or client call, the HTTP request, the
backend route, validation, the store or database, any event published, and every
handler that reacts to it.

Read the real files. Do not infer a backend from the shape of an API call.

Note especially:

- **Where the two sides disagree** — a field the client sends that the server
  ignores, an optimistic value that never matches what comes back.
- **What is fire-and-forget** — anything where a `200` does not mean the work
  finished.
- **What silently does nothing** when you get it wrong.

## 3. Write it to `hackchild-architecture/docs/<domain>/<slug>.md`

`<domain>` is the part of the product — `todos`, `platform`, `onboarding`. Match
an existing folder if one fits; create one if none does.

Copy the shape of an existing document. Frontmatter first:

```yaml
---
kind: flow                # flow if it crosses both repos, mechanism if one
domain: todos
status: verified
vantage: cross-stack      # or backend-only / mobile-only
verified_on: <today, YYYY-MM-DD>
verified_by: <the user's github handle>
keywords: <words someone would actually type when looking for this>
sources:
  - repo: hackchild-backend
    path: src/routes/todos.route.js
    blob: <see below>
---
```

**`sources` must list 5 to 15 specific files. Never a folder, never a wildcard.**
Only the files whose contents this document actually describes. Watch too much
and every unrelated commit flags the document, people learn to ignore the flags,
and the whole system quietly stops working.

Get each fingerprint by running, from inside that repository:

```sh
git -C hackchild-backend hash-object src/routes/todos.route.js
```

Then the body: what the feature does, the numbered path through the code, and a
**`## Gotchas`** section.

## 4. The Gotchas section is the point

Everything else in the document can be re-derived by reading the code. Gotchas
cannot. They are the reasons, the hazards, and the things that have bitten
someone.

Write down what you actually found — a real inconsistency between the two sides,
a value that looks safe to remove and is not, an ordering that matters. If you
have a suspicion you could not confirm, say so in those words rather than
asserting it.

**Ask the user whether anything has burned them here, and write down what they
say.** They know things the code does not record. Do not invent a gotcha to fill
the section — an invented one is worse than an empty one, because someone will
act on it.

## 5. Regenerate the index and hand it back

```sh
cd hackchild-architecture && node tools/build-index.mjs
```

Then tell the user, briefly:

- the path you wrote
- the files you listed as sources, and why those
- the gotchas you recorded
- that they should read it before committing — you traced the code, but they are
  the one who knows whether it is *right*

Do not commit or push. Leave that to them.
