import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function load(rel) {
  const sandbox = { window: {}, document: { querySelector: () => null } };
  sandbox.window.EmplowiseToolkit = {};
  sandbox.window.EmploStartEngines = {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(root, rel), 'utf8'), sandbox, { filename: rel });
  return sandbox.window;
}

const win = load('js/engines/ats.js');
loadInto(win, 'js/engines/interview.js');
loadInto(win, 'js/engines/profile.js');
loadInto(win, 'js/engines/pivot.js');
loadInto(win, 'js/engines/reimagine.js');
loadInto(win, 'js/engines/market.js');

function loadInto(target, rel) {
  const sandbox = { window: target, document: { querySelector: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(root, rel), 'utf8'), sandbox, { filename: rel });
}

const { EmplowiseToolkit: T, EmploStartEngines: E } = win;

test('pivot planner returns three phases and a bounded readiness score', () => {
  const plan = E.pivot.plan({
    current: 'Operations lead', target: 'Product management',
    skills: 'process design, budgeting, coaching', strengths: 'clear writing',
    hoursPerWeek: 8, runway: 'transition', risk: 'medium', network: 'some'
  });
  assert.equal(plan.source, 'local');
  assert.equal(plan.phases.length, 3);
  assert.ok(plan.readiness >= 0 && plan.readiness <= 100);
  assert.ok(plan.bridges.length >= 3);
  assert.match(plan.disclaimer, /not a prediction/i);
});

test('pivot readiness rises with a named target and network', () => {
  const low = E.pivot.plan({ hoursPerWeek: 2, network: 'none' }).readiness;
  const high = E.pivot.plan({ current: 'Analyst', target: 'Data analyst', skills: 'sql, data', network: 'strong', hoursPerWeek: 12 }).readiness;
  assert.ok(high > low);
});

test('reimagination lab is deterministic and returns three archetypes', () => {
  const input = { current: 'Teacher', strengths: 'explaining, planning', interests: 'education', workStyle: 'people' };
  const a = E.reimagine.lab(input);
  const b = E.reimagine.lab(input);
  assert.equal(a.matches.length, 3);
  assert.deepEqual(a.matches.map((m) => m.id), b.matches.map((m) => m.id));
  assert.equal(a.matches[0].id, 'people');
});

test('market assessment never emits a salary figure', () => {
  const out = E.market.assess({ role: 'Data analyst', region: 'Lahore', years: '3 years', transparency: 'partial' });
  assert.equal(out.dimensions.length, 4);
  const blob = JSON.stringify(out);
  assert.ok(!/\$\s?\d/.test(blob), 'no dollar amounts');
  assert.ok(!/\b(usd|pkr|rs\.?)\s?\d/i.test(blob), 'no currency amounts');
  assert.match(out.disclaimer, /no salary figures/i);
});

test('ATS score is bounded, deterministic and flags matched keywords', () => {
  const resume = 'Data analyst with SQL, dashboards and stakeholder reporting.';
  const jd = 'We need a data analyst with SQL and dashboard experience.';
  const a = T.ats.score(resume, jd);
  const b = T.ats.score(resume, jd);
  assert.deepEqual(a, b);
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.ok(a.matched.includes('sql'));
});

test('interview questions and feedback stay bounded', () => {
  const qs = T.interview.questions('Product manager', 'Entry level');
  assert.ok(qs.questions.length >= 3);
  const fb = T.interview.feedback('Product manager', 'Entry level', qs.questions[0],
    'Situation: our launch slipped. Action: I rebuilt the plan and aligned three teams. Result: we shipped two weeks late but under budget.');
  assert.ok(fb.score >= 0 && fb.score <= 100);
  assert.ok(Array.isArray(fb.strengths));
  assert.ok(fb.next_probe);
});

test('profile optimiser returns rewritten copy', () => {
  const out = T.profile.optimize(
    'Operations lead moving into product management',
    'I am a hardworking operations lead passionate about product.',
    'Ran the weekly supply plan\nTrained 6 new hires\nCut report time from 2 days to 4 hours',
    'Product manager'
  );
  assert.ok(out.headlines.length >= 1);
  assert.ok(out.summary.length > 0);
  assert.equal(out.source, 'local');
});
