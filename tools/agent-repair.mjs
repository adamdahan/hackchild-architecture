#!/usr/bin/env node
/**
 * agent-repair — hands each stale document, plus the diff of the code beneath it,
 * to Claude and asks for a patched version.
 *
 * The mechanical half (which sections are affected, what changed) is already
 * known from propose-repair.mjs. This is the judgment half: does the prose still
 * hold, and if not, what should it say instead.
 *
 * The single most valuable thing it reports is `invalidated_claims` — statements
 * in the document that the code change has made false. A gotcha that quietly
 * stops being true is exactly the failure this whole system exists to prevent.
 *
 *   ANTHROPIC_API_KEY=... node tools/agent-repair.mjs
 *
 * Reads:  .repair/summary.json   (written by propose-repair.mjs)
 * Writes: patched documents in place, .repair/agent-notes.md
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const SUMMARY = '.repair/summary.json';
const NOTES = '.repair/agent-notes.md';

if (!existsSync(SUMMARY)) {
  console.log('no repair summary — nothing for the agent to do');
  process.exit(0);
}

const repairs = JSON.parse(readFileSync(SUMMARY, 'utf8'));
if (!repairs.length) {
  console.log('no stale documents');
  process.exit(0);
}

const client = new Anthropic();

const SYSTEM = `You maintain a cross-repository architecture knowledge base.

Each document explains how a feature works across a mobile app and a backend
service, and records the source files it was written from. When those files
change, you are given the document and the diff, and you decide what the
document should now say.

How to edit:

- Patch only what the diff actually affects. Leave every other section byte-identical.
- Never touch the YAML frontmatter. It is maintained mechanically.
- Preserve the document's voice, structure, and heading levels.
- Do not add commentary about the change itself. The document describes the
  system as it is now, not its history.

The Gotchas section deserves particular care. Those entries record things that
were never derivable from the code — reasons, hazards, lessons from incidents.
A code change can make a gotcha false, and a false gotcha is worse than none at
all, because a reader will act on it.

For every statement the diff has made untrue, list it in invalidated_claims,
quoting the original wording. Then fix it in the document. If a gotcha has
become false because the hazard it warned about is now the actual behaviour,
rewrite it to describe the new hazard rather than deleting it.

If the diff genuinely does not affect the document's claims — a rename, a
comment, a reformat — set changed to false and return the document unmodified.`;

const SCHEMA = {
  type: 'object',
  properties: {
    changed: {
      type: 'boolean',
      description: 'True only if the document text needed to change.',
    },
    updated_markdown: {
      type: 'string',
      description: 'The complete document including unmodified frontmatter.',
    },
    summary: {
      type: 'string',
      description: 'One or two sentences on what was revised and why.',
    },
    invalidated_claims: {
      type: 'array',
      description: 'Statements the code change made false, quoted from the original.',
      items: { type: 'string' },
    },
  },
  required: ['changed', 'updated_markdown', 'summary', 'invalidated_claims'],
  additionalProperties: false,
};

function buildPrompt(repair, docText) {
  const diffs = repair.moved
    .map(
      (m) =>
        `### ${m.repo}/${m.path}\n` +
        `commit ${m.commit} — ${m.message}\n\n` +
        '```diff\n' +
        (m.patch || '(no patch available)') +
        '\n```',
    )
    .join('\n\n');

  return `A document in the knowledge base is stale. Here is the document, then the
changes to the source files it was written from.

<document path="${repair.doc}">
${docText}
</document>

<source_changes>
${diffs}
</source_changes>

Decide what this document should now say, and return the result.`;
}

const notes = [];

for (const repair of repairs) {
  const docText = readFileSync(repair.doc, 'utf8');
  process.stdout.write(`\n${repair.doc}\n  asking Claude… `);

  const stream = client.messages.stream({
    // Sonnet 5 rather than an Opus tier: this is a bounded editing task against a
    // supplied diff, not open-ended reasoning. `medium` effort here lands around
    // Sonnet 4.6's `high`. Raise to `high` if the agent starts missing
    // invalidated claims — that is the quality signal worth paying for.
    model: 'claude-sonnet-5',
    max_tokens: 32000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{ role: 'user', content: buildPrompt(repair, docText) }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    console.log('declined — leaving the document for a human');
    notes.push(`### \`${repair.doc}\`\n\nThe agent declined to patch this document.`);
    continue;
  }

  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) {
    console.log('no output — leaving the document for a human');
    continue;
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    console.log('unparseable output — leaving the document for a human');
    continue;
  }

  // The agent has now actually read the prose against the diff, so it is
  // entitled to promote the document — but only when it found nothing left
  // untrue. Outstanding invalidated claims keep it flagged for a human.
  const clean = !result.invalidated_claims?.length;
  const promote = (text) =>
    text
      .replace(/^status:.*$/m, `status: ${clean ? 'verified' : 'needs-review'}`)
      .replace(/^verified_on:.*$/m, `verified_on: ${new Date().toISOString().slice(0, 10)}`);

  if (result.changed) {
    writeFileSync(repair.doc, promote(result.updated_markdown), 'utf8');
    console.log(clean ? 'patched → verified' : 'patched → needs-review (claims outstanding)');
  } else {
    writeFileSync(repair.doc, promote(readFileSync(repair.doc, 'utf8')), 'utf8');
    console.log('no prose change needed → verified');
  }

  const lines = [`### \`${repair.doc}\``, '', result.summary, ''];

  if (result.invalidated_claims?.length) {
    lines.push(
      `**${result.invalidated_claims.length} claim(s) the code change made false:**`,
      '',
      ...result.invalidated_claims.map((c) => `- ${c}`),
      '',
    );
  } else {
    lines.push('_No existing claims were invalidated._', '');
  }

  const usage = message.usage;
  lines.push(
    `<sub>${message.model} · ${usage.input_tokens} in / ${usage.output_tokens} out</sub>`,
    '',
  );

  notes.push(lines.join('\n'));
}

if (notes.length) {
  const body =
    '## What the agent changed\n\n' +
    notes.join('\n') +
    '\nThe prose above was written by an agent working from the diff. ' +
    'Read it against the code before approving.\n';
  writeFileSync(NOTES, body, 'utf8');
  appendFileSync('.repair/pr-body.md', '\n\n---\n\n' + body, 'utf8');
  console.log(`\nnotes written to ${NOTES}`);
}
