/* The 30-day mindset and profile challenge.
 *
 * Data lives in data/challenge-30.json. This module renders the grid, keeps
 * completion and notes in the local vault, and exposes small pure helpers so
 * the challenge can be tested without a browser.
 */
(function () {
    'use strict';

    var DATA_URL = 'data/challenge-30.json';
    var data = null;
    var selected = 1;
    var weekFilter = 0;
    var els = {};

    function vaultLib() { return window.EmploStartVault; }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text != null) { node.textContent = String(text); }
        return node;
    }

    function read() {
        return vaultLib() ? vaultLib().read() : null;
    }

    function write(db) {
        if (!vaultLib()) { return; }
        vaultLib().write(db);
        document.dispatchEvent(new CustomEvent('emplostart:vault-changed'));
    }

    /* ------------------------------------------------------------ pure help */

    function weekFor(day) {
        if (day <= 7) { return 1; }
        if (day <= 14) { return 2; }
        if (day <= 21) { return 3; }
        return 4;
    }

    function dayByNumber(number) {
        if (!data || !Array.isArray(data.days)) { return null; }
        for (var i = 0; i < data.days.length; i += 1) {
            if (data.days[i].day === Number(number)) { return data.days[i]; }
        }
        return null;
    }

    function tipFor(number, personaKey) {
        var entry = dayByNumber(number);
        if (!entry) { return ''; }
        if (personaKey && entry.persona_tips && entry.persona_tips[personaKey]) {
            return entry.persona_tips[personaKey];
        }
        return entry.tip || entry.summary || '';
    }

    function normaliseDays(days) {
        var seen = {};
        (days || []).forEach(function (value) {
            var number = Math.round(Number(value));
            if (number >= 1 && number <= 30) { seen[number] = true; }
        });
        return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    }

    function bestStreak(days) {
        var sorted = normaliseDays(days);
        var best = 0;
        var run = 0;
        var previous = 0;
        sorted.forEach(function (number) {
            run = number === previous + 1 ? run + 1 : 1;
            previous = number;
            if (run > best) { best = run; }
        });
        return best;
    }

    function nextOpenDay(days) {
        var completed = normaliseDays(days);
        var lookup = {};
        completed.forEach(function (number) { lookup[number] = true; });
        for (var day = 1; day <= 30; day += 1) {
            if (!lookup[day]) { return day; }
        }
        return 30;
    }

    function summary(days) {
        var completed = normaliseDays(days);
        return {
            completed: completed.length,
            total: 30,
            percent: Math.round((completed.length / 30) * 100),
            streak: bestStreak(completed),
            next: nextOpenDay(completed)
        };
    }

    /* Deterministic "Recommended for you first" picks. Persona leads, then the
       saved story, then a small fallback that is always useful. */
    var RECOMMEND = {
        stuck_employee: ['P01', 'P05', 'P12'],
        student: ['P01', 'P06', 'P08'],
        founder: ['P14', 'P06', 'P02'],
        women_career: ['P01', 'P04', 'P12'],
        beginner_ai_brand: ['P04', 'P01', 'P13']
    };
    var FALLBACK = ['P01', 'P04', 'P05'];
    var PROMPT_LABELS = {
        P01: 'Build my evidence inventory',
        P02: 'Check what this role pays',
        P04: 'Rewrite my LinkedIn profile',
        P05: 'Rebuild my resume end to end',
        P06: 'Turn my work into case studies',
        P08: 'Write outreach that gets replies',
        P12: 'Negotiate the offer fairly',
        P13: 'Check if this course is worth it',
        P14: 'Plan a pivot or stress-test a venture'
    };

    function recommendations(db) {
        db = db || read() || {};
        var picks = RECOMMEND[db.persona] || FALLBACK;
        var out = picks.map(function (id) { return { id: id, target: 'prompt:' + id }; });
        if (db.story_300 && db.story_300.word_count >= 20) {
            out = [{ id: 'story', target: 'story', label: 'Your saved 300-word story' }].concat(out);
        }
        return out.slice(0, 4);
    }

    /* ------------------------------------------------------------------ dom */

    function cache() {
        els.grid = document.getElementById('challenge-grid');
        els.weeks = document.getElementById('challenge-weeks');
        els.progressText = document.getElementById('challenge-progress-text');
        els.progressFill = document.getElementById('challenge-progress-fill');
        els.streak = document.getElementById('challenge-streak');
        els.detail = document.getElementById('challenge-day');
        els.detailTitle = document.getElementById('challenge-day-title');
        els.detailWeek = document.getElementById('challenge-day-week');
        els.detailSummary = document.getElementById('challenge-day-summary');
        els.detailTask = document.getElementById('challenge-day-task');
        els.detailTip = document.getElementById('challenge-day-tip');
        els.detailAction = document.getElementById('challenge-day-action');
        els.note = document.getElementById('challenge-note');
        els.save = document.getElementById('challenge-save-note');
        els.toggle = document.getElementById('challenge-toggle');
        els.print = document.getElementById('challenge-print');
        els.recommended = document.getElementById('recommended-list');
        els.recommendedHost = document.getElementById('recommended-strip');
    }

    function personaKey() {
        var db = read();
        return db ? db.persona : '';
    }

    function weekTitle(id) {
        var found = '';
        (data.weeks || []).forEach(function (week) { if (week.id === id) { found = week.title; } });
        return found;
    }

    function renderWeeks() {
        if (!els.weeks || !data) { return; }
        els.weeks.textContent = '';
        var buttons = [{ id: 0, label: 'All 30 days' }].concat(
            (data.weeks || []).map(function (week) { return { id: week.id, label: week.label }; })
        );
        buttons.forEach(function (entry) {
            var button = el('button', 'chip challenge-filter', entry.label);
            button.type = 'button';
            button.setAttribute('data-week', String(entry.id));
            button.setAttribute('aria-pressed', String(weekFilter === entry.id));
            if (weekFilter === entry.id) { button.classList.add('is-active'); }
            els.weeks.appendChild(button);
        });
    }

    function renderGrid() {
        if (!els.grid || !data) { return; }
        var db = read() || {};
        var completed = normaliseDays((db.challenge_progress || {}).completed_days);
        var done = {};
        completed.forEach(function (number) { done[number] = true; });
        els.grid.textContent = '';
        (data.days || []).forEach(function (entry) {
            if (weekFilter && entry.week !== weekFilter) { return; }
            var card = el('button', 'challenge-card');
            card.type = 'button';
            card.setAttribute('data-day', String(entry.day));
            card.setAttribute('aria-pressed', done[entry.day] ? 'true' : 'false');
            card.setAttribute('aria-label', 'Day ' + entry.day + ': ' + entry.title + (done[entry.day] ? ', completed' : ''));
            if (done[entry.day]) { card.classList.add('is-done'); }
            if (entry.day === selected) { card.classList.add('is-selected'); }

            var top = el('span', 'challenge-card-top');
            top.appendChild(el('span', 'challenge-card-day', 'Day ' + entry.day));
            top.appendChild(el('span', 'challenge-card-week', 'W' + entry.week));
            card.appendChild(top);
            card.appendChild(el('span', 'challenge-card-title', entry.title));
            card.appendChild(el('span', 'challenge-card-state', done[entry.day] ? 'Done' : 'Open'));

            var plan = el('span', 'challenge-plan');
            plan.appendChild(el('span', 'challenge-plan-task', entry.task));
            plan.appendChild(el('span', 'challenge-plan-action', 'Link: ' + entry.action.label));
            card.appendChild(plan);
            els.grid.appendChild(card);
        });
        renderProgress(completed);
    }

    function renderProgress(completed) {
        var stats = summary(completed);
        if (els.progressText) {
            els.progressText.textContent = stats.completed + ' of 30 days complete · next open day ' + stats.next;
        }
        if (els.progressFill) { els.progressFill.style.width = stats.percent + '%'; }
        if (els.streak) { els.streak.textContent = 'Best streak: ' + stats.streak + (stats.streak === 1 ? ' day' : ' days'); }
        var bar = document.getElementById('challenge-progress');
        if (bar) { bar.setAttribute('aria-valuenow', String(stats.percent)); }
        var dashText = document.getElementById('dash-challenge-text');
        if (dashText) {
            dashText.textContent = stats.completed + ' of 30 days done. Next open day is Day ' + stats.next + '.';
        }
        var dashFill = document.getElementById('dash-challenge-fill');
        if (dashFill) { dashFill.style.width = stats.percent + '%'; }
        var dashBar = document.getElementById('dash-challenge-progress');
        if (dashBar) { dashBar.setAttribute('aria-valuenow', String(stats.percent)); }
    }

    function renderDetail() {
        if (!els.detail || !data) { return; }
        var entry = dayByNumber(selected);
        if (!entry) { return; }
        var db = read() || {};
        var progress = db.challenge_progress || {};
        var isDone = normaliseDays(progress.completed_days).indexOf(entry.day) !== -1;
        if (els.detailTitle) { els.detailTitle.textContent = 'Day ' + entry.day + ' · ' + entry.title; }
        if (els.detailWeek) { els.detailWeek.textContent = 'Week ' + entry.week + ' — ' + (weekTitle(entry.week) || ''); }
        if (els.detailSummary) { els.detailSummary.textContent = entry.summary; }
        if (els.detailTask) { els.detailTask.textContent = entry.task; }
        if (els.detailTip) { els.detailTip.textContent = tipFor(entry.day, personaKey()); }
        if (els.detailAction) {
            els.detailAction.textContent = entry.action.label;
            els.detailAction.setAttribute('data-nav', entry.action.target);
        }
        if (els.note) {
            var stored = (progress.notes_by_day || {})[String(entry.day)] || '';
            els.note.value = stored;
        }
        if (els.toggle) {
            els.toggle.textContent = isDone ? 'Mark day as open' : 'Mark day as done';
            els.toggle.setAttribute('aria-pressed', isDone ? 'true' : 'false');
            els.toggle.classList.toggle('is-done', isDone);
        }
    }

    function renderRecommendations() {
        if (!els.recommended) { return; }
        var db = read() || {};
        var picks = recommendations(db);
        els.recommended.textContent = '';
        picks.forEach(function (pick) {
            var label = pick.label;
            if (!label) { label = PROMPT_LABELS[pick.id] || pick.id; }
            var chip = el('button', 'chip', label);
            chip.type = 'button';
            chip.setAttribute('data-nav', pick.target);
            els.recommended.appendChild(chip);
        });
        if (els.recommendedHost) { els.recommendedHost.hidden = false; }
    }

    function renderAll() {
        renderWeeks();
        renderGrid();
        renderDetail();
        renderRecommendations();
    }

    function openDay(number) {
        selected = Math.max(1, Math.min(30, Number(number) || 1));
        var entry = dayByNumber(selected);
        if (entry && weekFilter && entry.week !== weekFilter) { weekFilter = 0; }
        renderWeeks();
        renderGrid();
        renderDetail();
        var panel = document.getElementById('challenge-day');
        if (panel && panel.scrollIntoView) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return selected;
    }

    function toggleDay(number) {
        var db = read();
        if (!db) { return; }
        var list = normaliseDays((db.challenge_progress || {}).completed_days);
        var done = list.indexOf(Number(number)) === -1;
        vaultLib().setChallengeDay(db, number, done);
        write(db);
        renderAll();
    }

    function saveNote(number, text) {
        var db = read();
        if (!db) { return; }
        var list = normaliseDays((db.challenge_progress || {}).completed_days);
        vaultLib().setChallengeDay(db, number, list.indexOf(Number(number)) !== -1, text);
        write(db);
    }

    function bind() {
        if (!els.grid) { return; }
        els.grid.addEventListener('click', function (event) {
            var card = event.target.closest('[data-day]');
            if (card) { openDay(card.getAttribute('data-day')); }
        });
        if (els.weeks) {
            els.weeks.addEventListener('click', function (event) {
                var chip = event.target.closest('[data-week]');
                if (!chip) { return; }
                weekFilter = Number(chip.getAttribute('data-week')) || 0;
                if (weekFilter) {
                    var first = null;
                    (data.days || []).forEach(function (entry) {
                        if (!first && entry.week === weekFilter) { first = entry.day; }
                    });
                    if (first) { selected = first; }
                }
                renderWeeks();
                renderGrid();
                renderDetail();
            });
        }
        if (els.toggle) { els.toggle.addEventListener('click', function () { toggleDay(selected); }); }
        if (els.save && els.note) {
            els.save.addEventListener('click', function () {
                saveNote(selected, els.note.value);
                els.save.textContent = 'Saved';
                window.setTimeout(function () { els.save.textContent = 'Save note'; }, 1200);
            });
        }
        if (els.print) {
            els.print.addEventListener('click', function () {
                document.body.classList.add('print-challenge');
                window.print();
                window.setTimeout(function () { document.body.classList.remove('print-challenge'); }, 300);
            });
        }
        document.addEventListener('emplostart:vault-changed', function () { renderAll(); });
        document.addEventListener('emplostart:challenge', function (event) {
            if (event.detail && event.detail.day) { openDay(event.detail.day); }
        });
    }

    function useData(payload) {
        data = payload;
        renderAll();
        return data;
    }

    function load() {
        if (window.fetch) {
            return window.fetch(DATA_URL).then(function (response) { return response.json(); }).then(function (payload) {
                data = payload;
                renderAll();
                return data;
            }).catch(function () { return null; });
        }
        return Promise.resolve(null);
    }

    function init() {
        cache();
        if (!els.grid) { return; }
        bind();
        if (data) { renderAll(); } else { load(); }
    }

    window.EmploStartChallenge = {
        init: init,
        load: load,
        useData: useData,
        openDay: openDay,
        toggleDay: toggleDay,
        saveNote: saveNote,
        tipFor: tipFor,
        weekFor: weekFor,
        bestStreak: bestStreak,
        nextOpenDay: nextOpenDay,
        summary: summary,
        recommendations: recommendations,
        get data() { return data; },
        get selected() { return selected; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
