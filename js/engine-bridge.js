/*
 * EmploStart: binds the six local engines to the candidate vault.
 *
 * The engines still run on their own form fields, unchanged. This bridge only
 * fills those fields from core_profile plus the active target context, so a
 * candidate never re-types a CV into six forms. Writing back is opt-in through
 * the "Sync edits back to Vault" checkbox and defaults to off.
 *
 * Public surface: window.EmploStartBridge
 */
(function () {
    'use strict';

    var els = {};
    var syncOn = false;

    function $(id) { return document.getElementById(id); }
    function vault() { return window.EmploStartVault; }
    function text(value) { return value == null ? '' : String(value); }
    function list(value) { return Array.isArray(value) ? value.join(', ') : text(value); }

    function activeRole(db) { return vault().getField(db, 'target_role'); }
    function activeJd(db) { return vault().getField(db, 'target_jd'); }

    function firstRole(profile) {
        var roles = Array.isArray(profile.roles_parsed) ? profile.roles_parsed : [];
        return roles.length ? text(roles[0]).replace(/\s*[,–-]\s*20\d{2}.*$/, '') : '';
    }

    function resumeText(profile) {
        var parts = [];
        if (text(profile.experience_raw).trim()) { parts.push(text(profile.experience_raw).trim()); }
        if (Array.isArray(profile.quantified_results) && profile.quantified_results.length) {
            parts.push(profile.quantified_results.map(function (item) { return '- ' + item; }).join('\n'));
        }
        if (Array.isArray(profile.skills) && profile.skills.length) { parts.push('Skills: ' + profile.skills.join(', ')); }
        if (Array.isArray(profile.tools) && profile.tools.length) { parts.push('Tools: ' + profile.tools.join(', ')); }
        if (text(profile.education).trim()) { parts.push('Education: ' + text(profile.education).trim()); }
        return parts.join('\n\n');
    }

    function interviewLevel(profile) {
        var stage = text(profile.career_stage).toLowerCase();
        if (/student|intern|none/.test(stage) || stage === '') { return 'Entry level'; }
        if (/^(5|6|7|8|9|10\+|senior|lead|manager)/.test(stage)) { return 'Career switch'; }
        return '1 to 3 years';
    }

    var FIELDS = {
        pivot: function (p, db) {
            return {
                current: firstRole(p),
                target: activeRole(db),
                skills: list(p.skills),
                strengths: list(p.skills)
            };
        },
        reimagine: function (p) {
            return {
                current: firstRole(p),
                strengths: list(p.skills),
                interests: list(p.industries),
                constraints: text(p.goals_and_constraints)
            };
        },
        market: function (p, db) {
            return {
                role: activeRole(db),
                region: text(p.location),
                years: text(p.career_stage)
            };
        },
        ats: function (p, db) {
            return { resume: resumeText(p), jd: activeJd(db) };
        },
        interview: function (p, db) {
            return { role: activeRole(db), level: interviewLevel(p) };
        },
        profile: function (p, db) {
            return {
                headline: '',
                summary: '',
                bullets: Array.isArray(p.quantified_results) ? p.quantified_results.join('\n') : '',
                targetRole: activeRole(db)
            };
        }
    };

    var SYNC = {
        pivot: { skills: ['skills', 'list'] },
        reimagine: { strengths: ['skills', 'list'], interests: ['industries', 'list'], constraints: ['goals_and_constraints', 'text'] },
        market: { role: ['target_role', 'target'], region: ['location', 'text'], years: ['career_stage', 'text'] },
        ats: { jd: ['target_jd', 'target'] },
        interview: { role: ['target_role', 'target'] },
        profile: { bullets: ['quantified_results', 'lines'], targetRole: ['target_role', 'target'] }
    };

    function formFor(module) {
        return document.querySelector('form[data-module="' + module + '"]');
    }

    function writeField(module, field, value) {
        var rule = SYNC[module][field];
        if (!rule || value == null || text(value).trim() === '') { return null; }
        var key = rule[0];
        var kind = rule[1];
        var db = vault().read();
        if (kind === 'target') {
            db = vault().setTarget(db, key, value);
        } else {
            var next = value;
            if (kind === 'list') { next = text(value).split(/[\n,;]+/).map(function (item) { return item.trim(); }).filter(Boolean); }
            if (kind === 'lines') { next = text(value).split(/\n+/).map(function (item) { return item.trim(); }).filter(Boolean); }
            db = vault().setField(db, key, next, 'manual');
        }
        vault().computeBands(db);
        vault().write(db);
        return key;
    }

    function fill(force) {
        if (!vault()) { return; }
        var db = vault().read();
        var profile = db.core_profile || {};
        Object.keys(FIELDS).forEach(function (module) {
            var form = formFor(module);
            if (!form) { return; }
            var values = FIELDS[module](profile, db);
            Object.keys(values).forEach(function (name) {
                var field = form.elements[name];
                if (!field || values[name] === '' && !force) { return; }
                var auto = field.getAttribute('data-auto');
                var current = text(field.value);
                if (!force && current.trim() && current !== auto) { return; }
                var next = text(values[name]);
                if (current === next) { return; }
                field.value = next;
                field.setAttribute('data-auto', next);
            });
        });
    }

    function renderContext() {
        if (!els.context || !vault()) { return; }
        var db = vault().read();
        var contexts = Array.isArray(db.target_contexts) ? db.target_contexts : [];
        els.context.textContent = '';
        if (!contexts.length) {
            var empty = document.createElement('option');
            empty.value = '';
            empty.textContent = 'No target saved yet · add one in the intake section';
            els.context.appendChild(empty);
            els.context.disabled = true;
            return;
        }
        els.context.disabled = false;
        contexts.forEach(function (ctx) {
            var option = document.createElement('option');
            option.value = ctx.id;
            option.textContent = ctx.label || ctx.target_role || ctx.id;
            if (ctx.id === db.active_context_id) { option.selected = true; }
            els.context.appendChild(option);
        });
    }

    function refresh() {
        renderContext();
        fill(false);
    }

    function init() {
        els.bar = $('context-bar');
        els.context = $('engine-context');
        els.sync = $('engine-sync');
        els.note = $('engine-bridge-note');
        if (!els.bar || !vault()) { return; }

        document.querySelectorAll('form[data-module]').forEach(function (form) {
            var module = form.getAttribute('data-module');
            if (!SYNC[module]) { return; }
            form.addEventListener('submit', function () {
                if (!syncOn) { return; }
                var saved = [];
                Object.keys(SYNC[module]).forEach(function (field) {
                    var input = form.elements[field];
                    if (!input) { return; }
                    var key = writeField(module, field, input.value);
                    if (key) { saved.push(key); }
                });
                if (saved.length && els.note) {
                    els.note.textContent = 'Synced to the vault: ' + saved.join(', ') + '.';
                }
            });
        });

        els.sync.addEventListener('change', function () {
            syncOn = !!els.sync.checked;
            if (els.note) {
                els.note.textContent = syncOn
                    ? 'Sync on: submitting a module writes its mapped fields back to the vault.'
                    : 'Sync off: the vault is not changed by these forms.';
            }
        });

        els.context.addEventListener('change', function () {
            var db = vault().read();
            if (!db.target_contexts || !db.target_contexts.length) { return; }
            db.active_context_id = els.context.value;
            vault().write(db);
            fill(true);
            if (window.EmploStartIntakeUI) { window.EmploStartIntakeUI.refreshVault(); }
        });

        refresh();
    }

    window.EmploStartBridge = { refresh: refresh, init: init };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
