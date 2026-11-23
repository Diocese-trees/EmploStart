/*
 * Stage 2 gate: the 30-day challenge.
 *
 * Checks the data contract (30 unique days across four weeks, every persona
 * tip present, every deep link routable) and the deterministic helpers that
 * drive progress, streaks and recommendations.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, makeWindow, loadInto } from './harness.mjs';

const challenge = JSON.parse(readFileSync(join(root, 'data/challenge-30.json'), 'utf8'));
const library = JSON.parse(readFileSync(join(root, 'data/prompt-library.json'), 'utf8'));

const win = makeWindow().win;
loadInto(win, 'js/candidate-vault.js');
loadInto(win, 'js/challenge-30.js');
const Vault = win.EmploStartVault;
const T = win.EmploStartChallenge;
T.useData(challenge);

const PERSONAS = ['stuck_employee', 'student', 'founder', 'women_career', 'beginner_ai_brand'];
const PROMPT_IDS = new Set(library.prompts.map((p) => p.id));

const ROUTE_PLAIN = ['start', 'profile', 'tools', 'challenge', 'story', 'quiz', 'vault', 'library', 'pledge', 'status'];
const ROUTE_PREFIX = ['tool:', 'prompt:', 'challenge:', 'guide:'];
function validTarget(target) {
  if (ROUTE_PLAIN.includes(target)) { return true; }
  return ROUTE_PREFIX.some((prefix) => target.indexOf(prefix) === 0 && target.length > prefix.length);
}

test('challenge has 30 unique days across four weeks', () => {
  assert.equal(challenge.version, 1);
  assert.equal(challenge.days.length, 30);
  assert.deepEqual(challenge.days.map((d) => d.day), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.equal(new Set(challenge.days.map((d) => d.title)).size, 30, 'day titles are unique');
  assert.equal(challenge.weeks.length, 4);
  assert.deepEqual(challenge.weeks.map((w) => w.id), [1, 2, 3, 4]);
  challenge.days.forEach((entry) => {
    assert.equal(T.weekFor(entry.day), entry.week, 'day ' + entry.day + ' week matches');
    assert.ok(entry.title && entry.summary && entry.task && entry.tip, 'day ' + entry.day + ' needs copy');
    assert.ok(entry.action && entry.action.label, 'day ' + entry.day + ' needs an action label');
    assert.ok(validTarget(entry.action.target), 'day ' + entry.day + ' unroutable target: ' + entry.action.target);
    if (entry.action.target.indexOf('prompt:') === 0) {
      assert.ok(PROMPT_IDS.has(entry.action.target.slice(7)), 'day ' + entry.day + ' points at a real prompt');
    }
  });
  const week1 = challenge.days.filter((d) => d.week === 1).length;
  const week2 = challenge.days.filter((d) => d.week === 2).length;
  const week3 = challenge.days.filter((d) => d.week === 3).length;
  const week4 = challenge.days.filter((d) => d.week === 4).length;
  assert.deepEqual([week1, week2, week3, week4], [7, 7, 7, 9]);
});

test('every day carries a tip for every persona', () => {
  challenge.days.forEach((entry) => {
    PERSONAS.forEach((key) => {
      const tip = T.tipFor(entry.day, key);
      assert.ok(tip && tip.length > 15, 'day ' + entry.day + ' missing tip for ' + key);
      assert.equal(tip, entry.persona_tips[key]);
    });
    assert.equal(T.tipFor(entry.day, 'not_a_persona'), entry.tip, 'unknown persona falls back');
  });
});

test('challenge content avoids invented salaries and scraped numbers', () => {
  const text = JSON.stringify(challenge);
  assert.ok(!/[$£€₹]\s?\d/.test(text), 'no currency amounts in the challenge');
  assert.ok(!/\bPKR\s?\d|\bUSD\s?\d/i.test(text), 'no fabricated pay figures');
  assert.ok(!/scraped from|scraping (?:LinkedIn|jobs)/i.test(text), 'no scraped-data claims');
  assert.match(challenge.note, /No salaries, percentiles or scraped data/);
});

test('streak, next day and summary maths are deterministic', () => {
  assert.equal(T.bestStreak([]), 0);
  assert.equal(T.bestStreak([1, 2, 3, 7]), 3);
  assert.equal(T.bestStreak([5]), 1);
  assert.equal(T.bestStreak([29, 30, 1, 2]), 2);
  assert.equal(T.bestStreak([1, 3, 4, 5, 9, 10]), 3);
  assert.equal(T.nextOpenDay([]), 1);
  assert.equal(T.nextOpenDay([1, 2, 3]), 4);
  assert.equal(T.nextOpenDay([1, 2, 4]), 3);
  const stats = T.summary([1, 2, 3, 4]);
  assert.equal(stats.completed, 4);
  assert.equal(stats.total, 30);
  assert.equal(stats.percent, 13);
  assert.equal(stats.streak, 4);
  assert.equal(stats.next, 5);
});

test('recommendations follow the persona and stay routable', () => {
  PERSONAS.forEach((persona) => {
    const picks = T.recommendations({ persona });
    assert.ok(picks.length >= 3, persona + ' needs at least three picks');
    picks.forEach((pick) => {
      assert.ok(validTarget(pick.target), persona + ' unroutable pick ' + pick.target);
      if (pick.target.indexOf('prompt:') === 0) {
        assert.ok(PROMPT_IDS.has(pick.target.slice(7)), persona + ' unknown prompt ' + pick.target);
      }
    });
  });
  const plain = T.recommendations({ persona: '' });
  assert.equal(plain[0].target, 'prompt:P01');
  const withStory = T.recommendations({ persona: 'student', story_300: { word_count: 120 } });
  assert.equal(withStory[0].target, 'story');
  assert.equal(withStory.length, 4);
});

test('challenge progress round-trips through the vault', () => {
  const db = Vault.empty();
  Vault.setChallengeDay(db, 1, true);
  Vault.setChallengeDay(db, 2, true);
  Vault.setChallengeDay(db, 2, false);
  Vault.setChallengeDay(db, 3, true, 'Wrote the truth.');
  assert.equal(JSON.stringify(db.challenge_progress.completed_days), '[1,3]');
  assert.equal(db.challenge_progress.notes_by_day['3'], 'Wrote the truth.');
  assert.equal(T.bestStreak(db.challenge_progress.completed_days), 1);
  assert.equal(T.nextOpenDay(db.challenge_progress.completed_days), 2);
});

test('challenge data is small enough for a static deploy', () => {
  const bytes = readFileSync(join(root, 'data/challenge-30.json')).length;
  assert.ok(bytes < 80 * 1024, 'challenge JSON should stay well under 80 KB, got ' + bytes);
});
