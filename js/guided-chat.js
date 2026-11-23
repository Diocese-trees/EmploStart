/*
 * EmploStart: the local live coach.
 *
 * Deterministic, offline, and aware of the persona and the vault. It reads
 * data/coach-knowledge.json, matches the message against topic triggers and
 * replies with plain language plus clickable next steps. The AI adapter is
 * wired but dormant: with no endpoint or no consent, nothing is sent and the
 * local reply stands on its own.
 *
 * Public surface: window.EmploStartCoach
 */
(function () {
    'use strict';

    var knowledge = null;
    var els = {};
    var openState = false;

    function tokens(text) {
        return String(text || '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function scoreTopic(topic, message, persona) {
        if (!topic || !Array.isArray(topic.triggers)) { return 0; }
        var hay = ' ' + tokens(message) + ' ';
        var score = 0;
        topic.triggers.forEach(function (trigger) {
            var needle = tokens(trigger);
            if (!needle) { return; }
            if (hay.indexOf(' ' + needle + ' ') !== -1) { score += needle.indexOf(' ') === -1 ? 2 : 3; }
        });
        if (persona) {
            if (persona === 'student' && topic.id === 'student_proof') { score += 1.5; }
            if (persona === 'founder' && topic.id === 'founder_pivot') { score += 1.5; }
            if (persona === 'women_career' && topic.id === 'women_return') { score += 1.5; }
            if (persona === 'stuck_employee' && topic.id === 'stuck_job') { score += 1.5; }
            if (persona === 'beginner_ai_brand' && topic.id === 'ai_basics') { score += 1.5; }
        }
        return score;
    }

    function pickTopic(message, persona, data) {
        var source = data || knowledge;
        if (!source || !source.topics) { return null; }
        var best = null;
        var bestScore = 0;
        source.topics.forEach(function (topic) {
            var score = scoreTopic(topic, message, persona);
            /* A single real trigger is worth 2 points; persona bias alone (1.5)
               must not route an unrelated message, so it falls back to the
               generic reply instead of guessing a topic. */
            if (score >= 2 && score > bestScore) { best = topic; bestScore = score; }
        });
        return best;
    }

    function answer(message, context, knowledgeData) {
        var data = knowledgeData || knowledge;
        if (!data) {
            return { id: 'offline', title: 'Local coach', reply: 'The coach notes could not load. The tools and prompts still work offline.', actions: [] };
        }
        var persona = context && context.persona;
        var text = String(message || '').trim();
        if (!text) {
            return { id: 'greeting', title: 'Local coach', reply: data.greeting || 'Ask me anything in plain language.', actions: [
                { label: 'Where do I start?', target: 'topic:start' },
                { label: 'Open the 300-word story', target: 'story' }
            ] };
        }
        var topic = pickTopic(text, persona, data);
        if (!topic) {
            var fallback = (data && data.fallback) || { reply: 'I did not catch that. Try a keyword like AI, LinkedIn, CV, interview or pay.', actions: [] };
            return {
                id: 'fallback',
                title: 'Local coach',
                reply: fallback.reply,
                actions: fallback.actions || []
            };
        }
        return { id: topic.id, title: topic.title, reply: topic.reply, actions: (topic.actions || []).slice() };
    }

    function botBubble(result) {
        var bubble = document.createElement('div');
        bubble.className = 'coach-bubble coach-bubble--bot';
        if (result.title) {
            var head = document.createElement('strong');
            head.className = 'coach-bubble-title';
            head.textContent = result.title;
            bubble.appendChild(head);
        }
        var text = document.createElement('p');
        text.textContent = result.reply;
        bubble.appendChild(text);
        if (result.actions && result.actions.length) {
            var actions = document.createElement('div');
            actions.className = 'coach-actions';
            result.actions.forEach(function (action) {
                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'coach-action';
                button.textContent = action.label;
                button.addEventListener('click', function () { follow(action.target); });
                actions.appendChild(button);
            });
            bubble.appendChild(actions);
        }
        return bubble;
    }

    function userBubble(text) {
        var bubble = document.createElement('div');
        bubble.className = 'coach-bubble coach-bubble--user';
        bubble.textContent = text;
        return bubble;
    }

    function append(node) {
        if (!els.log) { return; }
        els.log.appendChild(node);
        els.log.scrollTop = els.log.scrollHeight;
    }

    function currentContext() {
        var vault = window.EmploStartVault ? window.EmploStartVault.read() : null;
        return {
            persona: vault ? vault.persona : '',
            has_story: Boolean(vault && vault.story_300 && vault.story_300.raw_text),
            completeness: vault ? window.EmploStartVault.completeness(vault) : 0
        };
    }

    function follow(target) {
        if (!target) { return; }
        if (target.indexOf('topic:') === 0) {
            var id = target.slice(6);
            var topic = null;
            (knowledge && knowledge.topics || []).forEach(function (entry) { if (entry.id === id) { topic = entry; } });
            if (topic) {
                append(userBubble(topic.title));
                append(botBubble({ title: topic.title, reply: topic.reply, actions: topic.actions || [] }));
            }
            return;
        }
        document.dispatchEvent(new CustomEvent('emplostart:navigate', { detail: { target: target } }));
    }

    function ask(text) {
        var message = String(text || '').trim();
        if (!message) { return; }
        append(userBubble(message));
        var result = answer(message, currentContext(), knowledge);
        append(botBubble(result));

        var AI = window.EmploStartAI;
        if (AI && AI.available && AI.available() && AI.consentGiven && AI.consentGiven()) {
            AI.ask({ module: 'coach', message: message }).then(function (res) {
                if (res && res.ok && res.data && res.data.reply) {
                    var note = document.createElement('div');
                    note.className = 'coach-bubble coach-bubble--ai';
                    note.textContent = 'AI addition: ' + String(res.data.reply);
                    append(note);
                }
            });
        }
    }

    function open() {
        if (!els.panel) { return; }
        openState = true;
        els.panel.classList.add('is-open');
        els.panel.setAttribute('aria-hidden', 'false');
        if (els.launch) { els.launch.setAttribute('aria-expanded', 'true'); }
        if (els.input) { els.input.focus(); }
    }

    function close() {
        if (!els.panel) { return; }
        openState = false;
        els.panel.classList.remove('is-open');
        els.panel.setAttribute('aria-hidden', 'true');
        if (els.launch) { els.launch.setAttribute('aria-expanded', 'false'); }
    }

    function toggle() {
        if (openState) { close(); } else { open(); }
    }

    function welcome() {
        if (!els.log || els.log.children.length) { return; }
        append(botBubble({
            title: 'Local coach',
            reply: (knowledge && knowledge.greeting) || 'Ask me anything about AI, LinkedIn, CVs, interviews or pay.',
            actions: [
                { label: 'How to use AI', target: 'topic:ai_basics' },
                { label: 'LinkedIn without cringe', target: 'topic:linkedin_branding' },
                { label: 'I feel stuck at work', target: 'topic:stuck_job' }
            ]
        }));
    }

    function renderSuggestions() {
        if (!els.suggestions || !knowledge) { return; }
        var picks = ['ai_basics', 'linkedin_branding', 'stuck_job', 'student_proof'];
        picks.forEach(function (id) {
            var topic = null;
            knowledge.topics.forEach(function (entry) { if (entry.id === id) { topic = entry; } });
            if (!topic) { return; }
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'coach-chip';
            chip.textContent = topic.title;
            chip.addEventListener('click', function () { ask(topic.title); });
            els.suggestions.appendChild(chip);
        });
    }

    function init() {
        els.panel = document.getElementById('coach');
        els.log = document.getElementById('coach-log');
        els.input = document.getElementById('coach-input');
        els.form = document.getElementById('coach-form');
        els.suggestions = document.getElementById('coach-suggestions');
        els.launch = document.getElementById('coach-launch');
        els.close = document.getElementById('coach-close');
        if (!els.panel) { return; }

        if (els.launch) { els.launch.addEventListener('click', toggle); }
        if (els.close) { els.close.addEventListener('click', close); }
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && openState) { close(); }
        });
        if (els.form) {
            els.form.addEventListener('submit', function (event) {
                event.preventDefault();
                if (!els.input) { return; }
                var value = els.input.value;
                els.input.value = '';
                ask(value);
            });
        }

        fetch('data/coach-knowledge.json').then(function (response) {
            return response.json();
        }).then(function (data) {
            knowledge = data;
            welcome();
            renderSuggestions();
        }).catch(function () {
            knowledge = null;
            welcome();
        });
    }

    window.EmploStartCoach = {
        init: init,
        open: open,
        close: close,
        toggle: toggle,
        ask: ask,
        follow: follow,
        answer: answer,
        scoreTopic: scoreTopic,
        load: function (data) { knowledge = data; welcome(); renderSuggestions(); return knowledge; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
