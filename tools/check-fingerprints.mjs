#!/usr/bin/env node
/**
 * check-fingerprints — compares each document's recorded source fingerprints
 * against the current state of the code, and reports which documents have gone
 * stale.
 *
 * A "fingerprint" is the git blob SHA of a source file. `git hash-object` and
 * GitHub's Contents API return the identical value for identical content, so
 * the same document works locally and in CI without changing anything.
 *
 * Zero dependencies by design — this has to run on a locked-down machine.
 *
 *   node tools/check-fingerprints.mjs --local ../rd50-sandbox
 *   node tools/check-fingerprints.mjs --remote --owner my-org
 *   node tools/check-fingerprints.mjs --local ../rd50-sandbox --write
 *
 * Exit code 0 = every document verified. 1 = at least one needs attention.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

const DOC_ROOTS = ['flows', 'mechanisms'];
const DEFAULT_OWNER = 'adamdahan';

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const args = { mode: null, localRoot: null, owner: DEFAULT_OWNER, ref: 'HEAD', write: false };
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
    console.error('--remote requires --owner');
    process.exit(2);
  }
  return args;
}

// ---------------------------------------------------------------- frontmatter

/**
 * Deliberately narrow parser for the exact schema we define, rather than a YAML
 * dependency. Anything it does not understand is left untouched on write.
 */
function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;

  const raw = text.slice(4, end + 1);
  const meta = { sources: [] };
  let current = null;

  for (const line of raw.split('\n')) {
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

  return { meta, bodyStart: end + 4 };
}

function rewriteStatus(text, status) {
  return text.replace(/^status:.*$/m, `status: ${status}`);
}

// ---------------------------------------------------------------- sha lookup

function localSha(root, repo, path) {
  const file = join(root, repo, path);
  try {
    return execFileSync('git', ['hash-object', '--', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null; // file no longer exists at that path
  }
}

function remoteSha(owner, repo, path, ref) {
  const endpoint =
    `repos/${owner}/${repo}/contents/${path}` + (ref && ref !== 'HEAD' ? `?ref=${ref}` : '');
  try {
    return execFileSync('gh', ['api', endpoint, '--jq', '.sha'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
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
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- main

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(process.cwd());

const docs = (await Promise.all(DOC_ROOTS.map((d) => findDocs(join(repoRoot, d))))).flat().sort();

const results = [];

for (const file of docs) {
  const text = readFileSync(file, 'utf8');
  const parsed = parseFrontmatter(text);
  const rel = relative(repoRoot, file);

  if (!parsed) {
    results.push({ rel, state: 'NO FRONTMATTER', changed: [] });
    continue;
  }

  const { meta } = parsed;

  if (!meta.sources.length) {
    results.push({ rel, state: 'NO SOURCES', changed: [] });
    continue;
  }

  const changed = [];
  const missing = [];

  for (const src of meta.sources) {
    const actual =
      args.mode === 'local'
        ? localSha(args.localRoot, src.repo, src.path)
        : remoteSha(args.owner, src.repo, src.path, args.ref);

    if (actual === null) missing.push(src);
    else if (actual !== src.blob) changed.push({ ...src, actual });
  }

  let state = 'verified';
  if (missing.length) state = 'MISSING SOURCE';
  else if (changed.length) state = 'STALE';

  results.push({ rel, state, changed, missing, file, text, declared: meta.status });

  if (args.write && state !== 'verified' && meta.status !== 'stale') {
    writeFileSync(file, rewriteStatus(text, state === 'STALE' ? 'stale' : 'broken'), 'utf8');
  }
}

// ---------------------------------------------------------------- report

const pad = (s, n) => String(s).padEnd(n);
const width = Math.max(28, ...results.map((r) => r.rel.length));

console.log(`\nfingerprint check — ${args.mode} mode — ${results.length} document(s)\n`);
console.log(`  ${pad('DOCUMENT', width)}  STATE`);
console.log(`  ${'-'.repeat(width)}  ${'-'.repeat(16)}`);

for (const r of results) {
  console.log(`  ${pad(r.rel, width)}  ${r.state}`);
  for (const c of r.changed ?? []) {
    console.log(`  ${' '.repeat(width)}    ~ ${c.repo}/${c.path}`);
    console.log(`  ${' '.repeat(width)}      was ${c.blob.slice(0, 12)}  now ${c.actual.slice(0, 12)}`);
  }
  for (const m of r.missing ?? []) {
    console.log(`  ${' '.repeat(width)}    ! ${m.repo}/${m.path} no longer exists`);
  }
}

const bad = results.filter((r) => r.state !== 'verified');
console.log(`\n${results.length - bad.length} verified, ${bad.length} needing attention\n`);

if (args.write && bad.length) console.log('status: fields updated in place\n');

process.exit(bad.length ? 1 : 0);
