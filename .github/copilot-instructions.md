# Working in this repository

## Architecture questions — check the documents first

`docs/architecture/` holds written analyses of how features work **across both
the mobile app and the backend service**. Much of what they describe is code
that does not exist in this repository at all.

**Before answering any question about how a feature works, what happens when a
user does something, or how two parts of the system connect — search the
manifest.** Do not answer from the code in front of you alone; you will only
see half the system.

### How to look something up

1. **Grep, do not read.** `docs/architecture/manifest.tsv` is one tab-separated
   row per document: `path · kind · domain · repos · status · title · keywords ·
   summary`.

   ```
   grep -i '<term>' docs/architecture/manifest.tsv
   ```

   Search the user's own words first, then synonyms and identifiers — a function
   name, an event name, an endpoint. Never load the whole manifest.

2. **Open only the matching document**, at the path in column 1 (relative to
   `docs/architecture/`). Do not read neighbouring documents for context.

3. **Check `status` in the frontmatter before answering:**

   - `verified` — fingerprints match the code. Answer normally.
   - `stale` — the source code changed after this was written. **Say so before
     answering**, name the affected sections, verify load-bearing claims.
   - `needs-review` — fingerprints were refreshed but **nobody has audited the
     prose**. Treat exactly as `stale`.
   - `observed` — written from one side of the stack only. Treat claims about
     the other side as inference.

4. **Open your answer by citing the source, on its own line, before anything
   else.** Exactly this shape:

   ```
   📄 docs/architecture/todos/creating-a-todo.md · status: verified · cross-stack
   ```

   If no document matched, say so just as plainly:

   ```
   📄 no matching document — answering from code in this repository only
   ```

   This is not decoration. A reader needs to know whether they are getting a
   written analysis of both repositories or a guess from the half of the system
   that happens to be open, and they should not have to infer it from tone.

5. **Then answer**, distinguishing what came from the document from what came
   from code you can see.

### Rules

- **Code wins.** If a document and the codebase disagree, trust the codebase,
  say so, and note the document looks stale.
- **The Gotchas section is the highest-value part** of any document — reasons,
  hazards, and lessons from incidents that are not derivable from the code.
  Surface relevant gotchas even when not directly asked.
- **Never edit anything under `docs/architecture/`.** It is generated and
  overwritten on every sync. Corrections belong in the source repository.

### If you find the same document in two repositories

They are mirrors of one source, not two documents. Identical copies are the
normal case. **If they disagree, one clone is simply out of date** — check
`docs/architecture/SYNCED-FROM.txt` in each; the one with the older `commit` is
stale.

Resolve against the code, answer once, and tell the user which clone needs a
`git pull`. Do not present it as a contradiction in the documentation.

### If nothing matches

Say plainly that no document covers it, then answer from the code you can see —
and be explicit that your view stops at this repository's boundary. A missing
document is useful information for the team; a confident guess is not.
