#!/usr/bin/env node
/*
 * Emit plain-text prompt mirrors from data/prompt-library.json.
 *
 * The JSON file is the single source of truth for the browser workbench.
 * API consumers (and anyone reading the repo on GitHub) get the same text
 * as api/prompts/P01.txt ... P14.txt.
 *
 * Usage:
 *   node tools/generate-prompt-mirrors.mjs          # write mirrors
 *   node tools/generate-prompt-mirrors.mjs --check  # fail if mirrors drift
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libraryPath = join(root, 'data', 'prompt-library.json');
const outDir = join(root, 'api', 'prompts');
const check = process.argv.includes('--check');

const library = JSON.parse(await readFile(libraryPath, 'utf8'));
const prompts = Array.isArray(library.prompts) ? library.prompts : [];

function mirror(p) {
  const head = [
    `# ${p.id} · ${p.letter} · ${p.pillar_title}`,
    `# Track: ${p.track} | Funnel stage: ${p.funnel_stage} | Gate: ${p.completeness_gate_mode}`,
    `# ${p.prompt_title}`,
    `# ${p.summary}`,
    `# Source: data/prompt-library.json (version ${library.version})`,
    ''
  ].join('\n');
  return head + String(p.template_standard || '').trim() + '\n';
}

if (check) {
  const expected = new Map(prompts.map((p) => [p.id + '.txt', mirror(p)]));
  let stale = [];
  for (const [name, body] of expected) {
    let actual = null;
    try { actual = await readFile(join(outDir, name), 'utf8'); } catch { /* missing */ }
    if (actual !== body) { stale.push(name); }
  }
  let extra = [];
  try {
    extra = (await readdir(outDir)).filter((n) => n.endsWith('.txt') && !expected.has(n));
  } catch { /* dir missing */ }
  if (stale.length || extra.length) {
    console.error('Prompt mirrors out of sync. Run: node tools/generate-prompt-mirrors.mjs');
    if (stale.length) console.error('  stale/missing:', stale.join(', '));
    if (extra.length) console.error('  unexpected:', extra.join(', '));
    process.exit(1);
  }
  console.log(`Prompt mirrors OK (${expected.size} files).`);
  process.exit(0);
}

await mkdir(outDir, { recursive: true });
let written = 0;
for (const p of prompts) {
  await writeFile(join(outDir, p.id + '.txt'), mirror(p), 'utf8');
  written += 1;
}
console.log(`Wrote ${written} prompt mirrors to api/prompts/`);
