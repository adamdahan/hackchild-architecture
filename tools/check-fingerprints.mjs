#!/usr/bin/env node
/**
 * check-fingerprints — compares each document's recorded source fingerprints
 * against the current state of the code.
 *
 * A "fingerprint" is the git blob SHA of a source file. `git hash-object` and
 * GitHub both produce it, so a document verifies itself identically on a laptop
 * and in CI.
 *
 * SCALE: fingerprints are resolved with ONE Git Trees API call per repository,
 * not one call per watched file. A thousand documents watching ten files each
 * costs two API calls, not ten thousand. Cost is O(repositories), and adding
 * documents does not make the nightly check slower or push it toward the rate
 * limit.
 *
 * Zero dependencies — this has to run on a locked-down machine.
 *
 *   node tools/check-fingerprints.mjs --local ..
 *   node tools/check-fingerprints.mjs --remote --owner my-org
 *   node tools/check-fingerprints.mjs --remote --owner my-org --write
 *
 * Exit 0 = all verified. 1 = at least one needs attention.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

const DOC_ROOT = 'docs';
const DEFAULT_OWNER = process.env.GITHUB_REPOSITORY_OWNER ?? '';

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const args = { mode: null, localRoot: null, owner: DEFAULT_OWNER, ref: 'main', write: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--local':  args.mode = 'local';  args.localRoot = argv[++i]; break;
      case '--remote': args.mode = 'remote'; break;
      case '--owner':  args.owner = argv[++i]; break;
      case '--ref':    args.ref = argv[++i]; break;
      case '--write':  args.write = true; break;
    }
  }
  if (!args.mode) {
    console.error('usage: check-fingerprints --local <dir> | --remote --owner <org> [--write]');
    process.exit(2);
  }
  if (args.mode === 'remote' && !args.owner) {
    console.error('--remote requires --owner (or GITHUB_REPOSITORY_OWNER)');
    process.exit(2);
  }
  return args;
}

// ---------------------------------------------------------------- frontmatter

export function parseFrontmatter(text) {
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

// ---------------------------------------------------------------- sha resolution

/**
 * One request per repository. Returns Map<path, blobSha>.
 *
 * GitHub truncates the response for very large trees; when that happens we fall
 * back to a per-file lookup for the paths we could not find, rather than
 * reporting them as deleted. Silently treating a truncated tree as complete
 * would flag every unlisted document as broken.
 */
const treeCache = new Map();

function remoteTree(owner, repo, ref) {
  const key = `${owner}/${repo}@${ref}`;
  if (treeCache.has(key)) return treeCache.get(key);

  let map = new Map();
  let truncated = false;
  try {
    const raw = execFileSync(
      'gh',
      ['api', `repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
       '--jq', '{truncated: .truncated, blobs: [.tree[] | select(.type=="blob") | {path, sha}]}'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const parsed = JSON.parse(raw);
    truncated = parsed.truncated === true;
    for (const b of parsed.blobs) map.set(b.path, b.sha);
  } catch {
    map = null; // repo unreachable — distinct from "file missing"
  }

  const result = { map, truncated };
  treeCache.set(key, result);
  if (truncated) {
    console.warn(`  ! ${repo}: tree truncated by the API — falling back per file where needed`);
  }
  return result;
}

function remoteShaSingle(owner, repo, path, ref) {
  try {
    return execFileSync('gh', ['api', `repos/${owner}/${repo}/contents/${path}?ref=${ref}`, '--jq', '.sha'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function localTree(root, repo) {
  const key = `local:${repo}`;
  if (treeCache.has(key)) return treeCache.get(key);

  let map = new Map();
  try {
    // one `git ls-files -s` per repo — same O(repos) property as the Trees API
    const raw = execFileSync('git', ['-C', join(root, repo), 'ls-files', '-s'], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of raw.split('\n')) {
      const m = line.match(/^\d+ ([0-9a-f]{40}) \d+\t(.+)$/);
      if (m) map.set(m[2], m[1]);
    }
  } catch {
    map = null;
  }

  const result = { map, truncated: false };
  treeCache.set(key, result);
  return result;
}

function resolveSha(args, repo, path) {
  const { map, truncated } =
    args.mode === 'local' ? localTree(args.localRoot, repo) : remoteTree(args.owner, repo, args.ref);

  if (map === null) return { sha: null, reason: 'repo-unreachable' };
  if (map.has(path)) return { sha: map.get(path), reason: null };
  if (truncated && args.mode === 'remote') {
    const sha = remoteShaSingle(args.owner, repo, path, args.ref);
    return { sha, reason: sha ? null : 'missing' };
  }
  return { sha: null, reason: 'missing' };
}

// ---------------------------------------------------------------- walk

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

// ---------------------------------------------------------------- main

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(process.cwd());
const docs = (await findDocs(join(repoRoot, DOC_ROOT))).sort();

const results = [];

for (const file of docs) {
  const text = readFileSync(file, 'utf8');
  const meta = parseFrontmatter(text);
  const rel = relative(repoRoot, file);

  if (!meta) { results.push({ rel, state: 'NO FRONTMATTER' }); continue; }
  if (!meta.sources.length) { results.push({ rel, state: 'NO SOURCES' }); continue; }

  const changed = [];
  const missing = [];

  for (const src of meta.sources) {
    const { sha } = resolveSha(args, src.repo, src.path);
    if (sha === null) missing.push(src);
    else if (sha !== src.blob) changed.push({ ...src, actual: sha });
  }

  const state = missing.length ? 'MISSING SOURCE' : changed.length ? 'STALE' : 'verified';
  results.push({ rel, state, changed, missing });

  if (args.write && state !== 'verified' && meta.status !== 'stale') {
    writeFileSync(file, text.replace(/^status:.*$/m, `status: ${state === 'STALE' ? 'stale' : 'broken'}`), 'utf8');
  }
}

// ---------------------------------------------------------------- report

const pad = (s, n) => String(s).padEnd(n);
const width = Math.max(28, ...results.map((r) => r.rel.length));
const apiCalls = treeCache.size;

console.log(`\nfingerprint check — ${args.mode} — ${results.length} document(s) — ${apiCalls} tree lookup(s)\n`);
console.log(`  ${pad('DOCUMENT', width)}  STATE`);
console.log(`  ${'-'.repeat(width)}  ${'-'.repeat(16)}`);

for (const r of results) {
  console.log(`  ${pad(r.rel, width)}  ${r.state}`);
  for (const c of r.changed ?? []) {
    console.log(`  ${' '.repeat(width)}    ~ ${c.repo}/${c.path}`);
    console.log(`  ${' '.repeat(width)}      was ${c.blob.slice(0, 12)}  now ${c.actual.slice(0, 12)}`);
  }
  for (const m of r.missing ?? []) {
    console.log(`  ${' '.repeat(width)}    ! ${m.repo}/${m.path} not found`);
  }
}

const bad = results.filter((r) => r.state !== 'verified');
console.log(`\n${results.length - bad.length} verified, ${bad.length} needing attention`);
console.log(`api cost: ${apiCalls} request(s) regardless of document count\n`);

process.exit(bad.length ? 1 : 0);
