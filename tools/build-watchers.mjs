#!/usr/bin/env node
/**
 * build-watchers — inverts the document→sources mapping into a
 * sources→documents index, so a code repo can ask "which documents does this
 * file back?" with a single fetch and no knowledge of this repo's layout.
 *
 * Output: index/watchers.json, keyed "<repo>/<path>".
 * Generated on every merge. Never hand-edited.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const DOC_ROOTS = ['flows', 'mechanisms'];
const OUT = 'index/watchers.json';

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

function sourcesOf(text) {
  if (!text.startsWith('---\n')) return [];
  const end = text.indexOf('\n---', 3);
  if (end === -1) return [];

  const sources = [];
  let current = null;

  for (const line of text.slice(4, end + 1).split('\n')) {
    const item = line.match(/^\s*-\s+(\w+):\s*(.+?)\s*$/);
    if (item) {
      current = { [item[1]]: item[2] };
      sources.push(current);
      continue;
    }
    const nested = line.match(/^\s{4,}(\w+):\s*(.+?)\s*$/);
    if (nested && current) current[nested[1]] = nested[2];
    else if (/^\w+:/.test(line)) current = null;
  }

  return sources.filter((s) => s.repo && s.path);
}

const root = resolve(process.cwd());
const docs = (await Promise.all(DOC_ROOTS.map((d) => findDocs(join(root, d))))).flat();

const watchers = {};
for (const file of docs.sort()) {
  const rel = relative(root, file);
  for (const src of sourcesOf(readFileSync(file, 'utf8'))) {
    const key = `${src.repo}/${src.path}`;
    (watchers[key] ??= []).push(rel);
  }
}

// stable key order so the file only churns when the mapping actually changes
const sorted = Object.fromEntries(Object.keys(watchers).sort().map((k) => [k, watchers[k].sort()]));

mkdirSync('index', { recursive: true });
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

console.log(`${OUT} — ${Object.keys(sorted).length} watched file(s) across ${docs.length} document(s)`);
for (const [k, v] of Object.entries(sorted)) console.log(`  ${k}\n    → ${v.join('\n    → ')}`);
