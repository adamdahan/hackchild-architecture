#!/usr/bin/env node
/**
 * propose-repair — for every document whose sources have moved, work out what
 * changed, refresh the fingerprints, and emit a pull-request body describing
 * the change so a human can confirm the prose still holds.
 *
 * This is the mechanical half of the loop: it always knows *which* sections are
 * affected and *what* changed underneath them. When ANTHROPIC_API_KEY is
 * present the workflow additionally hands this context to an agent to rewrite
 * the affected prose; without it, the PR still lands and asks a human to look.
 *
 *   node tools/propose-repair.mjs --owner adamdahan
 *
 * Writes:  .repair/pr-body.md, .repair/assignees.txt, .repair/summary.json
 * Exit 0 = nothing to repair. Exit 10 = a repair was proposed.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

const DOC_ROOT = 'docs';
const OUT_DIR = '.repair';

const owner = (() => {
  const i = process.argv.indexOf('--owner');
  return i === -1 ? 'adamdahan' : process.argv[i + 1];
})();

const gh = (args) => {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- parsing

function parse(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;

  const meta = { sources: [] };
  let current = null;

  for (const line of text.slice(4, end + 1).split('\n')) {
    if (!line.trim()) continue;
    const item = line.match(/^\s*-\s+(\w+):\s*(.+?)\s*$/);
    if (item) {
      current = { [item[1]]: item[2] };
      meta.sources.push(current);
      continue;
    }
    const nested = line.match(/^\s{4,}(\w+):\s*(.+?)\s*$/);
    if (nested && current) {
      current[nested[1]] = nested[2];
      continue;
    }
    const top = line.match(/^(\w+):\s*(.*?)\s*$/);
    if (top) {
      current = null;
      if (top[1] !== 'sources') meta[top[1]] = top[2];
    }
  }
  return meta;
}

async function findDocs(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await findDocs(full)));
    else if (e.name.endsWith('.md') && e.name !== 'README.md') out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- github

const treeCache = new Map();

/** One Git Trees call per repository, cached. Keeps this O(repos), not O(files). */
function currentSha(repo, path) {
  if (!treeCache.has(repo)) {
    const raw = gh(['api', `repos/${owner}/${repo}/git/trees/main?recursive=1`,
                    '--jq', '[.tree[] | select(.type=="blob") | {path, sha}]']);
    const map = new Map();
    try {
      for (const b of JSON.parse(raw ?? '[]')) map.set(b.path, b.sha);
    } catch { /* leave empty; treated as unchanged rather than deleted */ }
    treeCache.set(repo, map);
  }
  return treeCache.get(repo).get(path) ?? null;
}

/** The commit that most recently touched this path — who to ask for review. */
function lastCommit(repo, path) {
  const raw = gh([
    'api',
    `repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
    '--jq',
    '.[0] | {sha: .sha, login: (.author.login // ""), message: (.commit.message | split("\n")[0]), date: .commit.author.date}',
  ]);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Unified diff of the source file, so the reviewer sees what actually moved. */
function diffFor(repo, sha, path) {
  const raw = gh([
    'api',
    `repos/${owner}/${repo}/commits/${sha}`,
    '--jq',
    `.files[] | select(.filename == "${path}") | .patch // ""`,
  ]);
  return raw ?? '';
}

// ---------------------------------------------------------------- main

const root = resolve(process.cwd());
const docs = (await findDocs(join(root, DOC_ROOT))).sort();

const repairs = [];
const assignees = new Set();

for (const file of docs) {
  const text = readFileSync(file, 'utf8');
  const meta = parse(text);
  if (!meta?.sources.length) continue;

  const moved = [];
  for (const src of meta.sources) {
    const actual = currentSha(src.repo, src.path);
    if (actual && actual !== src.blob) moved.push({ ...src, actual });
  }
  if (!moved.length) continue;

  const rel = relative(root, file);
  const details = [];

  let updated = text;
  for (const m of moved) {
    updated = updated.replace(m.blob, m.actual);

    const commit = lastCommit(m.repo, m.path);
    if (commit?.login) assignees.add(commit.login);

    details.push({
      repo: m.repo,
      path: m.path,
      from: m.blob,
      to: m.actual,
      commit: commit?.sha?.slice(0, 7) ?? '?',
      message: commit?.message ?? '',
      login: commit?.login ?? '',
      patch: commit?.sha ? diffFor(m.repo, commit.sha, m.path) : '',
    });
  }

  // Fingerprints now match again — but NOTHING has checked the prose yet.
  //
  // Marking this `verified` here would be a lie: `verified` means a human
  // confirmed the words are still true, not that the SHAs line up. Stamping it
  // on a fingerprint refresh alone certifies stale prose as accurate, which is
  // strictly worse than leaving it flagged.
  //
  // `needs-review` is the honest state: the code moved, the fingerprints have
  // caught up, and the sentences are unaudited. Only agent-repair (after a
  // successful prose patch) may promote it to `verified`.
  updated = updated.replace(/^status:.*$/m, 'status: needs-review');

  writeFileSync(file, updated, 'utf8');
  repairs.push({ doc: rel, moved: details });
}

if (!repairs.length) {
  console.log('nothing to repair');
  process.exit(0);
}

// ---------------------------------------------------------------- pr body

mkdirSync(OUT_DIR, { recursive: true });

const lines = [
  'The source files behind these documents have changed. Fingerprints have been',
  'refreshed in this PR — **what needs a human is whether the prose is still true.**',
  '',
];

for (const r of repairs) {
  lines.push(`## \`${r.doc}\``, '');
  for (const m of r.moved) {
    lines.push(
      `**\`${m.repo}/${m.path}\`** — ${m.commit} ${m.message}${m.login ? ` (@${m.login})` : ''}`,
      '',
      `\`${m.from.slice(0, 12)}\` → \`${m.to.slice(0, 12)}\``,
      ''
    );
    if (m.patch) {
      const patch = m.patch.split('\n').slice(0, 40).join('\n');
      lines.push('```diff', patch, '```', '');
    }
  }
  lines.push(
    '**Check:** does every claim in this document still hold after that change?',
    'If yes, merge — it returns to `verified`. If not, edit the affected section here.',
    ''
  );
}

writeFileSync(join(OUT_DIR, 'pr-body.md'), lines.join('\n'), 'utf8');
writeFileSync(join(OUT_DIR, 'assignees.txt'), [...assignees].join(','), 'utf8');
writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(repairs, null, 2), 'utf8');

console.log(`proposed repair for ${repairs.length} document(s)`);
for (const r of repairs) console.log(`  ${r.doc}  (${r.moved.length} source(s) moved)`);
console.log(`assignees: ${[...assignees].join(', ') || '(none resolved)'}`);

process.exit(10);
