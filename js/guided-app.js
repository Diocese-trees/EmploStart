/*
 * EmploStart: the self-guided shell.
 *
 * Owns the persona step, the three-path switcher, the one-question-at-a-time
 * check, the 300-word story studio and the action dashboard. Every state change
 * goes through candidate-vault.js, so the tools, the coach and the challenge
 * always read the same private vault.
 *
 * Public surface: window.EmploStartApp
 */
(function () {
    'use strict';

    var vaultLib = function () { return window.EmploStartVault; };
    var els = {};
    var quiz = { index: 0, answers: {}, done: false };

    var EXAMPLES = {
        stuck_employee: {
            who: 'I am an operations coordinator with six years in a mid-sized logistics company. I keep the weekly plan running and train new hires.',
            where: 'I am underpaid for the scope I hold, tired of covering for a role that was never filled, and I have no idea what my work is worth outside this company.',
            what: 'I want to move into a proper operations or project management role with a fair salary, and I want to test one move before I resign.'
        },
        student: {
            who: 'I am a final-year business student. I run the social accounts for a small shop and built a simple Excel tracker for their stock.',
            where: 'I have no formal experience and no portfolio, and I freeze when I read a job description that asks for three years.',
            what: 'I want a paid internship or a junior analyst role where I can show what I can already do.'
        },
        founder: {
            who: 'I am a founder of a two-person software studio. I handle sales, delivery and most of the support.',
            where: 'We have customers but no repeatable positioning, and every new conversation starts from zero. I am also unsure whether to keep going or pivot.',
            what: 'I want one clear customer problem, one honest offer, and a way to explain it that a stranger repeats correctly.'
        },
        women_career: {
            who: 'I am a former HR generalist who took three years out for family. Before the break I ran hiring for a 120-person company.',
            where: 'I am returning to work, my confidence is shaky, and I am worried the gap will be the first thing anyone sees.',
            what: 'I want a flexible HR or people operations role, remote or hybrid, where my experience counts and the hours are honest.'
        },
        beginner_ai_brand: {
            who: 'I am a customer support agent who has never used AI tools and has a LinkedIn profile with only a job title.',
            where: 'I do not understand prompts, I do not know what personal branding means, and I feel behind everyone else.',
            what: 'I want to learn one AI habit, fix my LinkedIn in plain language, and apply for a team lead role without sounding fake.'
        }
    };

    var BAND_TOOLS = {
        evidence: { label: 'Write one proof story', target: 'story' },
        positioning: { label: 'Open the Profile Builder', target: 'tool:profile' },
        market_clarity: { label: 'Check market readiness', target: 'tool:market' },
        ats_readiness: { label: 'Run the ATS check', target: 'tool:ats' },
        interview_readiness: { label: 'Practise interview answers', target: 'tool:interview' },
        negotiation: { label: 'Run the offer prompt P12', target: 'prompt:P12' },
        pivot_readiness: { label: 'Build a pivot plan', target: 'tool:pivot' }
    };

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text != null) { node.textContent = text; }
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

    // ---------------------------------------------------------------- views

    function showView(name) {
        var target = name === 'challenge' ? 'challenge' : name;
        if (!document.getElementById('view-' + target)) { target = 'start'; }
        ['start', 'profile', 'challenge', 'tools'].forEach(function (key) {
            var host = document.getElementById('view-' + key);
            if (host) { host.hidden = key !== target; }
        });
        Array.prototype.forEach.call(document.querySelectorAll('.step-button'), function (button) {
            var on = button.getAttribute('data-step') === target;
            if (on) { button.setAttribute('aria-current', 'step'); }
            else { button.removeAttribute('aria-current'); }
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (target === 'tools') { refreshDash(); }
    }

    function openPath(id) {
        var body = document.getElementById(id);
        if (!body) { return; }
        body.hidden = false;
        var opener = document.querySelector('[data-open="' + id + '"]');
        if (opener) { opener.setAttribute('aria-expanded', 'true'); }
        if (id === 'path-story') {
            var who = document.getElementById('story-who');
            if (who) { who.focus(); }
        } else {
            body.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function navigate(target) {
        if (!target) { return; }
        if (target === 'start' || target === 'profile' || target === 'tools' || target === 'challenge') {
            showView(target);
            return;
        }
        if (target === 'story') {
            showView('profile');
            openPath('path-story');
            return;
        }
        if (target === 'quiz') {
            showView('profile');
            openPath('path-quiz');
            return;
        }
        if (target === 'vault') {
            showView('profile');
            var vault = document.querySelector('.vault');
            if (vault) { vault.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            return;
        }
        if (target === 'library') {
            showView('tools');
            var library = document.getElementById('library');
            if (library) { library.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            return;
        }
        if (target === 'pledge') {
            var pledge = document.querySelector('.pledge');
            if (pledge) { pledge.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            return;
        }
        if (target === 'status') {
            openStatus();
            return;
        }
        if (target.indexOf('tool:') === 0) {
            var tool = target.slice(5);
            showView('tools');
            var tab = document.getElementById('tab-' + tool);
            if (tab) { tab.click(); tab.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            return;
        }
        if (target.indexOf('prompt:') === 0) {
            openPrompt(target.slice(7));
            return;
        }
        if (target.indexOf('challenge:') === 0) {
            var day = Number(target.slice(10)) || 1;
            document.dispatchEvent(new CustomEvent('emplostart:challenge', { detail: { day: day } }));
            if (window.EmploStartChallenge) { window.EmploStartChallenge.openDay(day); }
            else { showView('profile'); }
            return;
        }
        if (target.indexOf('guide:') === 0) {
            showView('tools');
            var guide = document.getElementById('guide-ai');
            if (guide) {
                guide.open = true;
                guide.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
    }

    function openPrompt(id) {
        showView('tools');
        var library = document.getElementById('library');
        if (library) { library.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        var card = document.querySelector('[data-prompt="' + id + '"]');
        if (card) { card.click(); return; }
        window.setTimeout(function () {
            var late = document.querySelector('[data-prompt="' + id + '"]');
            if (late) { late.click(); }
        }, 500);
    }

    function openStatus() {
        var dialog = document.getElementById('status-dialog');
        if (dialog && dialog.showModal) { dialog.showModal(); return; }
        navigate('pledge');
    }

    // ---------------------------------------------------------------- persona

    function personaSelected() {
        var db = read();
        return db ? db.persona : '';
    }

    function renderPersonas() {
        var host = els.personaGrid;
        if (!host || !window.EmploStartPersonas) { return; }
        host.textContent = '';
        window.EmploStartPersonas.list.forEach(function (persona) {
            var card = el('button', 'persona-card');
            card.type = 'button';
            card.setAttribute('data-persona', persona.key);
            card.setAttribute('aria-pressed', 'false');
            card.appendChild(el('span', 'persona-short', persona.short));
            card.appendChild(el('span', 'persona-title', persona.label));
            card.appendChild(el('span', 'persona-tip', persona.tip));
            card.addEventListener('click', function () { selectPersona(persona.key, true); });
            host.appendChild(card);
        });
        var active = personaSelected();
        if (active) { selectPersona(active, false); }
    }

    function selectPersona(key, advance) {
        var db = read();
        if (!db || !window.EmploStartPersonas) { return; }
        db = vaultLib().setPersona(db, key);
        write(db);
        Array.prototype.forEach.call(document.querySelectorAll('.persona-card'), function (card) {
            var on = card.getAttribute('data-persona') === key;
            card.classList.toggle('is-selected', on);
            card.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        var persona = window.EmploStartPersonas.get(key);
        if (els.personaContinue) {
            els.personaContinue.disabled = false;
            els.personaContinue.textContent = 'Continue as ' + persona.short;
        }
        if (els.personaNote) {
            els.personaNote.textContent = persona.firstStep ? 'First step: ' + persona.firstStep : '';
        }
        refreshDash();
        if (advance) { showView('profile'); }
    }

    // ---------------------------------------------------------------- quiz

    function renderQuiz() {
        var host = els.questions;
        var diagnostic = window.EmploStartIntake ? window.EmploStartIntake.DIAGNOSTIC : null;
        if (!host || !diagnostic || !diagnostic.length) { return; }
        var total = diagnostic.length;
        if (quiz.index >= total) { quiz.index = total - 1; }
        var q = diagnostic[quiz.index];
        host.textContent = '';

        var wrap = el('div', 'mcq-card');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-labelledby', 'mcq-prompt');

        var meta = el('div', 'mcq-meta');
        meta.appendChild(el('span', 'mcq-count', 'Question ' + (quiz.index + 1) + ' of ' + total));
        var track = el('div', 'mcq-progress');
        var fill = el('span');
        fill.style.width = Math.round(((quiz.index + 1) / total) * 100) + '%';
        track.appendChild(fill);
        meta.appendChild(track);
        wrap.appendChild(meta);

        var prompt = el('h3', 'mcq-prompt', q.prompt);
        prompt.id = 'mcq-prompt';
        wrap.appendChild(prompt);

        var options = el('div', 'mcq-options');
        q.options.forEach(function (option, index) {
            var button = el('button', 'mcq-option', option[0]);
            button.type = 'button';
            if (String(quiz.answers[q.id]) === String(index)) { button.classList.add('is-selected'); }
            button.addEventListener('click', function () { answerQuestion(q, index); });
            options.appendChild(button);
        });
        wrap.appendChild(options);

        var feedback = el('p', 'mcq-feedback');
        feedback.setAttribute('aria-live', 'polite');
        if (quiz.answers[q.id] != null) {
            var chosen = q.options[Number(quiz.answers[q.id])];
            feedback.textContent = feedbackFor(chosen ? chosen[1] : 0);
        }
        wrap.appendChild(feedback);

        var actions = el('div', 'mcq-actions');
        var back = el('button', 'btn btn--ghost btn--sm', 'Back');
        back.type = 'button';
        back.disabled = quiz.index === 0;
        back.addEventListener('click', function () {
            if (quiz.index > 0) { quiz.index -= 1; renderQuiz(); }
        });
        var next = el('button', 'btn btn--teal btn--sm', quiz.index === total - 1 ? 'See my bands' : 'Next');
        next.type = 'button';
        next.disabled = quiz.answers[q.id] == null;
        next.addEventListener('click', function () {
            if (quiz.answers[q.id] == null) { return; }
            if (quiz.index < total - 1) { quiz.index += 1; renderQuiz(); }
            else { finishQuiz(); }
        });
        actions.appendChild(back);
        actions.appendChild(next);
        wrap.appendChild(actions);

        host.appendChild(wrap);
    }

    function feedbackFor(score) {
        var value = Number(score) || 0;
        if (value >= 30) { return 'That is real evidence. It counts, and we will use it.'; }
        if (value >= 15) { return 'Noted. Rough is fine, we can sharpen it later.'; }
        return 'That is normal, and it is a task, not a verdict.';
    }

    function answerQuestion(q, index) {
        quiz.answers[q.id] = String(index);
        renderQuiz();
    }

    function finishQuiz() {
        var form = document.getElementById('lane-test-form');
        if (!form || !window.EmploStartIntake) { return; }
        var hidden = document.getElementById('mcq-answers');
        if (!hidden) {
            hidden = el('div');
            hidden.id = 'mcq-answers';
            hidden.hidden = true;
            form.appendChild(hidden);
        }
        hidden.textContent = '';
        window.EmploStartIntake.DIAGNOSTIC.forEach(function (q) {
            var label = el('label');
            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'diag-' + q.id;
            input.value = String(quiz.answers[q.id] == null ? 0 : quiz.answers[q.id]);
            input.checked = true;
            label.appendChild(input);
            hidden.appendChild(label);
        });
        quiz.done = true;
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

        var retake = el('button', 'btn btn--ghost btn--sm', 'Retake the check');
        retake.type = 'button';
        retake.addEventListener('click', function () {
            quiz = { index: 0, answers: {}, done: false };
            if (hidden) { hidden.textContent = ''; }
            var result = document.getElementById('lane-test-result');
            if (result) { result.textContent = ''; }
            renderQuiz();
        });
        var result = document.getElementById('lane-test-result');
        if (result) { result.appendChild(retake); }
        refreshDash();
        document.dispatchEvent(new CustomEvent('emplostart:vault-changed'));
    }

    // ---------------------------------------------------------------- story

    function storyText() {
        return {
            who_am_i: els.storyWho ? els.storyWho.value : '',
            where_am_i: els.storyWhere ? els.storyWhere.value : '',
            what_i_want: els.storyWhat ? els.storyWhat.value : ''
        };
    }

    function paintMeter() {
        if (!els.storyMeter || !window.EmploStartStory) { return; }
        var parts = storyText();
        var joined = [parts.who_am_i, parts.where_am_i, parts.what_i_want].join(' ');
        var words = window.EmploStartStory.countWords(joined);
        var status = window.EmploStartStory.wordStatus(words);
        els.storyMeter.textContent = words + ' / 300 words' + (
            status === 'good' ? ' · good length' :
            status === 'over' ? ' · getting long, still fine' :
            status === 'start' ? ' · keep going' : ''
        );
        els.storyMeter.classList.toggle('is-good', status === 'good');
        els.storyMeter.classList.toggle('is-over', status === 'over');
    }

    function loadExample() {
        var persona = personaSelected() || 'beginner_ai_brand';
        var example = EXAMPLES[persona] || EXAMPLES.beginner_ai_brand;
        if (els.storyWho) { els.storyWho.value = example.who; }
        if (els.storyWhere) { els.storyWhere.value = example.where; }
        if (els.storyWhat) { els.storyWhat.value = example.what; }
        paintMeter();
        els.storyWho.focus();
    }

    function saveStory() {
        var db = read();
        if (!db || !window.EmploStartStory) { return null; }
        var persona = db.persona || 'beginner_ai_brand';
        var result = window.EmploStartStory.parseStory300(storyText(), persona);
        db = vaultLib().setStory(db, {
            raw_text: result.raw_text,
            who_am_i: result.who_am_i,
            where_am_i: result.where_am_i,
            what_i_want: result.what_i_want,
            word_count: result.word_count,
            extracted_signals: result.extracted_signals
        });
        db = vaultLib().merge(db, result.fields, 'story_parse');
        vaultLib().computeBands(db);
        write(db);
        return result;
    }

    function renderStorySummary(result) {
        var host = els.storySummary;
        if (!host || !result) { return; }
        host.textContent = '';
        host.hidden = false;
        host.appendChild(el('p', 'story-summary-head', 'What EmploStart understood from your story'));
        var chips = el('div', 'story-signals');
        (result.extracted_signals.length ? result.extracted_signals : ['Not much yet, and that is fine.']).forEach(function (signal) {
            chips.appendChild(el('span', 'story-chip', signal));
        });
        host.appendChild(chips);
        var tools = result.recommended.tools.map(function (tool) { return tool.name; }).join(' and ');
        var prompts = result.recommended.prompts.join(' and ');
        host.appendChild(el('p', 'panel-hint', 'Start with ' + (tools || 'one tool') + '. The prompts that fit today: ' + (prompts || 'P01') + '.'));
        if (result.frictions.length) {
            host.appendChild(el('p', 'panel-hint', 'Named honestly: ' + result.frictions.map(function (f) { return f.label; }).join('; ') + '.'));
        }
        var actions = el('div', 'actions');
        result.recommended.tools.forEach(function (tool) {
            var button = el('button', 'btn btn--ghost btn--sm', 'Open ' + tool.name);
            button.type = 'button';
            button.setAttribute('data-nav', 'tool:' + tool.id);
            actions.appendChild(button);
        });
        result.recommended.prompts.forEach(function (id) {
            var button = el('button', 'btn btn--ghost btn--sm', 'Try ' + id);
            button.type = 'button';
            button.setAttribute('data-nav', 'prompt:' + id);
            actions.appendChild(button);
        });
        host.appendChild(actions);
        host.appendChild(el('p', 'panel-hint', 'Saved to your vault. Hand-typed fields were left alone where they existed.'));
    }

    // ---------------------------------------------------------------- dashboard

    function bandRows(host, bands) {
        if (!host || !vaultLib()) { return; }
        host.textContent = '';
        var keys = vaultLib().BAND_KEYS;
        keys.forEach(function (key) {
            var band = bands[key];
            if (!band) { return; }
            var row = el('div', 'vault-band');
            row.appendChild(el('span', null, key.replace(/_/g, ' ')));
            row.appendChild(el('strong', 'band-' + band.label.toLowerCase().replace(/\s+/g, '-'), band.label));
            host.appendChild(row);
        });
    }

    function lowestBandKey(bands) {
        var lowest = null;
        Object.keys(bands || {}).forEach(function (key) {
            if (!lowest || bands[key].score < bands[lowest].score) { lowest = key; }
        });
        return lowest;
    }

    function refreshDash() {
        var db = read();
        if (!db || !vaultLib()) { return; }
        var bands = vaultLib().computeBands(db);
        bandRows(els.dashBands, bands);

        var text = '';
        var label = 'Open it';
        var target = 'profile';
        var persona = db.persona ? window.EmploStartPersonas.get(db.persona) : null;
        var hasStory = Boolean(db.story_300 && db.story_300.raw_text);
        var scored = Object.keys(db.readiness_bands || {}).length > 0;

        if (!db.persona) {
            text = 'Pick who you are today. It takes one tap and changes the tone of everything else.';
            label = 'Choose my persona';
            target = 'start';
        } else if (!hasStory && !scored) {
            text = 'Write 300 honest words, or take the twelve-tap check. Either one fills the snapshot.';
            label = 'Write my story';
            target = 'story';
        } else if (!scored) {
            text = 'Your story is saved. Now the twelve-tap check turns it into four honest bands.';
            label = 'Take the check';
            target = 'quiz';
        } else {
            var lowest = lowestBandKey(bands);
            var step = BAND_TOOLS[lowest] || { label: 'Open the tools', target: 'tools' };
            text = 'Your weakest band is ' + String(lowest || 'evidence').replace(/_/g, ' ') + '. One focused move: ' + step.label + '.';
            label = step.label;
            target = step.target;
        }
        if (persona && db.persona) {
            text = persona.short + ' · ' + text;
        }
        if (els.dashNextText) { els.dashNextText.textContent = text; }
        if (els.dashNextButton) {
            els.dashNextButton.textContent = label;
            els.dashNextButton.setAttribute('data-nav', target);
        }
    }

    // ---------------------------------------------------------------- privacy

    function paintPrivacy() {
        if (!vaultLib()) { return; }
        var session = vaultLib().mode() === 'session';
        if (els.privacy) { els.privacy.setAttribute('aria-pressed', session ? 'true' : 'false'); }
        if (els.vaultMode) { els.vaultMode.value = session ? 'session' : 'persistent'; }
    }

    function togglePrivacy() {
        if (!vaultLib()) { return; }
        var next = vaultLib().mode() === 'session' ? 'persistent' : 'session';
        vaultLib().setMode(next);
        paintPrivacy();
        if (els.vaultNote) {
            els.vaultNote.textContent = next === 'session'
                ? 'Shared PC mode: this vault wipes when the tab closes.'
                : 'This vault stays in this browser until you wipe it.';
        }
    }

    // ---------------------------------------------------------------- wiring

    function wire() {
        Array.prototype.forEach.call(document.querySelectorAll('.step-button'), function (button) {
            button.addEventListener('click', function () { showView(button.getAttribute('data-step')); });
        });
        document.addEventListener('click', function (event) {
            var opener = event.target.closest && event.target.closest('[data-open]');
            if (opener) {
                event.preventDefault();
                openPath(opener.getAttribute('data-open'));
                return;
            }
            var nav = event.target.closest && event.target.closest('[data-nav]');
            if (nav) {
                event.preventDefault();
                navigate(nav.getAttribute('data-nav'));
            }
        });
        document.addEventListener('emplostart:navigate', function (event) {
            navigate(event.detail && event.detail.target);
        });
        document.addEventListener('emplostart:vault-changed', refreshDash);

        if (els.personaContinue) {
            els.personaContinue.addEventListener('click', function () {
                if (personaSelected()) { showView('profile'); }
                else if (els.personaNote) { els.personaNote.textContent = 'Pick a persona first, or skip below.'; }
            });
        }
        if (els.personaSkip) {
            els.personaSkip.addEventListener('click', function () { showView('profile'); });
        }
        if (els.privacy) { els.privacy.addEventListener('click', togglePrivacy); }
        if (els.vaultMode) {
            els.vaultMode.addEventListener('change', function () {
                if (vaultLib()) { vaultLib().setMode(els.vaultMode.value); }
                paintPrivacy();
            });
        }
        var quizCoach = document.getElementById('quiz-coach');
        if (quizCoach) {
            quizCoach.addEventListener('click', function () {
                if (window.EmploStartCoach) {
                    window.EmploStartCoach.open();
                    window.EmploStartCoach.ask('What does ATS mean and how do I start?');
                }
            });
        }
        if (els.storyWho) { els.storyWho.addEventListener('input', paintMeter); }
        if (els.storyWhere) { els.storyWhere.addEventListener('input', paintMeter); }
        if (els.storyWhat) { els.storyWhat.addEventListener('input', paintMeter); }
        if (els.storyExample) { els.storyExample.addEventListener('click', loadExample); }
        if (els.storyExtract) {
            els.storyExtract.addEventListener('click', function () {
                var result = saveStory();
                if (result) {
                    renderStorySummary(result);
                    document.getElementById('story-summary').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        }
        if (els.storySave) {
            els.storySave.addEventListener('click', function () {
                var db = read();
                if (!db || !vaultLib()) { return; }
                var parts = storyText();
                db = vaultLib().setStory(db, {
                    raw_text: [parts.who_am_i, parts.where_am_i, parts.what_i_want].filter(Boolean).join('\n\n'),
                    who_am_i: parts.who_am_i,
                    where_am_i: parts.where_am_i,
                    what_i_want: parts.what_i_want,
                    word_count: window.EmploStartStory ? window.EmploStartStory.countWords(parts.who_am_i + ' ' + parts.where_am_i + ' ' + parts.what_i_want) : 0,
                    extracted_signals: db.story_300.extracted_signals
                });
                write(db);
                if (els.storyMeter) { els.storyMeter.textContent = 'Saved to your vault · ' + db.story_300.word_count + ' / 300 words'; }
            });
        }
    }

    function restoreStory() {
        var db = read();
        if (!db || !db.story_300) { return; }
        if (els.storyWho) { els.storyWho.value = db.story_300.who_am_i || ''; }
        if (els.storyWhere) { els.storyWhere.value = db.story_300.where_am_i || ''; }
        if (els.storyWhat) { els.storyWhat.value = db.story_300.what_i_want || ''; }
        paintMeter();
    }

    function init() {
        els.personaGrid = document.getElementById('persona-grid');
        els.personaContinue = document.getElementById('persona-continue');
        els.personaSkip = document.getElementById('persona-skip');
        els.personaNote = document.getElementById('persona-note');
        els.questions = document.getElementById('lane-test-questions');
        els.storyWho = document.getElementById('story-who');
        els.storyWhere = document.getElementById('story-where');
        els.storyWhat = document.getElementById('story-what');
        els.storyMeter = document.getElementById('story-meter');
        els.storyExample = document.getElementById('story-example');
        els.storyExtract = document.getElementById('story-extract');
        els.storySave = document.getElementById('story-save');
        els.storySummary = document.getElementById('story-summary');
        els.dashBands = document.getElementById('dash-bands');
        els.dashNextText = document.getElementById('dash-next-text');
        els.dashNextButton = document.getElementById('dash-next-button');
        els.privacy = document.getElementById('privacy-toggle');
        els.vaultMode = document.getElementById('vault-mode');
        els.vaultNote = document.getElementById('vault-note');

        wire();
        renderPersonas();
        paintPrivacy();
        restoreStory();
        if (els.questions && window.EmploStartIntake) { renderQuiz(); }
        refreshDash();
        showView('start');
    }

    window.EmploStartApp = {
        init: init,
        showView: showView,
        navigate: navigate,
        openPath: openPath,
        refreshDash: refreshDash,
        selectPersona: selectPersona,
        saveStory: saveStory,
        renderQuiz: renderQuiz,
        quizState: function () { return quiz; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
