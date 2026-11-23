/*
 * EmploStart: the 14-prompt library UI.
 *
 * Two tracks, fourteen letters, one workbench. The workbench reads the vault,
 * shows only the fields a prompt actually needs, compiles the prompt locally,
 * and never sends anything: copying or downloading is a manual step, and AI
 * mode is a separate, consented action.
 *
 * Public surface: window.EmploStartLibrary
 */
(function () {
    'use strict';

    var KEY_PATH = 'data/prompt-library.json';
    var state = { data: null, active: null, answers: {}, variant: 'reasoning', query: '', stage: 'All' };
    var els = {};

    function $(id) { return document.getElementById(id); }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text != null) { node.textContent = text; }
        return node;
    }

    function vault() {
        return window.EmploStartVault ? window.EmploStartVault.read() : null;
    }

    function promptById(id) {
        var match = null;
        (state.data.prompts || []).forEach(function (item) {
            if (item.id === id) { match = item; }
        });
        return match;
    }

    function kb(bytes) { return (bytes / 1024).toFixed(1); }

    function trackColour(track) { return track === 'START' ? 'track--start' : 'track--employise'; }

    function renderBars() {
        var host = els.bars;
        host.textContent = '';
        (state.data.tracks || []).forEach(function (track) {
            var group = el('div', 'library-track ' + trackColour(track.name));
            var head = el('p', 'library-track-head');
            head.appendChild(el('strong', null, track.name));
            head.appendChild(el('span', null, ' ' + track.range + ' · ' + track.promise));
            group.appendChild(head);
            var bar = el('div', 'library-bar');
            state.data.prompts.filter(function (p) { return p.track === track.name; }).forEach(function (p) {
                var button = el('button', 'library-pill', p.pillar_index + ' ' + p.letter);
                button.type = 'button';
                button.setAttribute('aria-label', p.id + ': ' + p.pillar_title);
                button.setAttribute('data-prompt', p.id);
                button.title = p.prompt_title;
                if (state.active && state.active.id === p.id) { button.classList.add('is-active'); }
                button.addEventListener('click', function () { select(p.id); });
                bar.appendChild(button);
            });
            group.appendChild(bar);
            host.appendChild(group);
        });
    }

    function renderStages() {
        var host = els.stages;
        host.textContent = '';
        var stages = ['All'].concat(state.data.funnel_stages || []);
        stages.forEach(function (stage) {
            var button = el('button', 'chip', stage === 'All' ? 'All stages' : stage);
            button.type = 'button';
            button.setAttribute('aria-pressed', state.stage === stage ? 'true' : 'false');
            if (state.stage === stage) { button.classList.add('is-active'); }
            button.addEventListener('click', function () { state.stage = stage; renderStages(); renderList(); });
            host.appendChild(button);
        });
    }

    function renderList() {
        var host = els.list;
        host.textContent = '';
        var query = state.query.toLowerCase();
        var shown = (state.data.prompts || []).filter(function (p) {
            var stageOk = state.stage === 'All' || p.funnel_stage === state.stage;
            var hay = [p.id, p.letter, p.pillar_title, p.prompt_title, p.summary, p.funnel_stage].join(' ').toLowerCase();
            return stageOk && (!query || hay.indexOf(query) !== -1);
        });
        if (!shown.length) {
            host.appendChild(el('li', 'library-empty', 'No prompt matches that filter yet.'));
            return;
        }
        shown.forEach(function (p) {
            var item = el('li', 'library-card');
            var button = el('button', 'library-card-button');
            button.type = 'button';
            button.setAttribute('data-prompt', p.id);
            button.addEventListener('click', function () { select(p.id); });
            var top = el('span', 'library-card-top');
            top.appendChild(el('span', 'library-card-id', p.id + ' · ' + p.letter));
            top.appendChild(el('span', 'library-card-stage', p.funnel_stage));
            button.appendChild(top);
            button.appendChild(el('strong', 'library-card-title', p.pillar_title));
            button.appendChild(el('span', 'library-card-prompt', p.prompt_title));
            button.appendChild(el('span', 'library-card-summary', p.summary));
            var tags = el('span', 'library-tags');
            tags.appendChild(el('span', 'tag', p.completeness_gate_mode === 'ask_first' ? 'Asks first' : 'Drafts directly'));
            if (p.requires_web_fallback) { tags.appendChild(el('span', 'tag tag--warn', 'No-web fallback')); }
            button.appendChild(tags);
            item.appendChild(button);
            host.appendChild(item);
        });
    }

    function select(id) {
        var prompt = promptById(id);
        if (!prompt) { return; }
        state.active = prompt;
        state.answers = state.answers[id] || {};
        renderBars();
        renderWorkbench();
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', '#prompt-' + id);
        }
    }

    function renderContext() {
        var db = vault();
        els.context.textContent = '';
        if (!db || !db.target_contexts || !db.target_contexts.length) {
            els.context.appendChild(el('p', 'panel-hint', 'No target context saved yet. Add one in the intake section to fill the role and job description.'));
            return;
        }
        var label = el('label', 'workbench-field');
        label.appendChild(el('span', null, 'Target context'));
        var selectNode = document.createElement('select');
        db.target_contexts.forEach(function (ctx) {
            var option = document.createElement('option');
            option.value = ctx.id;
            option.textContent = ctx.label + (ctx.target_role ? ' · ' + ctx.target_role : '');
            if (ctx.id === db.active_context_id) { option.selected = true; }
            selectNode.appendChild(option);
        });
        selectNode.addEventListener('change', function () {
            db.active_context_id = selectNode.value;
            window.EmploStartVault.write(db);
            renderWorkbench();
        });
        label.appendChild(selectNode);
        els.context.appendChild(label);
    }

    function missingKeys(prompt) {
        var db = vault();
        var out = [];
        (prompt.vault_projection || []).forEach(function (key) {
            var value = window.EmploStartVault ? window.EmploStartVault.getField(db, key) : '';
            var blank = Array.isArray(value) ? value.length === 0 : String(value || '').trim().length === 0;
            if (blank) { out.push({ key: key, label: key.replace(/_/g, ' ') }); }
        });
        (prompt.prompt_specific_questions || []).forEach(function (q) {
            out.push({ key: q.key, label: q.label, specific: true });
        });
        return out;
    }

    function renderForm(prompt) {
        var host = els.form;
        host.textContent = '';
        var fields = missingKeys(prompt);
        var filled = (prompt.vault_projection || []).length - fields.filter(function (f) { return !f.specific; }).length;
        els.ready.textContent = 'Ready: ' + filled + '/' + (prompt.vault_projection || []).length + ' vault fields';

        fields.forEach(function (field) {
            var label = el('label', 'workbench-field');
            label.appendChild(el('span', null, field.label + (field.specific ? ' (this prompt)' : ' (missing from vault)')));
            var input = document.createElement(field.specific ? 'input' : 'textarea');
            if (field.specific) { input.type = 'text'; } else { input.rows = 2; }
            input.value = state.answers[field.key] || '';
            input.setAttribute('data-key', field.key);
            input.addEventListener('input', function () {
                state.answers[field.key] = input.value;
                updateCompile();
            });
            label.appendChild(input);
            host.appendChild(label);
        });
        if (!fields.length) {
            host.appendChild(el('p', 'panel-hint', 'Every field this prompt needs is already in the vault.'));
        }
        if (Object.keys(state.answers).length) {
            var sync = el('label', 'workbench-sync');
            var box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = true;
            box.addEventListener('change', function () { sync.dataset.on = box.checked ? '1' : '0'; });
            sync.dataset.on = '1';
            sync.appendChild(box);
            sync.appendChild(el('span', null, 'Sync these answers back to the vault when I leave this prompt'));
            host.appendChild(sync);
        }
    }

    function compileNow() {
        if (!state.active) { return null; }
        var db = vault();
        var answers = {};
        Object.keys(state.answers).forEach(function (key) {
            if (key !== state.active.id) { answers[key] = state.answers[key]; }
        });
        return window.EmploStartCompiler.compile(state.active, db, { variant: state.variant, answers: answers });
    }

    function updateCompile() {
        var result = compileNow();
        if (!result) { return; }
        els.output.textContent = result.text;
        els.meter.textContent = kb(result.bytes) + ' KB / ' + Math.round(result.max / 1024) + ' KB';
        els.meter.classList.toggle('is-warn', result.bytes > result.max * 0.85);
        els.note.textContent = result.notes.join(' ') || 'Compiled locally. Nothing has been sent.';
    }

    function renderWorkbench() {
        if (!state.active) { return; }
        var prompt = state.active;
        els.workbench.hidden = false;
        els.title.textContent = prompt.id + ' · ' + prompt.letter + ' · ' + prompt.pillar_title;
        els.sub.textContent = prompt.track + ' track · ' + prompt.funnel_stage + ' · ' + prompt.summary;
        els.variantReasoning.setAttribute('aria-pressed', state.variant === 'reasoning' ? 'true' : 'false');
        els.variantStandard.setAttribute('aria-pressed', state.variant === 'standard' ? 'true' : 'false');
        renderContext();
        renderForm(prompt);
        updateCompile();
    }

    function saveAnswers() {
        var form = els.form;
        if (!form || !state.active) { return; }
        var sync = form.querySelector('.workbench-sync');
        if (!sync || sync.dataset.on !== '1') { return; }
        var db = vault();
        if (!db) { return; }
        Object.keys(state.answers).forEach(function (key) {
            if (key === state.active.id) { return; }
            var value = state.answers[key];
            if (value == null || String(value).trim() === '') { return; }
            if (window.EmploStartVault.CORE_KEYS.indexOf(key) !== -1) {
                window.EmploStartVault.setField(db, key, value, 'manual');
            } else if (['target_role', 'target_jd', 'target_industry'].indexOf(key) !== -1) {
                window.EmploStartVault.setTarget(db, key, value);
            }
        });
        window.EmploStartVault.computeBands(db);
        window.EmploStartVault.write(db);
    }

    function copy() {
        var result = compileNow();
        if (!result) { return; }
        var done = function () { els.note.textContent = 'Copied. Paste it into your AI tool of choice.'; };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(result.text).then(done).catch(fallbackCopy);
        } else {
            fallbackCopy();
        }
        function fallbackCopy() {
            var box = document.createElement('textarea');
            box.value = result.text;
            box.setAttribute('readonly', 'readonly');
            box.style.position = 'absolute';
            box.style.left = '-9999px';
            document.body.appendChild(box);
            box.select();
            try { document.execCommand('copy'); done(); }
            catch (e) { els.note.textContent = 'Copy failed. Select the text and copy manually.'; }
            document.body.removeChild(box);
        }
    }

    function download() {
        var result = compileNow();
        if (!result) { return; }
        var blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'emplostart-' + state.active.id.toLowerCase() + '.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        els.note.textContent = 'Downloaded ' + link.download + '.';
    }

    function precheck() {
        var db = vault();
        var out = window.EmploStartCompiler.precheck(db);
        var text = out.verdict;
        if (out.buzzwords.length) { text += ' Clichés found: ' + out.buzzwords.join(', ') + '.'; }
        if (out.gaps.length) { text += ' ' + out.gaps.join(' '); }
        els.note.textContent = text;
    }

    function reset() {
        if (!state.active) { return; }
        state.answers = {};
        renderWorkbench();
        els.note.textContent = 'Prompt-specific answers cleared. The vault is untouched.';
    }

    function loadSample() {
        if (!window.EmploStartVault) { return; }
        window.EmploStartVault.write(window.EmploStartVault.sample());
        renderWorkbench();
        els.note.textContent = 'Sample vault loaded. Replace it with your own details before relying on the output.';
    }

    function runAI() {
        if (!window.EmploStartAI || !window.EmploStartAI.available()) {
            els.note.textContent = 'AI mode is not configured on this deployment. Copy the prompt into your own AI tool instead.';
            return;
        }
        if (!window.EmploStartAI.consentGiven()) {
            els.note.textContent = 'Turn on AI mode first: the consent dialog explains exactly what would be sent.';
            return;
        }
        var result = compileNow();
        if (!result) { return; }
        els.note.textContent = 'Sending…';
        window.EmploStartAI.ask({ prompt: result.text }).then(function (reply) {
            if (!reply.ok) { els.note.textContent = 'AI request failed (' + reply.reason + '). The local prompt still works.'; return; }
            var body = reply.data && (reply.data.text || reply.data.output || reply.data.reply);
            els.note.textContent = body ? String(body).slice(0, 1200) : 'Reply received.';
        });
    }

    function routeHash() {
        var hash = (window.location.hash || '').replace('#', '');
        if (/^prompt-P\d{2}$/.test(hash)) {
            select(hash.replace('prompt-', ''));
        }
    }

    function init() {
        els.bars = $('library-tracks');
        els.stages = $('library-stages');
        els.list = $('library-list');
        els.search = $('library-search');
        els.workbench = $('library-workbench');
        els.title = $('wb-title');
        els.sub = $('wb-sub');
        els.ready = $('wb-ready');
        els.context = $('wb-context');
        els.form = $('wb-form');
        els.meter = $('wb-meter');
        els.output = $('wb-output');
        els.note = $('wb-note');
        els.variantReasoning = $('wb-variant-reasoning');
        els.variantStandard = $('wb-variant-standard');
        if (!els.bars || !els.list) { return; }

        els.search.addEventListener('input', function () { state.query = els.search.value; renderList(); });
        els.variantReasoning.addEventListener('click', function () { state.variant = 'reasoning'; renderWorkbench(); });
        els.variantStandard.addEventListener('click', function () { state.variant = 'standard'; renderWorkbench(); });
        $('wb-copy').addEventListener('click', copy);
        $('wb-download').addEventListener('click', download);
        $('wb-precheck').addEventListener('click', precheck);
        $('wb-reset').addEventListener('click', reset);
        $('wb-sample').addEventListener('click', loadSample);
        var ai = $('wb-ai');
        if (ai) {
            if (!window.EmploStartAI || !window.EmploStartAI.available()) { ai.hidden = true; }
            else { ai.addEventListener('click', runAI); }
        }
        window.addEventListener('beforeunload', saveAnswers);

        fetch(KEY_PATH, { cache: 'no-cache' }).then(function (response) {
            if (!response.ok) { throw new Error('HTTP ' + response.status); }
            return response.json();
        }).then(function (data) {
            state.data = data;
            renderBars();
            renderStages();
            renderList();
            routeHash();
        }).catch(function () {
            els.list.textContent = '';
            els.list.appendChild(el('li', 'library-empty', 'The prompt library could not load. Reload the page, or open the app from the Pages URL.'));
        });
    }

    window.EmploStartLibrary = { init: init, select: select, state: state };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
