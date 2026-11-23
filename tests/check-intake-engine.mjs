import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, makeWindow, loadInto, buildZip } from './harness.mjs';

const win = makeWindow().win;
loadInto(win, 'js/candidate-vault.js');
loadInto(win, 'js/docx-extract.js');
loadInto(win, 'js/intake-engine.js');
const V = win.EmploStartVault;
const D = win.EmploStartDocx;
const I = win.EmploStartIntake;

const DOC = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  '<w:p><w:r><w:t>Operations coordinator</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>Cut stockouts from 9% to 3%</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>2025</w:t></w:r></w:p>' +
  '</w:body></w:document>';

test('docx text extracts from a stored in-memory ZIP', async () => {
  const out = await D.extract(buildZip('word/document.xml', DOC, 0));
  assert.equal(out.paragraphs, 2);
  assert.match(out.text, /Operations coordinator/);
  assert.match(out.text, /Cut stockouts from 9% to 3%/);
});

test('docx text extracts from a deflate-raw in-memory ZIP', async () => {
  const out = await D.extract(buildZip('word/document.xml', DOC, 8));
  assert.equal(out.paragraphs, 2);
  assert.match(out.text, /Operations coordinator/);
});

test('docx without word/document.xml is rejected', async () => {
  await assert.rejects(() => D.extract(buildZip('word/other.xml', '<x/>', 0)), /No word\/document.xml/);
});

test('JSON import rejects prototype-pollution keys', () => {
  const top = V.importJson('{"__proto__":{"polluted":true}}');
  assert.equal(top.ok, false);
  assert.equal(top.reason, 'reserved-key');
  assert.equal({}.polluted, undefined);
  const nested = V.importJson('{"core_profile":{"constructor":{"x":1}}}');
  assert.equal(nested.ok, false);
  assert.equal(nested.reason, 'reserved-key');
  const proto = V.importJson('{"core_profile":{"prototype":{}}}');
  assert.equal(proto.ok, false);
});

test('JSON import accepts a real vault and rejects oversized text', () => {
  const good = V.importJson(JSON.stringify(V.sample()));
  assert.equal(good.ok, true);
  assert.equal(good.vault.core_profile.full_name, 'Sample Candidate');
  const huge = V.importJson('{"core_profile":{"experience_raw":"' + 'x'.repeat(210000) + '"}}');
  assert.equal(huge.ok, false);
  assert.equal(huge.reason, 'too-large');
});

test('session mode wipes the persistent copy and wipe clears both stores', () => {
  const box = makeWindow();
  const w = box.win;
  loadInto(w, 'js/candidate-vault.js');
  const vault = w.EmploStartVault;

  vault.setMode('persistent');
  vault.write(vault.sample());
  assert.ok(box.localStorage.getItem(vault.KEY), 'persistent copy should exist');

  vault.setMode('session');
  assert.equal(box.localStorage.getItem(vault.KEY), null, 'persistent copy must be removed');
  assert.ok(box.sessionStorage.getItem(vault.KEY), 'session copy should exist');

  vault.wipe();
  assert.equal(box.localStorage.getItem(vault.KEY), null);
  assert.equal(box.sessionStorage.getItem(vault.KEY), null);
});

test('diagnostic scores bounded bands and recommends three prompts', () => {
  const allHigh = {};
  I.DIAGNOSTIC.forEach((q) => { allHigh[q.id] = 3; });
  const high = I.scoreDiagnostic(allHigh);
  assert.equal(high.answered, 12);
  assert.deepEqual(Object.keys(high.bands).sort(), ['ats_readiness', 'evidence', 'interview_readiness', 'market_clarity', 'negotiation', 'pivot_readiness', 'positioning']);
  Object.values(high.bands).forEach((band) => {
    assert.ok(V.BANDS.includes(band.label));
    assert.ok(band.score >= 0 && band.score <= 100);
  });
  assert.equal(high.recommended.length, 3);
  high.recommended.forEach((id) => assert.match(id, /^P(0[1-9]|1[0-4])$/));

  const allLow = {};
  I.DIAGNOSTIC.forEach((q) => { allLow[q.id] = 0; });
  const low = I.scoreDiagnostic(allLow);
  Object.values(low.bands).forEach((band) => assert.equal(band.label, 'Foundation'));
  assert.equal(I.scoreDiagnostic({ q1: 0 }).answered, 1);
});

test('CV parse extracts evidence without judging it', () => {
  const text = [
    'Ayesha Khan',
    'ayesha@example.com | +92 300 1234567',
    'Skills: Excel, SQL, reporting',
    'Experience',
    'Operations coordinator at Regional Distributor, 2022-2025',
    'Cut stockouts from 9% to 3% in one quarter',
    'Trained six new hires',
    'Education: BBA, University of Karachi, 2021',
    'https://example.com/case-study'
  ].join('\n');
  const out = I.parseCv(text);
  assert.equal(out.fields.full_name, 'Ayesha Khan');
  assert.ok(out.fields.skills.some((skill) => /excel/i.test(skill)));
  assert.ok(out.fields.quantified_results.length >= 1);
  assert.ok(out.fields.portfolio_links.length >= 1);
  assert.ok(out.flags.years.includes(2025));
});

test('PDF paste repair turns bullets into lines and rejoins broken words', () => {
  const repaired = I.repairPdfPaste('• Ran the stock plan\nTrained six\nnew hires');
  assert.match(repaired, /^- Ran the stock plan/m);
  assert.match(repaired, /Trained six new hires/);
});

test('LinkedIn lane validates the URL and never claims to scrape', () => {
  assert.equal(I.validateLinkedInUrl('https://www.linkedin.com/in/ayesha-khan'), true);
  assert.equal(I.validateLinkedInUrl('https://linkedin.com/company/acme'), false);
  const good = I.parseLinkedIn('https://www.linkedin.com/in/ayesha-khan', 'Operations coordinator moving into planning.');
  assert.equal(good.valid, true);
  assert.match(good.note, /never open or scrape/i);
  assert.equal(good.fields.linkedin_url, 'https://www.linkedin.com/in/ayesha-khan');
  const bad = I.parseLinkedIn('not-a-url', 'text');
  assert.equal(bad.valid, false);
  assert.match(bad.note, /does not look like/i);
});

test('delta questions cap at six and merge preview protects manual fields', () => {
  const vault = V.empty();
  const delta = I.deltaQuestions({}, vault);
  assert.ok(delta.length > 0 && delta.length <= 6);
  assert.ok(delta.some((item) => item.key === 'target_role'));

  const manual = V.empty();
  manual.core_profile.skills = ['typed'];
  manual.field_sources.skills = 'manual';
  manual.core_profile.tools = ['excel'];
  manual.field_sources.tools = 'cv_parse';
  const rows = I.mergePreview({ skills: ['parsed'], tools: ['sql'] }, manual);
  const skills = rows.find((row) => row.key === 'skills');
  const tools = rows.find((row) => row.key === 'tools');
  assert.equal(skills.protected, true);
  assert.equal(skills.action, 'keep');
  assert.equal(tools.protected, false);
  assert.equal(tools.action, 'replace');
});

test('target fields land in the active context, never in core_profile', () => {
  let vault = V.empty();
  vault = V.setTarget(vault, 'target_role', 'Data analyst');
  vault = V.setTarget(vault, 'target_jd', 'SQL, dashboards, stakeholder reporting.');
  assert.equal(vault.target_contexts.length, 1);
  assert.equal(vault.active_context_id, 'ctx1');
  assert.equal(V.getField(vault, 'target_role'), 'Data analyst');
  assert.equal(V.getField(vault, 'target_jd'), 'SQL, dashboards, stakeholder reporting.');
  assert.equal(vault.core_profile.target_role, undefined);
  assert.equal(vault.target_contexts[0].label, 'Data analyst');
  assert.equal(V.setTarget(vault, 'full_name', 'nope'), vault, 'only target keys are accepted');
});

test('vault completeness and bands stay within the four readiness band names', () => {
  const vault = V.sample();
  assert.ok(V.completeness(vault) > 0);
  const bands = V.computeBands(vault);
  Object.keys(bands).forEach((key) => {
    assert.ok(V.BANDS.includes(bands[key].label));
    assert.ok(bands[key].score >= 0 && bands[key].score <= 100);
  });
  assert.ok(V.completeness(V.empty()) <= 10, 'blank vault keeps the default location only');
  assert.ok(V.completeness(vault) > V.completeness(V.empty()));
});

test('new scripts avoid innerHTML and inline handlers', () => {
  ['js/candidate-vault.js', 'js/docx-extract.js', 'js/intake-engine.js', 'js/intake-ui.js', 'js/prompt-compiler.js', 'js/prompt-library.js'].forEach((rel) => {
    const text = readFileSync(join(root, rel), 'utf8');
    assert.ok(!/innerHTML/.test(text), rel + ' uses innerHTML');
    assert.ok(!/\bonclick\s*=/.test(text), rel + ' uses an inline handler');
    assert.ok(!/document\.write/.test(text), rel + ' uses document.write');
  });
});
