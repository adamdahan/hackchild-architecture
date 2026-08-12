---
name: verify
description: Re-check a document against the code it was written from, fix what is no longer true, and refresh its fingerprints.
argument-hint: leave empty to check everything flagged, or name a document — "creating a todo"
agent: agent
---

Check whether a document still tells the truth, and repair it if it does not.

This is the by-hand version of what runs overnight. Use it when you are looking
at a document marked `stale` or `needs-review`, when you are reviewing a repair
pull request and want to confirm it, or when you have just changed code and want
the documents caught up now rather than tomorrow.

## Pick the document

**If the user named one**, use it.

**If they did not**, find everything currently flagged:

```sh
awk -F'\t' '$5!="verified" {print $5"\t"$1}' hackchild-architecture/index/manifest.tsv
```

If nothing is flagged, say so and stop. Do not go looking for work.

## Find out what actually moved

The frontmatter lists source files and the fingerprint each had when the
document was written. Compare against the code as it stands now:

```sh
git -C hackchild-backend hash-object src/routes/todos.route.js
```

For every file whose fingerprint no longer matches, read what changed:

```sh
git -C hackchild-backend log -p --since='60 days' -- src/routes/todos.route.js
```

Report which files moved and which did not, before you touch the prose. If none
moved, the document is fine and only its status needs correcting — say that
rather than editing paragraphs for the sake of it.

## Now read the words against the change

Go through the document a claim at a time. For each one, decide: still true,
now false, or no longer mentioned by the code at all.

**Quote back every sentence the change made untrue**, in the user's own words
from the document, before you rewrite anything. That list is the whole point of
this exercise — a claim that quietly stopped being true is exactly the failure
this system exists to catch, and the person reading needs to see what they had
been believing.

Then fix them. Patch only what the change actually affects; leave every other
section alone.

## Gotchas need more care than the rest

A gotcha can be made false by a code change, and a false gotcha is worse than no
gotcha, because someone will act on it.

If the hazard it warned about has become the normal behaviour, **rewrite it to
describe the new hazard** rather than deleting the entry. If it has genuinely
gone away, say so out loud to the user before removing it — that is a decision
they should make knowingly.

## Set the status honestly

Refresh the `blob` values for the files that moved, and set `verified_on` to
today.

Then set `status`:

- **`verified`** — only if you read every affected claim and none are left
  outstanding.
- **`needs-review`** — if anything is unresolved, if you could not reach a file,
  or if you are unsure. A refreshed fingerprint is not the same as a checked
  document, and stamping `verified` on unread prose is the one failure that makes
  the entire system untrustworthy.

Never set `verified` on the basis of fingerprints alone.

## Then regenerate the index

```sh
cd hackchild-architecture && node tools/build-index.mjs
```

Tell the user which files moved, which sentences you changed, and what status
you landed on and why. Do not commit — leave that to them.
