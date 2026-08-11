---
name: hackchild-architecture-docs
description: Use when the user asks about any hackchild application flow, screen behaviour, end-to-end sequence, feature implementation, or mobile/backend architecture. Triggers include questions about how a feature works, what happens when a user does X, creating or completing todos, optimistic updates, the event bus, locale handling, API contracts, and any "how does X work in the app" question. Looks up the hackchild-architecture index and fetches only the relevant document(s) — never the whole repo.
argument-hint: The feature, screen, or flow to look up (e.g. "creating a todo", "event bus", "optimistic updates")
---

# hackchild Architecture Docs

## Purpose

`hackchild-architecture` is the single source of truth for how the hackchild
stack works across `hackchild-mobile` and `hackchild-backend`. Use this skill
whenever someone asks how something works in the app.

This skill file lives inside the repo, so anyone who has the folder in their
workspace has the skill automatically. Nothing to install.

## When to invoke

- "How does [feature] work?"
- "What happens when a user does [action]?"
- "Walk me through the [flow] flow"
- "What fires when...?"
- Any question about a specific screen, endpoint, or system behaviour

## Lookup procedure

**Do not read every file in the repo.**

### Step 1 — Read the index

Read `README.md` at the repo root. It lists every document with its path,
description, and key topics. Scan the key-topics column to find the match.

### Step 2 — Search if the index is unclear

Grep this repo by keyword. Only if that also fails, fall back to reading the
source repos directly.

### Step 3 — Read only the matching document(s)

Read the specific file(s) identified. Do not read unrelated documents.

### Step 4 — Check the status before answering

Every document's frontmatter carries a `status`:

- **`verified`** — answer normally.
- **`stale`** — the source code has changed since the document was written.
  Say so *before* answering, name which sections are affected, and verify any
  load-bearing claim against the code in the source repo.
- **`observed`** — written from one side of the stack only. Trust what it says
  about that side; treat claims about the other side as inference and verify.

Also check `vantage`. A `backend-only` document cannot be relied on for mobile
behaviour, and vice versa.

### Step 5 — Answer

Use the document. If it does not fully answer the question, supplement with a
targeted search in `hackchild-backend/src` or `hackchild-mobile/src` — and say
which parts came from the document versus the code.

## After doing new cross-repo analysis

If you had to open both repositories to answer something, and no document
covered it, that is a gap worth filling:

1. Write the document into `flows/` (cross-repo) or `mechanisms/<repo>/`
2. Add frontmatter with `sources` and a `blob` for each — `git hash-object <file>`
3. Include a **Gotchas** section: the things that were not derivable from the code
4. Add the index row in `README.md`
5. Run `node tools/build-watchers.mjs`

Do **not** write a document from a single-repo vantage and file it as
cross-stack. Set `vantage: backend-only` or `mobile-only` and `status: observed`
so the next reader knows how far to trust it.
