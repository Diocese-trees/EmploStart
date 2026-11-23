/*
 * EmploStart: the candidate vault.
 *
 * One local record feeds every prompt and every engine. Nothing leaves the
 * browser unless the person turns on AI mode for a single request.
 *
 * Two storage modes:
 *   persistent (default)  localStorage, survives a closed tab
 *   session               sessionStorage, wipes on tab close, and clears any
 *                         persistent copy the moment it is chosen, so a
 *                         shared or lab computer keeps nothing.
 *
 * Field precedence is manual > cv_parse > linkedin_parse > test. A parsed
 * value never overwrites something the person typed by hand.
 *
 * Public surface: window.EmploStartVault
 */
(function () {
    'use strict';

    var KEY = 'emplostart_vault_v2';
    var MODE_KEY = 'emplostart_vault_mode_v1';
    var MAX_IMPORT = 200 * 1024;
    var RANK = { manual: 4, story_parse: 3, cv_parse: 3, linkedin_parse: 2, test: 1 };
    var BANDS = ['Foundation', 'Developing', 'Competitive', 'Evidence-Backed'];
    var PERSONAS = ['stuck_employee', 'student', 'founder', 'women_career', 'beginner_ai_brand'];
    var BAND_KEYS = [
        'evidence', 'positioning', 'market_clarity',
        'ats_readiness', 'interview_readiness', 'negotiation', 'pivot_readiness'
    ];

    var CORE_KEYS = [
        'full_name', 'location', 'career_stage', 'education', 'experience_raw',
        'roles_parsed', 'skills', 'tools', 'industries', 'companies',
        'quantified_results', 'portfolio_links', 'linkedin_url', 'linkedin_text',
        'current_salary_optional', 'goals_and_constraints'
    ];
    var LIST_KEYS = ['roles_parsed', 'skills', 'tools', 'industries', 'companies', 'quantified_results', 'portfolio_links'];
    var RESERVED = ['__proto__', 'constructor', 'prototype'];

    function blankProfile() {
        var profile = {};
        CORE_KEYS.forEach(function (key) {
            profile[key] = LIST_KEYS.indexOf(key) === -1 ? '' : [];
        });
        profile.location = 'Karachi, Pakistan';
        return profile;
    }

    function blankStory() {
        return {
            raw_text: '',
            who_am_i: '',
            where_am_i: '',
            what_i_want: '',
            word_count: 0,
            extracted_signals: []
        };
    }

    /* Story text is user prose. Strip angle brackets before it is stored so a
       future renderer can never treat it as markup, then cap the length. */
    function storyText(value, cap) {
        return String(value == null ? '' : value)
            .replace(/[<>]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, cap);
    }

    function blankChallenge() {
        return { started_at: null, completed_days: [], notes_by_day: {} };
    }

    function emptyVault() {
        return {
            version: 2,
            core_profile: blankProfile(),
            target_contexts: [],
            active_context_id: null,
            field_sources: {},
            readiness_bands: {},
            persona: '',
            story_300: blankStory(),
            challenge_progress: blankChallenge(),
            updated_at: null
        };
    }

    function store(kind) {
        try {
            var target = kind === 'session' ? window.sessionStorage : window.localStorage;
            if (!target) { return null; }
            return target;
        } catch (e) {
            return null;
        }
    }

    var memory = { data: null, mode: 'persistent' };

    function mode() {
        var saved = null;
        try {
            saved = store('persistent') && store('persistent').getItem(MODE_KEY);
        } catch (e) { saved = null; }
        if (saved === 'session' || saved === 'persistent') { memory.mode = saved; }
        return memory.mode;
    }

    function setMode(next) {
        var chosen = next === 'session' ? 'session' : 'persistent';
        var vault = read();
        try {
            if (store('persistent')) { store('persistent').setItem(MODE_KEY, chosen); }
        } catch (e) { /* storage blocked: memory only */ }
        memory.mode = chosen;
        if (chosen === 'session') {
            try {
                if (store('persistent')) { store('persistent').removeItem(KEY); }
            } catch (e) { /* ignore */ }
        }
        try {
            if (store('session')) {
                store('session').setItem(KEY, JSON.stringify(vault));
                if (chosen === 'persistent') { store('session').removeItem(KEY); }
            }
        } catch (e) { /* ignore */ }
        return chosen;
    }

    function read() {
        var raw = null;
        try {
            var persistent = store('persistent');
            var session = store('session');
            raw = (session && session.getItem(KEY)) || (persistent && persistent.getItem(KEY)) || null;
        } catch (e) { raw = null; }
        if (!raw) { raw = memory.data; }
        if (!raw) { return emptyVault(); }
        try {
            var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return sanitize(parsed).vault;
        } catch (e) {
            return emptyVault();
        }
    }

    function write(vault) {
        var payload = sanitize(vault).vault;
        payload.updated_at = new Date().toISOString();
        memory.data = payload;
        var target = mode() === 'session' ? store('session') : store('persistent');
        try {
            if (target) { target.setItem(KEY, JSON.stringify(payload)); }
        } catch (e) { /* quota or blocked: keep the in-memory copy */ }
        return payload;
    }

    function wipe() {
        memory.data = null;
        try {
            if (store('persistent')) { store('persistent').removeItem(KEY); }
            if (store('session')) { store('session').removeItem(KEY); }
        } catch (e) { /* ignore */ }
        return emptyVault();
    }

    function isReserved(key) {
        return RESERVED.indexOf(key) !== -1;
    }

    function cleanValue(key, value) {
        if (LIST_KEYS.indexOf(key) !== -1) {
            var list = Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/);
            return list.map(function (item) { return String(item || '').trim(); })
                .filter(function (item) { return item.length > 0; })
                .slice(0, 40);
        }
        return String(value == null ? '' : value).slice(0, 8000);
    }

    function sanitizeVaultLike(input) {
        var base = emptyVault();
        if (!input || typeof input !== 'object') { return base; }
        var source = (input.core_profile && typeof input.core_profile === 'object') ? input.core_profile : input;
        CORE_KEYS.forEach(function (key) {
            if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) {
                base.core_profile[key] = cleanValue(key, source[key]);
            }
        });
        if (Array.isArray(input.target_contexts)) {
            base.target_contexts = input.target_contexts.slice(0, 3).map(function (ctx, index) {
                var safe = {
                    id: 'ctx' + (index + 1),
                    label: String((ctx && ctx.label) || 'Target ' + (index + 1)).slice(0, 60),
                    target_role: String((ctx && ctx.target_role) || '').slice(0, 120),
                    target_jd: String((ctx && ctx.target_jd) || '').slice(0, 12000),
                    target_industry: String((ctx && ctx.target_industry) || '').slice(0, 120),
                    notes: String((ctx && ctx.notes) || '').slice(0, 800)
                };
                return safe;
            });
        }
        base.active_context_id = input.active_context_id ? String(input.active_context_id).slice(0, 20) : null;
        if (input.field_sources && typeof input.field_sources === 'object') {
            Object.keys(input.field_sources).forEach(function (key) {
                if (isReserved(key) || CORE_KEYS.indexOf(key) === -1) { return; }
                var source = input.field_sources[key];
                if (RANK[source]) { base.field_sources[key] = source; }
            });
        }
        if (input.readiness_bands && typeof input.readiness_bands === 'object') {
            BAND_KEYS.forEach(function (key) {
                var band = input.readiness_bands[key];
                if (band && BANDS.indexOf(band.label) !== -1) {
                    base.readiness_bands[key] = {
                        label: band.label,
                        score: Math.max(0, Math.min(100, Number(band.score) || 0)),
                        missing: Array.isArray(band.missing) ? band.missing.slice(0, 6).map(String) : []
                    };
                }
            });
        }
        if (PERSONAS.indexOf(input.persona) !== -1) {
            base.persona = input.persona;
        }
        if (input.story_300 && typeof input.story_300 === 'object') {
            var story = input.story_300;
            base.story_300 = {
                raw_text: storyText(story.raw_text, 4000),
                who_am_i: storyText(story.who_am_i, 2000),
                where_am_i: storyText(story.where_am_i, 2000),
                what_i_want: storyText(story.what_i_want, 2000),
                word_count: Math.max(0, Math.min(2000, Number(story.word_count) || 0)),
                extracted_signals: Array.isArray(story.extracted_signals)
                    ? story.extracted_signals.slice(0, 12).map(function (item) { return String(item).slice(0, 80); })
                    : []
            };
        }
        if (input.challenge_progress && typeof input.challenge_progress === 'object') {
            var progress = input.challenge_progress;
            var seen = {};
            base.challenge_progress = blankChallenge();
            base.challenge_progress.started_at = progress.started_at
                ? String(progress.started_at).slice(0, 40) : null;
            if (Array.isArray(progress.completed_days)) {
                progress.completed_days.forEach(function (day) {
                    var number = Math.round(Number(day));
                    if (number >= 1 && number <= 30 && !seen[number]) {
                        seen[number] = true;
                        base.challenge_progress.completed_days.push(number);
                    }
                });
                base.challenge_progress.completed_days.sort(function (a, b) { return a - b; });
            }
            if (progress.notes_by_day && typeof progress.notes_by_day === 'object') {
                Object.keys(progress.notes_by_day).forEach(function (key) {
                    var number = Math.round(Number(key));
                    if (number >= 1 && number <= 30 && !isReserved(key)) {
                        var note = String(progress.notes_by_day[key] || '').slice(0, 280);
                        if (note.trim()) { base.challenge_progress.notes_by_day[String(number)] = note; }
                    }
                });
            }
        }
        return base;
    }

    function sanitize(input) {
        var bytes = 0;
        try { bytes = JSON.stringify(input || {}).length; } catch (e) { bytes = MAX_IMPORT + 1; }
        if (bytes > MAX_IMPORT) {
            return { ok: false, reason: 'too-large', vault: emptyVault() };
        }
        var flat = input && typeof input === 'object' ? input : {};
        var reservedHit = false;
        Object.keys(flat).forEach(function (key) {
            if (isReserved(key)) { reservedHit = true; }
        });
        if (flat.core_profile && typeof flat.core_profile === 'object') {
            Object.keys(flat.core_profile).forEach(function (key) {
                if (isReserved(key)) { reservedHit = true; }
            });
        }
        if (reservedHit) {
            return { ok: false, reason: 'reserved-key', vault: emptyVault() };
        }
        return { ok: true, vault: sanitizeVaultLike(flat) };
    }

    function activeContext(vault) {
        if (!vault || !vault.target_contexts || !vault.target_contexts.length) { return null; }
        var match = null;
        vault.target_contexts.forEach(function (ctx) {
            if (ctx.id === vault.active_context_id) { match = ctx; }
        });
        return match || vault.target_contexts[0];
    }

    function getField(db, key) {
        var vault = db || read();
        if (key === 'target_role' || key === 'target_jd' || key === 'target_industry' || key === 'notes') {
            var ctx = activeContext(vault);
            return ctx ? String(ctx[key] || '') : '';
        }
        return vault.core_profile[key] == null ? '' : vault.core_profile[key];
    }

    function setField(db, key, value, source) {
        var vault = db || read();
        var origin = RANK[source] ? source : 'manual';
        var current = vault.field_sources[key];
        if (current && RANK[origin] < RANK[current]) {
            return vault;
        }
        vault.core_profile[key] = cleanValue(key, value);
        vault.field_sources[key] = origin;
        return vault;
    }

    function merge(db, fields, source) {
        var vault = db || read();
        Object.keys(fields || {}).forEach(function (key) {
            if (isReserved(key) || CORE_KEYS.indexOf(key) === -1) { return; }
            vault = setField(vault, key, fields[key], source);
        });
        return vault;
    }

    function setTarget(db, key, value) {
        var vault = db || read();
        if (['target_role', 'target_jd', 'target_industry'].indexOf(key) === -1) { return vault; }
        var ctx = activeContext(vault);
        if (!ctx) {
            ctx = { id: 'ctx1', label: 'Target 1', target_role: '', target_jd: '', target_industry: '', notes: '' };
            vault.target_contexts = [ctx];
            vault.active_context_id = 'ctx1';
        }
        var cap = key === 'target_jd' ? 12000 : 200;
        ctx[key] = String(value == null ? '' : value).slice(0, cap);
        if (key === 'target_role' && ctx[key]) { ctx.label = ctx[key].slice(0, 60); }
        return vault;
    }

    function setPersona(db, key) {
        var vault = db || read();
        vault.persona = PERSONAS.indexOf(key) === -1 ? '' : key;
        return vault;
    }

    function setStory(db, story) {
        var vault = db || read();
        vault.story_300 = sanitizeVaultLike({ story_300: story || {} }).story_300;
        return vault;
    }

    function setChallengeDay(db, day, done, note) {
        var vault = db || read();
        var number = Math.round(Number(day));
        if (!(number >= 1 && number <= 30)) { return vault; }
        if (!vault.challenge_progress) { vault.challenge_progress = blankChallenge(); }
        var list = vault.challenge_progress.completed_days || [];
        var index = list.indexOf(number);
        if (done && index === -1) { list.push(number); }
        if (!done && index !== -1) { list.splice(index, 1); }
        vault.challenge_progress.completed_days = list.sort(function (a, b) { return a - b; });
        if (!vault.challenge_progress.started_at && vault.challenge_progress.completed_days.length) {
            vault.challenge_progress.started_at = new Date().toISOString();
        }
        if (note != null) {
            var text = String(note).slice(0, 280);
            if (text.trim()) { vault.challenge_progress.notes_by_day[String(number)] = text; }
            else { delete vault.challenge_progress.notes_by_day[String(number)]; }
        }
        return vault;
    }

    function completeness(db) {
        var vault = db || read();
        var filled = 0;
        CORE_KEYS.forEach(function (key) {
            var value = vault.core_profile[key];
            if (Array.isArray(value) ? value.length > 0 : String(value || '').trim().length > 0) { filled += 1; }
        });
        return Math.round((filled / CORE_KEYS.length) * 100);
    }

    function bandForScore(score) {
        var value = Math.max(0, Math.min(100, Number(score) || 0));
        if (value >= 80) { return BANDS[3]; }
        if (value >= 55) { return BANDS[2]; }
        if (value >= 30) { return BANDS[1]; }
        return BANDS[0];
    }

    function has(list) { return Array.isArray(list) && list.length > 0; }

    function computeBands(db) {
        var vault = db || read();
        var p = vault.core_profile;
        var bands = {};
        var evidence = (has(p.quantified_results) ? 50 : 0) + (has(p.roles_parsed) ? 25 : 0) + (String(p.experience_raw).length > 200 ? 20 : 0);
        var positioning = (String(p.career_stage).length ? 30 : 0) + (has(p.skills) ? 30 : 0) + (has(p.tools) ? 20 : 0) + (has(p.goals_and_constraints) ? 15 : 0);
        var marketClarity = (getField(vault, 'target_role') ? 35 : 0) + (has(p.industries) ? 25 : 0) + (String(p.location).length ? 25 : 0);
        var ats = (has(p.quantified_results) ? 30 : 0) + (has(p.skills) ? 25 : 0) + (has(p.tools) ? 20 : 0) + (String(p.education).length ? 10 : 0);
        var interview = (has(p.roles_parsed) ? 35 : 0) + (has(p.quantified_results) ? 30 : 0) + (String(getField(vault, 'target_jd')).length > 100 ? 20 : 0);
        var negotiation = (String(p.current_salary_optional).length ? 25 : 0) + (has(p.companies) ? 20 : 0) + (String(p.goals_and_constraints).length ? 30 : 0) + (String(p.location).length ? 15 : 0);
        var pivot = (has(p.skills) ? 30 : 0) + (String(p.career_stage).length ? 25 : 0) + (has(p.portfolio_links) ? 20 : 0) + (String(p.goals_and_constraints).length ? 15 : 0);

        var scores = {
            evidence: evidence, positioning: positioning, market_clarity: marketClarity,
            ats_readiness: ats, interview_readiness: interview, negotiation: negotiation,
            pivot_readiness: pivot
        };
        var missingReasons = {
            evidence: 'Add at least one quantified result with a number.',
            positioning: 'Name your target role and two skills you can prove.',
            market_clarity: 'Set a target role, industry, and location.',
            ats_readiness: 'Add tools and quantified results from real work.',
            interview_readiness: 'Paste a target job description and list your roles.',
            negotiation: 'Record the offer range and your walk-away constraints.',
            pivot_readiness: 'List transferable skills and any public proof links.'
        };
        BAND_KEYS.forEach(function (key) {
            var score = Math.max(0, Math.min(100, scores[key]));
            bands[key] = {
                label: bandForScore(score),
                score: score,
                missing: score >= 80 ? [] : [missingReasons[key]]
            };
        });
        vault.readiness_bands = bands;
        return bands;
    }

    function exportJson(db) {
        return JSON.stringify(db || read(), null, 2);
    }

    function importJson(text) {
        if (typeof text !== 'string' || text.length > MAX_IMPORT) {
            return { ok: false, reason: 'too-large', vault: read() };
        }
        var parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            return { ok: false, reason: 'bad-json', vault: read() };
        }
        var result = sanitize(parsed);
        if (!result.ok) { return { ok: false, reason: result.reason, vault: read() }; }
        var saved = write(result.vault);
        return { ok: true, vault: saved };
    }

    function sample() {
        var vault = emptyVault();
        vault.core_profile = Object.assign(blankProfile(), {
            full_name: 'Sample Candidate',
            location: 'Karachi, Pakistan',
            career_stage: '2-4',
            education: 'BBA, University of Karachi, 2021',
            experience_raw: 'Operations coordinator at a 40-person distributor. Ran the weekly stock plan, trained six new hires, rebuilt the reorder sheet.',
            roles_parsed: ['Operations coordinator, 2022-2025'],
            skills: ['process design', 'reporting', 'coaching'],
            tools: ['excel', 'google sheets'],
            industries: ['distribution'],
            companies: ['Regional distributor'],
            quantified_results: ['Cut stockouts from 9% to 3% in one quarter', 'Cut report prep from 2 days to 4 hours'],
            portfolio_links: ['https://example.com/case-study'],
            linkedin_url: 'https://linkedin.com/in/sample-candidate',
            linkedin_text: 'Operations coordinator moving into supply planning.',
            current_salary_optional: '',
            goals_and_constraints: 'Remote or hybrid, Karachi based, studying part-time'
        });
        vault.target_contexts = [{
            id: 'ctx1',
            label: 'Supply planner',
            target_role: 'Supply planner',
            target_jd: 'Supply planner: own the weekly replenishment plan, report stock cover weekly, work with warehouse and sales on exceptions.',
            target_industry: 'distribution',
            notes: 'Prefers roles with a clear reporting rhythm'
        }];
        vault.active_context_id = 'ctx1';
        CORE_KEYS.forEach(function (key) {
            if (Array.isArray(vault.core_profile[key]) ? vault.core_profile[key].length : String(vault.core_profile[key]).length) {
                vault.field_sources[key] = 'manual';
            }
        });
        return vault;
    }

    window.EmploStartVault = {
        KEY: KEY,
        CORE_KEYS: CORE_KEYS,
        BANDS: BANDS,
        PERSONAS: PERSONAS,
        BAND_KEYS: BAND_KEYS,
        empty: emptyVault,
        read: read,
        write: write,
        wipe: wipe,
        mode: mode,
        setMode: setMode,
        sanitize: sanitize,
        getField: getField,
        setField: setField,
        setTarget: setTarget,
        setPersona: setPersona,
        setStory: setStory,
        setChallengeDay: setChallengeDay,
        merge: merge,
        completeness: completeness,
        computeBands: computeBands,
        bandForScore: bandForScore,
        activeContext: activeContext,
        exportJson: exportJson,
        importJson: importJson,
        sample: sample
    };
})();
