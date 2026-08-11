---
name: hackchild-architecture-docs
description: Use when the user asks about any hackchild application flow, screen behaviour, end-to-end sequence, feature implementation, or mobile/backend architecture. Triggers include questions about how a feature works, what happens when a user does X, creating or completing todos, optimistic updates, the event bus, API contracts, and any "how does X work in the app" question. Greps the document manifest and opens only the matching document — never the whole repository.
argument-hint: The feature, screen, or flow to look up (e.g. "creating a todo", "event bus", "optimistic updates")
---

# hackchild Architecture Docs

## Purpose

`docs/` holds one document per analysed feature, covering how it works across
both the mobile app and the backend service. Use this skill whenever someone
asks how something works.

## When to invoke

- "How does [feature] work?"
- "What happens when a user does [action]?"
- "Walk me through the [flow] flow"
- "What fires when...?"
- Any question about a specific screen, endpoint, or system behaviour

---

## Lookup procedure

### Step 1 — Grep the manifest. Do not read it.

`index/manifest.tsv` has one tab-separated line per document:

```
path  kind  domain  repos  status  title  keywords  summary
```

**Search it, never load it.** Reading the whole manifest costs tokens in
proportion to how many documents exist; grepping costs the same handful of
matching lines whether the repository holds ten documents or ten thousand. This
is the single most important instruction in this file.

```sh
grep -i 'optimistic update' index/manifest.tsv
grep -iE 'webhook|settlement' index/manifest.tsv
```

Match against the user's own words first. If nothing hits, try synonyms and the
identifiers they would have used — a function name, an event name, an endpoint.

Narrow with the columns when a broad term returns too much:

```sh
awk -F'\t' '$3=="payments" && $2=="flow"' index/manifest.tsv    # one domain, flows only
awk -F'\t' '$4 ~ /mobile/'                index/manifest.tsv    # anything touching mobile
```

### Step 2 — Fall back to searching the documents themselves

If the manifest gives nothing, grep `docs/` directly. A miss here is a signal
worth surfacing: say plainly that no document covers it, because the gap is
more useful to the team than a guess.

### Step 3 — Read only the matching document(s)

Open the file the grep pointed at. Do not read neighbouring documents "for
context" — that is exactly the cost this system exists to avoid.

### Step 4 — Check the frontmatter before answering

| Field | What it means for your answer |
|---|---|
| `status: verified` | Fingerprints match the code. Answer normally. |
| `status: stale` | The source code has changed since this was written. **Say so before answering**, name the affected sections, and verify any load-bearing claim against the code. |
| `status: needs-review` | Fingerprints were refreshed but the prose is unaudited. Treat exactly as `stale`. |
| `status: observed` | Written from one side of the stack only. Trust it about that side; treat the other as inference. |
| `vantage` | `backend-only` cannot be relied on for mobile behaviour, and vice versa. |

### Step 5 — Answer

Use the document. If it does not fully answer the question, supplement with a
targeted search in the source repositories — and say which parts came from the
document and which from the code.

**Code wins.** When a document and the codebase disagree, trust the codebase,
say so out loud, and flag the document as stale.

---

## After doing new cross-repository analysis

If you had to open both repositories to answer something and no document
covered it, that is a gap worth filling:

1. Write the document into `docs/<domain>/<slug>.md`
2. Add frontmatter — `kind`, `domain`, `keywords`, `status`, `vantage`,
   `verified_on`, `verified_by`, and `sources`
3. List **5 to 15 specific source files**. Never a directory, never a glob.
   Watching too much makes every unrelated commit flag the document, people
   learn to ignore the flags, and the system quietly stops working.
4. Include a **Gotchas** section — the things that were not derivable from the
   code. That is the part that never expires.
5. Run `node tools/build-index.mjs` to regenerate the manifest

Do not write a document from one repository's vantage and file it as
cross-stack. Set `vantage` honestly and `status: observed`.
