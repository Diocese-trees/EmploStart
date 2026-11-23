/*
 * EmploStart: the intake and vault UI.
 *
 * Lane 1 runs the 12-question diagnostic. Lane 2 takes a LinkedIn URL plus
 * pasted text. Lane 3 takes a .docx / .txt / .md file or a repaired PDF paste.
 * Lanes 2 and 3 always show an editable preview before anything is saved, and
 * a hand-typed value is never overwritten by a parsed one.
 *
 * Public surface: window.EmploStartIntakeUI
 */
(function () {
    'use strict';

    var els = {};
    var pending = null;

    function $(id) { return document.getElementById(id); }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text != null) { node.textContent = text; }
        return node;
    }

    function vaultLib() { return window.EmploStartVault; }

    function note(message) {
        if (els.vaultNote) { els.vaultNote.textContent = message; }
    }

    function renderDiagnostic() {
        var host = els.testQuestions;
        if (!host || !window.EmploStartIntake) { return; }
        // The guided shell renders one question at a time; leave its card alone.
        if (host.getAttribute('data-guided') === '1') { return; }
        host.textContent = '';
        window.EmploStartIntake.DIAGNOSTIC.forEach(function (q, index) {
            var body = el('fieldset', 'diagnostic-item');
            var legend = el('legend', null, (index + 1) + '. ' + q.prompt);
            body.appendChild(legend);
            q.options.forEach(function (option, i) {
                var label = el('label', 'diagnostic-option');
                var input = document.createElement('input');
                input.type = 'radio';
                input.name = 'diag-' + q.id;
                input.value = String(i);
                label.appendChild(input);
                label.appendChild(el('span', null, option[0]));
                body.appendChild(label);
            });
            host.appendChild(body);
        });
    }

    function renderBands(bands, recommended) {
        var host = els.testResult;
        host.textContent = '';
        var list = el('ul', 'band-list');
        (window.EmploStartVault ? window.EmploStartVault.BAND_KEYS : Object.keys(bands)).forEach(function (key) {
            var band = bands[key];
            if (!band) { return; }
            var item = el('li', 'band-row');
            item.appendChild(el('span', 'band-name', key.replace(/_/g, ' ')));
            item.appendChild(el('span', 'band-label band-' + band.label.toLowerCase().replace(/\s+/g, '-'), band.label));
            list.appendChild(item);
        });
        host.appendChild(list);
        if (recommended && recommended.length) {
            var p = el('p', 'panel-hint', 'Start with: ');
            recommended.forEach(function (id, index) {
                var link = el('a', 'band-link', id);
                link.href = '#prompt-' + id;
                p.appendChild(link);
                if (index < recommended.length - 1) { p.appendChild(document.createTextNode(', ')); }
            });
            host.appendChild(p);
        }
    }

    function submitDiagnostic(event) {
        event.preventDefault();
        var answers = {};
        window.EmploStartIntake.DIAGNOSTIC.forEach(function (q) {
            var checked = els.testQuestions.querySelector('input[name="diag-' + q.id + '"]:checked');
            if (checked) { answers[q.id] = checked.value; }
        });
        var result = window.EmploStartIntake.scoreDiagnostic(answers);
        var db = vaultLib().read();
        Object.keys(result.bands).forEach(function (key) {
            db.readiness_bands[key] = { label: result.bands[key].label, score: result.bands[key].score, missing: [] };
        });
        vaultLib().write(db);
        renderBands(result.bands, result.recommended);
        refreshVault();
        note('Diagnostic saved as readiness bands. Nothing left this browser.');
    }

    function showPreview(fields, source, noteText) {
        pending = { fields: fields, source: source };
        els.preview.hidden = false;
        els.previewNote.textContent = noteText || 'Check the extracted fields, fix anything wrong, then save.';
        var host = els.previewTable;
        host.textContent = '';
        Object.keys(fields).forEach(function (key) {
            var value = fields[key];
            var text = Array.isArray(value) ? value.join(' · ') : String(value || '');
            if (!text.trim()) { return; }
            var row = el('div', 'preview-row');
            row.appendChild(el('span', 'preview-key', key.replace(/_/g, ' ')));
            var input = document.createElement(text.length > 60 ? 'textarea' : 'input');
            if (input.tagName === 'TEXTAREA') { input.rows = 2; }
            input.value = text;
            input.setAttribute('data-field', key);
            row.appendChild(input);
            host.appendChild(row);
        });
        renderDelta(fields);
        els.preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderDelta(fields) {
        var host = els.delta;
        host.textContent = '';
        var questions = window.EmploStartIntake.deltaQuestions(fields, vaultLib().read());
        if (!questions.length) { return; }
        host.appendChild(el('p', 'workbench-label', 'Still missing, answer only what you know:'));
        questions.forEach(function (q) {
            var label = el('label', 'workbench-field');
            label.appendChild(el('span', null, q.label));
            var input = document.createElement('input');
            input.type = 'text';
            input.setAttribute('data-delta', q.key);
            label.appendChild(input);
            host.appendChild(label);
        });
    }

    function collectPreview() {
        var fields = {};
        els.previewTable.querySelectorAll('[data-field]').forEach(function (input) {
            fields[input.getAttribute('data-field')] = input.value;
        });
        els.delta.querySelectorAll('[data-delta]').forEach(function (input) {
            if (input.value.trim()) { fields[input.getAttribute('data-delta')] = input.value.trim(); }
        });
        return fields;
    }

    function savePreview() {
        if (!pending) { return; }
        var fields = collectPreview();
        var db = vaultLib().read();
        ['target_role', 'target_jd', 'target_industry'].forEach(function (key) {
            if (fields[key] != null && String(fields[key]).trim() !== '') {
                db = vaultLib().setTarget(db, key, fields[key]);
                delete fields[key];
            }
        });
        db = vaultLib().merge(db, fields, pending.source);
        vaultLib().computeBands(db);
        vaultLib().write(db);
        els.preview.hidden = true;
        pending = null;
        refreshVault();
        note('Saved to the vault. Hand-typed values were kept where they existed.');
    }

    function submitLinkedIn(event) {
        event.preventDefault();
        var result = window.EmploStartIntake.parseLinkedIn(els.linkedinUrl.value, els.linkedinText.value);
        showPreview(result.fields, 'linkedin_parse', result.note);
    }

    function repairPaste() {
        if (!els.cvText) { return; }
        els.cvText.value = window.EmploStartIntake.repairPdfPaste(els.cvText.value);
        note('Line wraps and bullet glyphs repaired in the pasted text.');
    }

    function readFile(file) {
        var name = (file.name || '').toLowerCase();
        if (name.endsWith('.docx')) {
            file.arrayBuffer().then(function (buffer) {
                return window.EmploStartDocx.extract(buffer);
            }).then(function (result) {
                els.cvText.value = result.text;
                note('Read ' + file.name + ' in this browser. ' + result.paragraphs + ' paragraphs found.');
            }).catch(function (error) {
                note('Could not read that .docx (' + error.message + '). Paste the text instead.');
            });
            return;
        }
        if (/\.(txt|md)$/.test(name)) {
            file.text().then(function (text) { els.cvText.value = text; note('Loaded ' + file.name + '.'); });
            return;
        }
        note('Use .docx, .txt, or .md, or paste the text.');
    }

    function submitCv(event) {
        event.preventDefault();
        var text = els.cvText.value.trim();
        if (!text) { note('Add a CV file or paste the text first.'); return; }
        var result = window.EmploStartIntake.parseCv(text);
        var flags = result.flags;
        var extra = [];
        if (flags.buzzwords.length) { extra.push('Clichés: ' + flags.buzzwords.join(', ') + '.'); }
        if (flags.metrics) { extra.push(flags.metrics + ' quantified line(s) found.'); }
        if (flags.years.length) { extra.push('Years seen: ' + flags.years.join(', ') + '.'); }
        showPreview(result.fields, 'cv_parse', 'Parsed locally. ' + extra.join(' '));
    }

    function refreshVault() {
        var lib = vaultLib();
        var db = lib.read();
        if (!db) { return; }
        els.completeness.textContent = lib.completeness(db) + '% complete';
        var bands = lib.computeBands(db);
        var host = els.bands;
        host.textContent = '';
        lib.BAND_KEYS.forEach(function (key) {
            var band = bands[key];
            var row = el('div', 'vault-band');
            row.appendChild(el('span', null, key.replace(/_/g, ' ')));
            row.appendChild(el('strong', 'band-' + band.label.toLowerCase().replace(/\s+/g, '-'), band.label));
            host.appendChild(row);
        });
        els.mode.value = lib.mode();
        if (window.EmploStartBridge) { window.EmploStartBridge.refresh(); }
        document.dispatchEvent(new CustomEvent('emplostart:vault-changed'));
    }

    function exportVault() {
        var text = vaultLib().exportJson();
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'emplostart-vault.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        note('Exported this browser only. Keep the file private.');
    }

    function importVault(file) {
        if (!file) { return; }
        file.text().then(function (text) {
            var result = vaultLib().importJson(text);
            if (!result.ok) {
                note(result.reason === 'too-large' ? 'That file is over the 200 KB limit.' : 'Import rejected: ' + result.reason + '.');
                return;
            }
            refreshVault();
            note('Vault imported. Existing hand-typed values were replaced by the file, as you asked.');
        });
    }

    function init() {
        els.testQuestions = $('lane-test-questions');
        els.testResult = $('lane-test-result');
        els.linkedinUrl = $('lane-linkedin-url');
        els.linkedinText = $('lane-linkedin-text');
        els.cvText = $('lane-cv-text');
        els.cvFile = $('lane-cv-file');
        els.preview = $('intake-preview');
        els.previewTable = $('preview-table');
        els.previewNote = $('preview-note');
        els.delta = $('delta-questions');
        els.completeness = $('vault-completeness');
        els.bands = $('vault-bands');
        els.mode = $('vault-mode');
        els.vaultNote = $('vault-note');
        if (!els.testQuestions || !window.EmploStartIntake) { return; }

        renderDiagnostic();
        $('lane-test-form').addEventListener('submit', submitDiagnostic);
        $('lane-linkedin-form').addEventListener('submit', submitLinkedIn);
        $('lane-cv-form').addEventListener('submit', submitCv);
        $('lane-cv-repair').addEventListener('click', repairPaste);
        els.cvFile.addEventListener('change', function () {
            if (els.cvFile.files && els.cvFile.files[0]) { readFile(els.cvFile.files[0]); }
        });
        $('preview-save').addEventListener('click', savePreview);
        $('preview-cancel').addEventListener('click', function () {
            pending = null;
            els.preview.hidden = true;
        });
        els.mode.addEventListener('change', function () {
            vaultLib().setMode(els.mode.value);
            refreshVault();
            note(els.mode.value === 'session'
                ? 'Shared or lab computer mode: this vault wipes when the tab closes.'
                : 'Persistent mode: this vault stays in this browser until you wipe it.');
        });
        $('vault-sample').addEventListener('click', function () {
            vaultLib().write(vaultLib().sample());
            refreshVault();
            note('Sample vault loaded.');
        });
        $('vault-export').addEventListener('click', exportVault);
        $('vault-import').addEventListener('change', function () {
            if (this.files && this.files[0]) { importVault(this.files[0]); }
        });
        $('vault-wipe').addEventListener('click', function () {
            vaultLib().wipe();
            refreshVault();
            els.preview.hidden = true;
            note('All local data wiped from this browser.');
        });
        refreshVault();
    }

    window.EmploStartIntakeUI = { init: init, refreshVault: refreshVault };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
