/*
 * EmploStart shell controller.
 *
 * Non-AI by default. Every module calls a local deterministic engine. AI mode
 * is opt-in through js/ai.js and only decorates results; if it is off, absent,
 * or fails, the local output stands on its own.
 */
(function () {
    'use strict';

    var E = window.EmploStartEngines || {};
    var T = window.EmplowiseToolkit || {};
    var AI = window.EmploStartAI;

    // ------------------------------------------------------------------
    // Small DOM helpers
    // ------------------------------------------------------------------
    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (key) {
                if (key === 'text') { node.textContent = attrs[key]; }
                else if (key === 'class') { node.className = attrs[key]; }
                else { node.setAttribute(key, attrs[key]); }
            });
        }
        (children || []).forEach(function (child) {
            if (child == null) { return; }
            node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        });
        return node;
    }

    function card(title, children) {
        var head = title ? el('h3', { text: title }) : null;
        return el('div', { class: 'card' }, [head].concat(children || []));
    }

    function list(items, ordered) {
        return el(ordered ? 'ol' : 'ul', { class: 'list' }, (items || []).map(function (i) {
            return el('li', { text: String(i) });
        }));
    }

    function metric(value, label) {
        return el('div', { class: 'metric' }, [
            el('b', { text: String(value) }),
            el('span', { text: label })
        ]);
    }

    function bar(score) {
        var fill = el('span', { style: 'width:' + Math.max(0, Math.min(100, Number(score) || 0)) + '%' });
        return el('div', { class: 'bar' }, [fill]);
    }

    function disclaimer(text) {
        return el('p', { class: 'disclaimer', text: text });
    }

    function formData(form) {
        var data = {};
        Array.prototype.forEach.call(form.elements, function (field) {
            if (field.name) { data[field.name] = field.value; }
        });
        return data;
    }

    function setResult(name, node) {
        var host = document.getElementById('result-' + name);
        host.textContent = '';
        if (node) { host.appendChild(node); }
    }

    // Optional AI enhancement. It never blocks the local result: if AI is off,
    // unavailable or fails, the deterministic output above stands on its own.
    function enhanceAI(name, message) {
        if (!AI || !AI.available || !AI.available() || !AI.consentGiven()) { return; }
        AI.ask({ module: name, message: message }).then(function (res) {
            var host = document.getElementById('result-' + name);
            if (!host) { return; }
            if (res && res.ok && res.data && res.data.reply) {
                host.appendChild(el('div', { class: 'card' }, [
                    el('h3', { text: 'AI suggestion (optional)' }),
                    el('p', { text: String(res.data.reply) })
                ]));
            } else if (res && (res.reason === 'request-failed' || res.reason === 'upstream-failed')) {
                host.appendChild(el('p', { class: 'bridge', text: 'AI is on but unavailable right now. The local result above stands.' }));
            }
        });
    }

    // ------------------------------------------------------------------
    // Tabs
    // ------------------------------------------------------------------
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.module-tab'));

    function activate(name) {
        tabs.forEach(function (tab) {
            var on = tab.getAttribute('data-panel') === name;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            var panel = document.getElementById('panel-' + tab.getAttribute('data-panel'));
            if (panel) { panel.hidden = !on; }
        });
    }

    tabs.forEach(function (tab, index) {
        tab.addEventListener('click', function () { activate(tab.getAttribute('data-panel')); });
        tab.addEventListener('keydown', function (event) {
            var next = null;
            if (event.key === 'ArrowRight') { next = (index + 1) % tabs.length; }
            if (event.key === 'ArrowLeft') { next = (index - 1 + tabs.length) % tabs.length; }
            if (event.key === 'Home') { next = 0; }
            if (event.key === 'End') { next = tabs.length - 1; }
            if (next !== null) {
                event.preventDefault();
                tabs[next].focus();
                activate(tabs[next].getAttribute('data-panel'));
            }
        });
    });

    // ------------------------------------------------------------------
    // Pivot planner
    // ------------------------------------------------------------------
    function renderPivot(data) {
        var wrap = el('div', {}, [
            card(data.headline, [
                metric(data.readiness + ' / 100', 'readiness to start'),
                bar(data.readiness)
            ])
        ]);
        data.phases.forEach(function (phase) {
            wrap.appendChild(card(phase.name + ' · ' + phase.weeks + ' weeks', [
                el('p', { text: phase.focus }),
                list(phase.actions, true)
            ]));
        });
        wrap.appendChild(card('Bridge skills to build', [
            el('div', {}, data.bridges.map(function (b) {
                return el('p', {}, [el('strong', { text: b.label + ': ' }), document.createTextNode(b.hint)]);
            }))
        ]));
        wrap.appendChild(card('Watch-outs', [list(data.risks)]));
        wrap.appendChild(disclaimer(data.disclaimer));
        return wrap;
    }

    // ------------------------------------------------------------------
    // Reimagination lab
    // ------------------------------------------------------------------
    function renderReimagine(data) {
        var wrap = el('div', {}, [el('p', { class: 'panel-note', text: data.note })]);
        data.matches.forEach(function (m) {
            wrap.appendChild(card(m.title, [
                el('p', { text: m.why }),
                el('div', {}, m.titles.map(function (t) { return el('span', { class: 'pill', text: t }); })),
                el('p', { text: 'Skills to build: ' + m.skills.join(', ') }),
                el('p', {}, [el('strong', { text: 'First step: ' }), document.createTextNode(m.firstStep)]),
                el('p', {}, [el('strong', { text: 'Caution: ' }), document.createTextNode(m.caution)])
            ]));
        });
        wrap.appendChild(disclaimer(data.disclaimer));
        return wrap;
    }

    // ------------------------------------------------------------------
    // Market and fair-wage readiness
    // ------------------------------------------------------------------
    function renderMarket(data) {
        var wrap = el('div', {}, [
            card('Readiness: ' + data.band, [
                metric(data.overall + ' / 100', 'overall'),
                bar(data.overall)
            ])
        ]);
        data.dimensions.forEach(function (d) {
            wrap.appendChild(el('div', { class: 'card' }, [
                el('p', {}, [el('strong', { text: d.label + ' — ' + d.score + '/100' })]),
                bar(d.score),
                el('p', { class: 'panel-note', text: d.note })
            ]));
        });
        wrap.appendChild(card('Research checklist', [list(data.checklist, true)]));
        wrap.appendChild(card('Questions to ask', [list(data.questions)]));
        wrap.appendChild(card('Red flags', [list(data.redFlags)]));
        wrap.appendChild(disclaimer(data.disclaimer));
        wrap.appendChild(el('p', { class: 'bridge', text: data.bridge }));
        return wrap;
    }

    // ------------------------------------------------------------------
    // ATS analyzer
    // ------------------------------------------------------------------
    function renderAts(data) {
        var wrap = el('div', {}, [
            card(data.verdict, [
                metric(data.score + ' / 100', 'match score'),
                bar(data.score),
                el('p', { text: data.breakdown.map(function (b) { return b.label + ' ' + b.score + '/' + b.max; }).join(' · ') })
            ])
        ]);
        if (data.matched && data.matched.length) {
            wrap.appendChild(card('Matched keywords', [el('div', {}, data.matched.map(function (k) { return el('span', { class: 'pill', text: k }); }))]));
        }
        if (data.missing && data.missing.length) {
            wrap.appendChild(card('Add these if they are true', [el('div', {}, data.missing.map(function (k) { return el('span', { class: 'pill', text: k }); }))]));
        }
        if (data.fixes && data.fixes.length) {
            wrap.appendChild(card('Fixes', [list(data.fixes)]));
        }
        return wrap;
    }

    // ------------------------------------------------------------------
    // Interview prep
    // ------------------------------------------------------------------
    function renderInterview(role, level, data) {
        var wrap = el('div', {});
        if (!data.questions || !data.questions.length) {
            wrap.appendChild(el('p', { class: 'error', text: 'No questions came back. Try another role or level.' }));
            return wrap;
        }
        data.questions.forEach(function (question) {
            var answer = el('textarea', { rows: '3', placeholder: 'Answer with a situation, your action, and a result.' });
            var out = el('div', { class: 'result' });
            var button = el('button', { class: 'btn btn--teal btn--sm', type: 'button', text: 'Score this answer' });
            button.addEventListener('click', function () {
                if (!answer.value.trim()) {
                    out.textContent = '';
                    out.appendChild(el('p', { class: 'error', text: 'Write an answer first.' }));
                    return;
                }
                var fb = T.interview.feedback(role, level, question, answer.value);
                out.textContent = '';
                out.appendChild(card(fb.verdict, [
                    metric(fb.score + ' / 100', 'answer score'),
                    bar(fb.score),
                    el('p', {}, [el('strong', { text: 'Strengths: ' }), document.createTextNode((fb.strengths || []).join(' '))]),
                    el('p', {}, [el('strong', { text: 'Next probe: ' }), document.createTextNode(fb.next_probe || '')])
                ]));
            });
            wrap.appendChild(card(question, [answer, el('div', { class: 'actions' }, [button]), out]));
        });
        return wrap;
    }

    // ------------------------------------------------------------------
    // Profile builder
    // ------------------------------------------------------------------
    function renderProfile(data) {
        var wrap = el('div', {});
        if (data.headlines && data.headlines.length) {
            wrap.appendChild(card('Headline options', [list(data.headlines)]));
        }
        wrap.appendChild(card('Rewritten summary', [el('p', { text: data.summary })]));
        if (data.bullets && data.bullets.length) {
            wrap.appendChild(card('Rewritten bullets', [list(data.bullets)]));
        }
        if (data.fixes && data.fixes.length) {
            wrap.appendChild(card('Still to fix', [list(data.fixes)]));
        }
        return wrap;
    }

    // ------------------------------------------------------------------
    // Form wiring
    // ------------------------------------------------------------------
    document.querySelectorAll('form[data-module]').forEach(function (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var data = formData(form);
            var module = form.getAttribute('data-module');
            try {
                if (module === 'pivot') {
                    setResult('pivot', renderPivot(E.pivot.plan(data)));
                    enhanceAI('pivot', 'I am a ' + (data.current || 'professional') + ' moving toward ' + (data.target || 'a new field') + '. My strengths are ' + (data.strengths || data.skills || 'varied') + '. Suggest one extra concrete step to add to my plan.');
                } else if (module === 'reimagine') {
                    setResult('reimagine', renderReimagine(E.reimagine.lab(data)));
                    enhanceAI('reimagine', 'My strengths are ' + (data.strengths || 'varied') + ' and my interests are ' + (data.interests || 'broad') + '. Name one role direction I may have missed and one thing to test it.');
                } else if (module === 'market') {
                    setResult('market', renderMarket(E.market.assess(data)));
                    enhanceAI('market', 'I am assessing a ' + (data.role || 'target role') + ' role in ' + (data.region || 'my region') + '. What public sources should I check for pay, and what should I record?');
                } else if (module === 'ats') {
                    if (!data.resume.trim() || !data.jd.trim()) {
                        setResult('ats', el('p', { class: 'error', text: 'Paste both the resume and the job description.' }));
                        return;
                    }
                    setResult('ats', renderAts(T.ats.score(data.resume, data.jd)));
                    enhanceAI('ats', 'Suggest two truthful improvements to a resume for this job description. Do not invent experience.');
                } else if (module === 'interview') {
                    setResult('interview', renderInterview(data.role, data.level, T.interview.questions(data.role, data.level)));
                } else if (module === 'profile') {
                    setResult('profile', renderProfile(T.profile.optimize(data.headline, data.summary, data.bullets, data.targetRole)));
                    enhanceAI('profile', 'Rewrite this headline for a ' + (data.targetRole || 'target') + ' role without inventing experience: ' + (data.headline || ''));
                }
            } catch (error) {
                setResult(module, el('p', { class: 'error', text: 'That input could not be scored. Check the fields and try again.' }));
            }
        });
    });

    // ------------------------------------------------------------------
    // Prompt library
    // ------------------------------------------------------------------
    var prompts = [];
    var promptList = document.getElementById('prompt-list');
    var promptSearch = document.getElementById('prompt-search');

    function renderPrompts() {
        if (!promptList) { return; }
        var q = (promptSearch.value || '').toLowerCase().trim();
        promptList.textContent = '';
        prompts.filter(function (p) {
            if (!q) { return true; }
            var hay = [p.text, p.category, p.title, p.use].join(' ').toLowerCase();
            return hay.indexOf(q) >= 0;
        }).forEach(function (p) {
            var copy = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Copy prompt' });
            copy.addEventListener('click', function () {
                copyText(p.text, copy);
            });
            promptList.appendChild(el('li', {}, [
                el('div', { class: 'prompt-tags', text: [p.category, p.title].filter(Boolean).join(' · ') }),
                el('div', { class: 'prompt-text', text: p.text }),
                p.use ? el('p', { class: 'panel-note', text: p.use }) : null,
                copy
            ]));
        });
    }

    function copyText(text, button) {
        var done = function () {
            button.textContent = 'Copied';
            window.setTimeout(function () { button.textContent = 'Copy prompt'; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } else {
            fallbackCopy(text);
            done();
        }
    }

    function fallbackCopy(text) {
        var area = el('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); } catch (e) { /* leave selection to the user */ }
        document.body.removeChild(area);
    }

    if (promptList) {
        fetch('data/toolkit.json').then(function (r) { return r.json(); }).then(function (data) {
            prompts = data.prompts || [];
            renderPrompts();
        }).catch(function () {
            promptList.appendChild(el('li', { text: 'Prompts could not load. Everything else still works.' }));
        });
        promptSearch.addEventListener('input', renderPrompts);
    }

    // ------------------------------------------------------------------
    // AI mode toggle and consent
    // ------------------------------------------------------------------
    var badge = document.getElementById('mode-badge');
    var toggle = document.getElementById('ai-toggle');
    var note = document.getElementById('mode-note');
    var dialog = document.getElementById('consent-dialog');

    function paintMode() {
        var on = AI && AI.consentGiven && AI.consentGiven();
        badge.textContent = on ? 'AI opt-in on · Local tools still work' : 'Free Local Edition · In active build';
        badge.setAttribute('data-mode', on ? 'ai' : 'local');
        toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
        toggle.textContent = on ? 'Disable AI' : 'Enable AI (opt-in)';
        note.textContent = on
            ? 'AI mode is on. Text you submit may be sent to the AI endpoint; local results still work if it fails.'
            : 'Free Local Edition · In active build (AI mode planned). Nothing you type leaves this page.';
    }

    if (AI && AI.available && AI.available()) {
        toggle.disabled = false;
        toggle.addEventListener('click', function () {
            if (AI.consentGiven()) {
                AI.setConsent(false);
                paintMode();
            } else if (dialog && dialog.showModal) {
                dialog.showModal();
            } else {
                AI.setConsent(true);
                paintMode();
            }
        });
        var accept = document.getElementById('consent-accept');
        var cancel = document.getElementById('consent-cancel');
        if (accept) { accept.addEventListener('click', function () { AI.setConsent(true); dialog.close(); paintMode(); }); }
        if (cancel) { cancel.addEventListener('click', function () { dialog.close(); }); }
    } else {
        toggle.disabled = true;
        toggle.textContent = 'AI not configured';
        toggle.title = 'Set the emplostart-ai-endpoint meta tag to enable optional AI.';
    }

    paintMode();
})();
