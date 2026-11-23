/*
 * Stage 1 gate: self-guided app modules.
 *
 * Covers the three new pieces that carry the rebuild:
 *   - js/story-parser.js   deterministic 300-word extraction, safe output
 *   - js/guided-chat.js    offline local coach for every persona
 *   - js/candidate-vault.js backwards compatibility with older vaults
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, makeWindow, loadInto } from './harness.mjs';

const knowledge = JSON.parse(readFileSync(join(root, 'data/coach-knowledge.json'), 'utf8'));

const win = makeWindow().win;
loadInto(win, 'js/candidate-vault.js');
loadInto(win, 'js/story-parser.js');
loadInto(win, 'js/guided-chat.js');
loadInto(win, 'js/personas.js');

const Story = win.EmploStartStory;
const Coach = win.EmploStartCoach;
const Vault = win.EmploStartVault;
const Personas = win.EmploStartPersonas;

const STORY_PARTS = {
  who_am_i: 'I am a 31-year-old operations coordinator in Karachi with five years of experience. I run daily reporting in Excel and Google Sheets, keep records in Salesforce, and coordinate a team of six across two warehouses.',
  where_am_i: 'I built a dashboard that cut the weekly reporting cycle from three days to one afternoon, but I am underpaid and my CV keeps getting rejected by ATS systems.',
  what_i_want: 'I want to move into a data analyst role. I am learning SQL and Power BI at night.'
};
const STORY = [STORY_PARTS.who_am_i, STORY_PARTS.where_am_i, STORY_PARTS.what_i_want].join('\n\n');

test('story parser extracts skills, tools, frictions and direction', () => {
  const parsed = Story.parseStory300(STORY_PARTS, 'stuck_employee');
  assert.equal(parsed.word_count, Story.countWords(STORY));
  assert.ok(parsed.word_count > 40, 'word_count should reflect the story');
  assert.ok(parsed.skills.length > 0, 'skills should be extracted');
  assert.ok(parsed.tools.length > 0, 'tools should be extracted');
  assert.ok(parsed.tools.includes('excel') || parsed.tools.includes('salesforce'));
  assert.ok(parsed.frictions.length > 0, 'frictions should be extracted');
  assert.ok(parsed.directions.length > 0, 'directions should be extracted');
  assert.ok(Array.isArray(parsed.extracted_signals) && parsed.extracted_signals.length > 0);
  assert.ok(parsed.recommended.tools.length > 0 && parsed.recommended.prompts.length > 0);
  assert.ok(parsed.who_am_i && parsed.where_am_i && parsed.what_i_want);
});

test('300-word counter reports empty, good and over states', () => {
  assert.equal(Story.WORD_TARGET, 300);
  assert.equal(Story.countWords(''), 0);
  assert.equal(Story.wordStatus(Story.countWords('')), 'empty');
  assert.equal(Story.wordStatus(Story.countWords('one two three')), 'start');
  const good = Array.from({ length: 300 }, (_, i) => 'w' + i).join(' ');
  assert.equal(Story.countWords(good), 300);
  assert.equal(Story.wordStatus(300), 'good');
  assert.equal(Story.wordStatus(420), 'over');
});

test('story parser never emits live markup or script from user text', () => {
  const attack = [
    '<script>alert("x")</script>',
    'I work with <img src=x onerror=alert(1)> Excel and Salesforce.',
    '<b>Bold</b> claims about being underpaid.'
  ].join(' ');
  const parsed = Story.parseStory300(attack, 'student');
  const strings = [
    parsed.raw_text, parsed.who_am_i, parsed.where_am_i, parsed.what_i_want,
    parsed.extracted_signals.join(' '), parsed.skills.join(' '), parsed.tools.join(' '),
    parsed.frictions.join(' '), parsed.directions.join(' ')
  ];
  strings.forEach((value) => {
    assert.ok(!/[<>]/.test(value), 'derived string must not contain angle brackets: ' + value);
  });
});

test('story parser tolerates unknown personas and empty input', () => {
  const empty = Story.parseStory300('', 'not_a_persona');
  assert.equal(empty.word_count, 0);
  assert.equal(empty.word_status, 'empty');
  assert.equal(empty.who_am_i, '');
  assert.ok(empty.recommended.tools.length > 0, 'unknown persona falls back to beginner defaults');
});

/* ------------------------------------------------------------------ coach */

const ROUTE_PLAIN = [
  'start', 'profile', 'tools', 'challenge', 'story', 'quiz', 'vault',
  'library', 'pledge', 'status'
];
const ROUTE_PREFIX = ['tool:', 'prompt:', 'challenge:', 'guide:', 'topic:'];

function validTarget(target) {
  if (ROUTE_PLAIN.includes(target)) { return true; }
  return ROUTE_PREFIX.some((prefix) => target.indexOf(prefix) === 0 && target.length > prefix.length);
}

test('coach knowledge base is well-formed', () => {
  assert.equal(knowledge.version, 1);
  assert.ok(knowledge.greeting.length > 20);
  assert.equal(knowledge.topics.length, 11);
  const ids = knowledge.topics.map((topic) => topic.id);
  assert.equal(new Set(ids).size, ids.length, 'topic ids are unique');
  knowledge.topics.forEach((topic) => {
    assert.ok(topic.title && topic.reply, topic.id + ' needs a title and reply');
    assert.ok(Array.isArray(topic.triggers) && topic.triggers.length > 0, topic.id + ' needs triggers');
    assert.ok(Array.isArray(topic.actions) && topic.actions.length > 0, topic.id + ' needs actions');
    topic.actions.forEach((action) => {
      assert.ok(action.label, topic.id + ' action needs a label');
      assert.ok(validTarget(action.target), topic.id + ' has an unroutable target: ' + action.target);
    });
  });
  assert.ok(validTarget(knowledge.fallback.actions[0].target));
});

test('coach answers every persona offline with a routable topic', () => {
  const probes = {
    stuck_employee: ['I feel stuck at work and underpaid', 'stuck'],
    student: ['I am a fresh grad with no experience, how do I show proof', 'student'],
    founder: ['I want to pivot from a job into a startup', 'founder'],
    women_career: ['I am returning to work after a career break', 'women'],
    beginner_ai_brand: ['I have never used AI before and I am a total beginner', 'ai']
  };
  assert.deepEqual([...Personas.keys].sort(), Object.keys(probes).sort());
  Object.keys(probes).forEach((persona) => {
    const [message, expected] = probes[persona];
    const reply = Coach.answer(message, { persona: persona }, knowledge);
    assert.ok(reply && reply.reply, persona + ' should get a reply');
    assert.ok(reply.id.indexOf(expected) !== -1, persona + ' routed to ' + reply.id);
    assert.ok(reply.actions.length > 0, persona + ' should get actions');
    reply.actions.forEach((action) => {
      assert.ok(validTarget(action.target), persona + ' action target: ' + action.target);
    });
  });
});

test('coach covers the beginner AI and LinkedIn questions asked by the spec', () => {
  const ai = Coach.answer('What even is AI? I have never used it', {}, knowledge);
  assert.equal(ai.id, 'ai_basics');
  const linkedin = Coach.answer('How do I use LinkedIn for branding without being cringe', {}, knowledge);
  assert.equal(linkedin.id, 'linkedin_branding');
  const cv = Coach.answer('My CV keeps getting rejected by ATS', {}, knowledge);
  assert.equal(cv.id, 'cv_ats');
  const pay = Coach.answer('How do I negotiate a fair wage', {}, knowledge);
  assert.equal(pay.id, 'fair_pay');
});

test('coach gives a safe fallback and never throws on junk input', () => {
  const junk = Coach.answer('zzzz qqqq', { persona: 'stuck_employee' }, knowledge);
  assert.equal(junk.id, 'fallback');
  assert.ok(junk.reply.length > 10);
  const offline = Coach.answer('hello', {}, null);
  assert.equal(offline.id, 'offline');
  assert.doesNotThrow(() => Coach.answer('', {}, knowledge));
  assert.equal(Coach.answer('', {}, knowledge).id, 'greeting');
});

test('coach persona bias breaks near-ties toward the selected persona', () => {
  const studentScore = Coach.scoreTopic(
    knowledge.topics.find((topic) => topic.id === 'student_proof'),
    'I need help with my first step', 'student'
  );
  const plainScore = Coach.scoreTopic(
    knowledge.topics.find((topic) => topic.id === 'student_proof'),
    'I need help with my first step', ''
  );
  assert.ok(studentScore > plainScore, 'student persona should boost student_proof');
});

/* ------------------------------------------------------------------ vault */

test('vault remains backwards compatible with pre-persona saves', () => {
  const legacy = Vault.empty();
  delete legacy.persona;
  delete legacy.story_300;
  delete legacy.challenge_progress;
  legacy.core_profile.full_name = 'Legacy Saver';
  legacy.core_profile.skills = ['excel'];

  win.localStorage.setItem(Vault.KEY, JSON.stringify(legacy));
  const db = Vault.read();
  assert.equal(db.core_profile.full_name, 'Legacy Saver');
  assert.ok(Array.isArray(db.core_profile.skills) && db.core_profile.skills.includes('excel'));
  assert.equal(db.persona, '');
  assert.equal(db.story_300.extracted_signals.length, 0);
  assert.equal(db.challenge_progress.completed_days.length, 0);
  assert.equal(db.challenge_progress.started_at, null);
});

test('vault whitelists persona and sanitises story and challenge writes', () => {
  const db = Vault.empty();
  assert.equal(Vault.KEY, 'emplostart_vault_v2');
  assert.deepEqual([...Vault.PERSONAS].sort(), [...Personas.keys].sort());

  Vault.setPersona(db, 'student');
  assert.equal(db.persona, 'student');
  Vault.setPersona(db, 'not-a-real-persona');
  assert.equal(db.persona, '');

  Vault.setStory(db, {
    raw_text: '<script>bad</script>I built a dashboard',
    who_am_i: 'Analyst',
    what_i_want: 'A data role',
    word_count: 99999,
    extracted_signals: Array.from({ length: 40 }, (_, i) => 'signal ' + i)
  });
  assert.ok(!/[<>]/.test(db.story_300.raw_text), 'story text is stripped');
  assert.ok(db.story_300.extracted_signals.length <= 12);
  assert.ok(db.story_300.word_count <= 2000);

  Vault.setChallengeDay(db, 1, true, 'Started');
  Vault.setChallengeDay(db, 1, true, 'Duplicate day should not repeat');
  Vault.setChallengeDay(db, 31, true, 'Out of range');
  Vault.setChallengeDay(db, 0, true, 'Out of range');
  assert.equal(JSON.stringify(db.challenge_progress.completed_days), '[1]');
  assert.equal(db.challenge_progress.notes_by_day['1'], 'Duplicate day should not repeat');
  assert.ok(db.challenge_progress.started_at, 'first completed day stamps the start');
  assert.ok(!db.challenge_progress.notes_by_day['0']);
  assert.ok(!db.challenge_progress.notes_by_day['31']);
});

test('vault round-trips new fields through storage', () => {
  const db = Vault.empty();
  Vault.setPersona(db, 'founder');
  Vault.setStory(db, { raw_text: 'Founder story', who_am_i: 'Builder', word_count: 2 });
  Vault.setChallengeDay(db, 7, true, 'Noted');
  Vault.write(db);

  const again = Vault.read();
  assert.equal(again.persona, 'founder');
  assert.equal(again.story_300.who_am_i, 'Builder');
  assert.equal(JSON.stringify(again.challenge_progress.completed_days), '[7]');
});
