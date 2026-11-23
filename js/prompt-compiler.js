/*
 * EmploStart: the prompt compiler.
 *
 * Turns a library entry plus the local vault into one paste-ready prompt.
 * Two safety rules matter more than anything else here:
 *
 *   1 Only whitelisted vault keys are ever projected, each with a character
 *      cap, so a stray field cannot leak into a prompt.
 *   2 Every user value is escaped for < and > before it is placed inside
 *      <candidate_data> or <target_jd>. A pasted CV cannot close the tag and
 *      start giving the model instructions.
 *
 * Missing values become [NOT PROVIDED]. No {{placeholder}} or [PASTE ...]
 * token is allowed to survive into the output.
 *
 * Public surface: window.EmploStartCompiler
 */
(function () {
    'use strict';

    var DEFAULT_CAP = 1200;
    var CAPS = {
        target_jd: 6000,
        experience_raw: 6000,
        linkedin_text: 4000,
        roles_parsed: 1200,
        quantified_results: 1200,
        portfolio_links: 800,
        goals_and_constraints: 600,
        education: 400
    };

    var GATE = {
        ask_first: 'Completeness gate (ask_first): mark anything you cannot ground as [NOT PROVIDED]. Before you draft, ask at most five short questions about the missing items that would change your answer. Do not invent facts to fill a gap.',
        direct_draft: 'Completeness gate (direct_draft): draft only from the verified facts below. Where a fact is absent, write [NOT PROVIDED] in the relevant line and continue. Never invent numbers, employers, dates, or credentials.'
    };

    var FALLBACK = 'No-web fallback: you have no live web access. Never state a salary band, scholarship deadline, fee, or market figure as fact. Give the structural criteria, then the exact search query or official source the person should check, and mark unverifiable items [CANNOT VERIFY].';

    function byteLength(text) {
        var value = String(text == null ? '' : text);
        if (typeof TextEncoder !== 'undefined') { return new TextEncoder().encode(value).length; }
        return unescape(encodeURIComponent(value)).length;
    }

    function escapeXml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function isBlank(value) {
        if (Array.isArray(value)) { return value.length === 0; }
        return String(value == null ? '' : value).trim().length === 0;
    }

    function stringify(value) {
        if (Array.isArray(value)) {
            return value.map(function (item) { return '- ' + String(item); }).join('\n');
        }
        return String(value == null ? '' : value);
    }

    function fieldFor(vault, key) {
        if (!vault) { return ''; }
        if (key === 'target_role' || key === 'target_jd' || key === 'target_industry') {
            var context = window.EmploStartVault ? window.EmploStartVault.activeContext(vault) : null;
            if (context && context[key]) { return context[key]; }
            if (key === 'target_jd') { return ''; }
        }
        return vault.core_profile ? vault.core_profile[key] : '';
    }

    function projection(prompt, vault, answers) {
        var rows = [];
        var truncated = [];
        var missing = [];
        (prompt.vault_projection || []).forEach(function (key) {
            var value = fieldFor(vault, key);
            if (answers && answers[key] != null && !isBlank(answers[key])) { value = answers[key]; }
            if (isBlank(value)) {
                missing.push(key);
                rows.push([key, '[NOT PROVIDED]']);
                return;
            }
            var text = stringify(value);
            var cap = CAPS[key] || DEFAULT_CAP;
            if (text.length > cap) {
                text = text.slice(0, cap).replace(/\s+\S*$/, '') + ' [truncated]';
                truncated.push(key);
            }
            rows.push([key, text]);
        });
        return { rows: rows, truncated: truncated, missing: missing };
    }

    function buildBlock(rows, wrap) {
        var body = rows.map(function (row) {
            return row[0] + ': ' + escapeXml(row[1]);
        }).join('\n');
        return wrap ? '<' + wrap + '>\n' + body + '\n</' + wrap + '>' : body;
    }

    function compile(prompt, vault, options) {
        var opts = options || {};
        var answers = opts.answers || {};
        var variant = opts.variant === 'standard' ? 'standard' : 'reasoning';
        var proj = projection(prompt, vault, answers);
        var targetJd = escapeXml(String(fieldFor(vault, 'target_jd') || (answers.target_jd || '') || '[NOT PROVIDED]'));

        var gate = GATE[prompt.completeness_gate_mode] || GATE.ask_first;
        var fallback = prompt.requires_web_fallback ? FALLBACK : '';

        var body = String(prompt[variant === 'standard' ? 'template_standard' : 'template_reasoning_xml'] || '');
        body = body.split('{{candidate_data}}').join(buildBlock(proj.rows, null));
        body = body.split('{{target_jd}}').join(targetJd);
        ['full_name', 'location', 'target_role', 'target_industry'].forEach(function (key) {
            var value = fieldFor(vault, key) || (answers && answers[key]) || '';
            body = body.split('{{' + key + '}}').join(escapeXml(isBlank(value) ? '[NOT PROVIDED]' : String(value)));
        });

        var parts = [];
        parts.push('[' + prompt.id + ' · ' + prompt.track + ' · pillar ' + prompt.pillar_index + ' ' + prompt.letter + ' · ' + prompt.funnel_stage + ']');
        parts.push('');
        parts.push(gate);
        if (fallback) { parts.push(''); parts.push(fallback); }
        parts.push('');
        parts.push(body.trim());

        var text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
        var max = Number(prompt.max_payload_bytes) || 20000;
        var notes = [];

        if (byteLength(text) > max) {
            proj.rows.forEach(function (row) {
                if (byteLength(text) <= max) { return; }
                if (row[1] === '[NOT PROVIDED]' || row[1].length < 200) { return; }
                var keep = Math.max(200, Math.floor(row[1].length / 2));
                row[1] = row[1].slice(0, keep) + ' [truncated]';
                if (proj.truncated.indexOf(row[0]) === -1) { proj.truncated.push(row[0]); }
                body = String(prompt[variant === 'standard' ? 'template_standard' : 'template_reasoning_xml'] || '');
                body = body.split('{{candidate_data}}').join(buildBlock(proj.rows, null));
                body = body.split('{{target_jd}}').join(targetJd);
                ['full_name', 'location', 'target_role', 'target_industry'].forEach(function (key) {
                    var scalar = fieldFor(vault, key) || (answers && answers[key]) || '';
                    body = body.split('{{' + key + '}}').join(escapeXml(isBlank(scalar) ? '[NOT PROVIDED]' : String(scalar)));
                });
                text = parts.slice(0, parts.length - 1).concat(body.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
            });
            if (byteLength(text) > max) {
                text = text.slice(0, max - 40) + '\n[payload truncated to the size cap]\n';
                notes.push('Payload trimmed to ' + max + ' bytes.');
            }
        }

        if (proj.truncated.length) {
            notes.push('Long fields trimmed: ' + proj.truncated.join(', ') + '.');
        }
        if (proj.missing.length) {
            notes.push('Still missing: ' + proj.missing.join(', ') + '.');
        }

        return {
            id: prompt.id,
            variant: variant,
            text: text,
            bytes: byteLength(text),
            max: max,
            missing: proj.missing,
            truncated: proj.truncated,
            notes: notes
        };
    }

    function tokenFree(text) {
        return !/\{\{|\}\}|\[PASTE/i.test(String(text || ''));
    }

    function precheck(vault) {
        var profile = (vault && vault.core_profile) || {};
        var buzz = ['results-driven', 'dynamic', 'passionate', 'hardworking', 'team player', 'proven track record', 'delve', 'leverage'];
        var blob = [profile.experience_raw, (profile.quantified_results || []).join(' '), profile.linkedin_text].join(' ');
        var found = buzz.filter(function (word) { return new RegExp('\\b' + word + '\\b', 'i').test(blob); });
        var metrics = (profile.quantified_results || []).length;
        var gaps = [];
        if (!metrics) { gaps.push('No quantified result yet. Add one number with its method.'); }
        if (!found.length && metrics) { gaps.push('No cliché phrases found in the text you have stored.'); }
        if (String(profile.experience_raw || '').length < 120) { gaps.push('Experience text is thin; a recruiter cannot see scope.'); }
        return {
            buzzwords: found,
            metrics: metrics,
            gaps: gaps,
            verdict: found.length ? 'Fix the clichés before you paste this into an AI tool.' : (metrics ? 'Local pre-check looks clean.' : 'Add evidence before relying on any rewrite.')
        };
    }

    window.EmploStartCompiler = {
        GATE: GATE,
        FALLBACK: FALLBACK,
        compile: compile,
        precheck: precheck,
        escapeXml: escapeXml,
        byteLength: byteLength,
        tokenFree: tokenFree
    };
})();
