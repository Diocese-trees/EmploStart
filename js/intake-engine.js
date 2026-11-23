/*
 * EmploStart: the three-lane intake.
 *
 * Lane 1  a 12-question diagnostic that needs no CV
 * Lane 2  a LinkedIn URL plus pasted profile text and gap questions
 * Lane 3  a CV upload (.docx / .txt / .md) or repaired PDF paste
 *
 * Everything here is deterministic and local. Parsing produces evidence, not
 * judgement: it extracts what the text actually says and flags what is
 * missing. Writes go through the vault only after a preview.
 *
 * Public surface: window.EmploStartIntake
 */
(function () {
    'use strict';

    var LINKEDIN = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[\w\-%.]+\/?$/i;
    var METRIC = /(\d+(?:[.,]\d+)?\s?%|(?:pkr|rs\.?|usd|\$)\s?\d[\d,]*|\b\d[\d,]{2,}\b|\b\d+(?:\.\d+)?x\b|\b\d+\s+(?:people|staff|clients|customers|hours|days|weeks|months)\b)/i;
    var YEARS = /\b(20\d{2})\b/g;
    var BUZZ = ['results-driven', 'dynamic', 'passionate', 'hardworking', 'team player', 'proven track record', 'delve', 'leverage', 'synergy', 'go-getter'];
    var LINKS = /https?:\/\/[^\s,;)]+/gi;
    var EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
    var PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
    var BULLET = /^[\s]*(?:[•●▪◦*·]|[-–—])\s+/;

    var DIAGNOSTIC = [
        { id: 'q1', prompt: 'How many years of paid or equivalent work experience do you have?', options: [['None yet', 5], ['Under 1 year', 15], ['1 to 3 years', 35], ['4 years or more', 55]] },
        { id: 'q2', prompt: 'Can you point to a result you improved with a number?', options: [['No, not yet', 0], ['I can describe it but not the number', 15], ['Yes, roughly', 30], ['Yes, with method and number', 45]] },
        { id: 'q3', prompt: 'How current is your strongest evidence?', options: [['Older than 2022', 5], ['2022 to 2023', 15], ['2024 to 2025', 30], ['2026 work', 40]] },
        { id: 'q4', prompt: 'Do you have one target role in mind?', options: [['Not yet', 0], ['A direction, not a title', 12], ['Two or three titles', 24], ['One clear title', 35]] },
        { id: 'q5', prompt: 'How well can you list the tools your target role uses?', options: [['Not at all', 0], ['A few names', 10], ['Most of them', 20], ['I use them today', 30]] },
        { id: 'q6', prompt: 'Is your CV one column of plain text?', options: [['No CV yet', 0], ['Multi-column or designed', 8], ['Mostly plain', 18], ['Yes, plain single column', 25]] },
        { id: 'q7', prompt: 'Can a recruiter find you on LinkedIn with the right title?', options: [['No profile', 0], ['Profile, generic headline', 8], ['Headline matches the target role', 18], ['Headline, About, and proof all set', 25]] },
        { id: 'q8', prompt: 'How many interview-ready stories do you have?', options: [['None', 0], ['One or two', 10], ['Three or four', 20], ['Five or more with numbers', 30]] },
        { id: 'q9', prompt: 'Have you received a written offer or a salary range before?', options: [['Never', 0], ['Verbal only', 8], ['Written offer once', 16], ['Written offers, several times', 25]] },
        { id: 'q10', prompt: 'Do you know the range for your target role in your city?', options: [['No idea', 0], ['A rough sense', 8], ['From two or more postings', 16], ['From postings plus people who hold the role', 25]] },
        { id: 'q11', prompt: 'Do you have public proof a stranger could open?', options: [['Nothing public', 0], ['A profile page', 8], ['One artefact or case study', 16], ['Two or more artefacts', 25]] },
        { id: 'q12', prompt: 'How clear are your hard constraints: location, hours, care duties?', options: [['Not thought about it', 0], ['Roughly', 8], ['Mostly written down', 16], ['Written and tested against a real posting', 25]] }
    ];

    function bandsFrom(scores) {
        var vault = window.EmploStartVault;
        var label = vault ? vault.bandForScore : function (n) {
            return n >= 80 ? 'Evidence-Backed' : n >= 55 ? 'Competitive' : n >= 30 ? 'Developing' : 'Foundation';
        };
        var out = {};
        Object.keys(scores).forEach(function (key) {
            var score = Math.max(0, Math.min(100, Math.round(scores[key])));
            out[key] = { label: label(score), score: score };
        });
        return out;
    }

    function scoreDiagnostic(answers) {
        var a = answers || {};
        var values = {};
        DIAGNOSTIC.forEach(function (q) {
            var index = Number(a[q.id]);
            values[q.id] = Number.isFinite(index) && q.options[index] ? q.options[index][1] : 0;
        });
        var bands = bandsFrom({
            evidence: (values.q2 + values.q3 + values.q8) * (100 / 115),
            positioning: (values.q4 + values.q5 + values.q7) * (100 / 85),
            market_clarity: (values.q10 + values.q4) * (100 / 60),
            ats_readiness: (values.q6 + values.q7 + values.q2) * (100 / 95),
            interview_readiness: (values.q8 + values.q1 + values.q4) * (100 / 120),
            negotiation: (values.q9 + values.q10) * (100 / 50),
            pivot_readiness: (values.q11 + values.q12 + values.q4) * (100 / 85)
        });
        var ranked = Object.keys(bands).sort(function (x, y) { return bands[x].score - bands[y].score; });
        var recommend = {
            evidence: ['P01', 'P05', 'P06'],
            positioning: ['P03', 'P04', 'P01'],
            market_clarity: ['P02', 'P03', 'P12'],
            ats_readiness: ['P07', 'P05', 'P09'],
            interview_readiness: ['P10', 'P11', 'P09'],
            negotiation: ['P12', 'P02', 'P08'],
            pivot_readiness: ['P14', 'P13', 'P06']
        };
        var picks = [];
        ranked.forEach(function (key) {
            recommend[key].forEach(function (id) {
                if (picks.indexOf(id) === -1 && picks.length < 3) { picks.push(id); }
            });
        });
        return { bands: bands, weakest: ranked[0], recommended: picks, answered: DIAGNOSTIC.filter(function (q) { return a[q.id] != null; }).length };
    }

    function emptyFields() {
        return {
            full_name: '', location: '', education: '', experience_raw: '',
            roles_parsed: [], skills: [], tools: [], industries: [], companies: [],
            quantified_results: [], portfolio_links: [], linkedin_url: '', linkedin_text: ''
        };
    }

    function repairPdfPaste(text) {
        var source = String(text || '').replace(/\r\n?/g, '\n');
        var lines = source.split('\n').map(function (line) { return line.replace(/\s+$/g, ''); });
        var out = [];
        lines.forEach(function (line) {
            var trimmed = line.trim();
            if (!trimmed) { out.push(''); return; }
            if (BULLET.test(trimmed)) { out.push('- ' + trimmed.replace(BULLET, '').trim()); return; }
            var last = out.length ? out[out.length - 1] : '';
            var lastIsHeading = /^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3}$/.test(last.trim());
            var currentIsContact = /@|https?:\/\//.test(trimmed);
            var joins = last && !lastIsHeading && !currentIsContact && !/[.;:!?]$/.test(last) && /^[a-z(]/.test(trimmed) && !BULLET.test(last);
            if (joins) {
                out[out.length - 1] = (last + ' ' + trimmed).replace(/\s{2,}/g, ' ');
            } else {
                out.push(trimmed.replace(/\s{2,}/g, ' '));
            }
        });
        return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function findSection(lines, names) {
        var index = -1;
        lines.forEach(function (line, i) {
            if (index !== -1) { return; }
            var clean = line.replace(/[^a-z ]/gi, '').trim().toLowerCase();
            if (names.indexOf(clean) !== -1) { index = i; }
        });
        return index;
    }

    function splitList(value) {
        return String(value || '').split(/[,;|•\n]+/).map(function (item) {
            return item.trim().replace(/\.$/, '');
        }).filter(function (item) { return item.length > 1 && item.length < 60; }).slice(0, 12);
    }

    function parseCv(text) {
        var clean = repairPdfPaste(text);
        var lines = clean.split('\n').filter(function (line) { return line.trim().length > 0; });
        var fields = emptyFields();
        var flags = { buzzwords: [], metrics: 0, years: [], actionVerbs: 0, sections: [] };

        var emails = clean.match(EMAIL) || [];
        var phones = clean.match(PHONE) || [];
        var links = clean.match(LINKS) || [];
        links.forEach(function (link) {
            if (/linkedin\.com\/in\//i.test(link)) { fields.linkedin_url = link; }
            else if (fields.portfolio_links.length < 6) { fields.portfolio_links.push(link); }
        });
        if (emails.length) { fields.contact = emails[0]; }
        if (phones.length) { fields.phone = phones[0]; }

        var skillsAt = findSection(lines, ['skills', 'core skills', 'technical skills']);
        var toolsAt = findSection(lines, ['tools', 'software', 'toolkit']);
        if (skillsAt !== -1) {
            fields.skills = splitList((lines[skillsAt + 1] || '') + ' ' + (lines[skillsAt + 2] || ''));
            flags.sections.push('skills');
        }
        if (toolsAt !== -1) {
            fields.tools = splitList((lines[toolsAt + 1] || '') + ' ' + (lines[toolsAt + 2] || ''));
            flags.sections.push('tools');
        }

        var educationAt = findSection(lines, ['education', 'qualifications']);
        if (educationAt !== -1) {
            fields.education = (lines[educationAt + 1] || '').slice(0, 300);
            flags.sections.push('education');
        }

        // One-line labels such as "Skills: Excel, SQL" are common in PDF pastes.
        lines.forEach(function (line) {
            var inline = /^([a-z ]{3,20})\s*:\s*(.+)$/i.exec(line.trim());
            if (!inline) { return; }
            var label = inline[1].trim().toLowerCase();
            var value = inline[2];
            if (!fields.skills.length && ['skills', 'core skills', 'technical skills'].indexOf(label) !== -1) {
                fields.skills = splitList(value);
                if (flags.sections.indexOf('skills') === -1) { flags.sections.push('skills'); }
            }
            if (!fields.tools.length && ['tools', 'software', 'toolkit'].indexOf(label) !== -1) {
                fields.tools = splitList(value);
                if (flags.sections.indexOf('tools') === -1) { flags.sections.push('tools'); }
            }
            if (!fields.education && ['education', 'qualifications'].indexOf(label) !== -1) {
                fields.education = value.slice(0, 300);
                if (flags.sections.indexOf('education') === -1) { flags.sections.push('education'); }
            }
        });

        var experienceAt = findSection(lines, ['experience', 'work experience', 'employment']);
        if (experienceAt !== -1) {
            flags.sections.push('experience');
            fields.experience_raw = lines.slice(experienceAt + 1, experienceAt + 40).join('\n').slice(0, 6000);
        } else {
            fields.experience_raw = clean.slice(0, 6000);
        }

        fields.roles_parsed = lines.filter(function (line) {
            return /\b(20\d{2})\b/.test(line) && /[-–—]|to/i.test(line) && line.length < 120;
        }).slice(0, 8);

        lines.forEach(function (line) {
            if (METRIC.test(line) && fields.quantified_results.length < 8) {
                fields.quantified_results.push(line.replace(BULLET, '').trim().slice(0, 180));
                flags.metrics += 1;
            }
            if (/^[\s-]*(?:led|ran|built|cut|reduced|increased|launched|designed|trained|owned|migrated|delivered|shipped|saved)\b/i.test(line)) {
                flags.actionVerbs += 1;
            }
        });

        BUZZ.forEach(function (word) {
            if (new RegExp('\\b' + word.replace(/[-]/g, '\\-') + '\\b', 'i').test(clean)) {
                flags.buzzwords.push(word);
            }
        });
        var yearMatch = clean.match(YEARS) || [];
        flags.years = Array.from(new Set(yearMatch.map(Number))).sort(function (a, b) { return b - a; }).slice(0, 6);

        var nameLine = lines.find(function (line) {
            return /^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/.test(line.trim()) && line.length < 50;
        });
        if (nameLine) { fields.full_name = nameLine.trim(); }

        return { fields: fields, flags: flags, repaired: clean !== String(text || '').trim() };
    }

    function parseLinkedIn(url, text) {
        var cleanUrl = String(url || '').trim();
        var valid = LINKEDIN.test(cleanUrl);
        var parsed = parseCv(text || '');
        if (valid) { parsed.fields.linkedin_url = cleanUrl; }
        parsed.fields.linkedin_text = String(text || '').slice(0, 8000);
        return {
            valid: valid,
            fields: parsed.fields,
            flags: parsed.flags,
            note: valid
                ? 'We never open or scrape LinkedIn. The link is stored; the text you paste is what we use.'
                : 'That does not look like a linkedin.com/in/ profile URL. Paste the profile text instead.'
        };
    }

    var DELTA = [
        { key: 'target_role', label: 'What role are you targeting?' },
        { key: 'full_name', label: 'Your name, as it should appear on documents' },
        { key: 'location', label: 'City and country for market checks' },
        { key: 'quantified_results', label: 'One result with a number, and how you measured it' },
        { key: 'skills', label: 'Two or three skills you can prove with work' },
        { key: 'tools', label: 'Tools you actually use, by name' },
        { key: 'education', label: 'Your highest qualification and year' },
        { key: 'goals_and_constraints', label: 'Hard limits: location, hours, care duties' }
    ];

    function deltaQuestions(fields, vault) {
        var db = vault || (window.EmploStartVault ? window.EmploStartVault.read() : null);
        var out = [];
        DELTA.forEach(function (item) {
            var value;
            if (item.key === 'target_role') {
                value = db && window.EmploStartVault ? window.EmploStartVault.getField(db, 'target_role') : '';
            } else {
                value = fields && fields[item.key] != null ? fields[item.key] : (db && db.core_profile ? db.core_profile[item.key] : '');
            }
            var empty = Array.isArray(value) ? value.length === 0 : String(value || '').trim().length === 0;
            if (empty) { out.push(item); }
        });
        return out.slice(0, 6);
    }

    function mergePreview(fields, vault) {
        var db = vault || (window.EmploStartVault ? window.EmploStartVault.read() : null);
        if (!db) { return []; }
        var rows = [];
        Object.keys(fields || {}).forEach(function (key) {
            var incoming = fields[key];
            var hasIncoming = Array.isArray(incoming) ? incoming.length > 0 : String(incoming || '').trim().length > 0;
            if (!hasIncoming) { return; }
            var existing = db.core_profile && db.core_profile[key];
            var hasExisting = Array.isArray(existing) ? existing.length > 0 : String(existing || '').trim().length > 0;
            if (!hasExisting) { return; }
            var source = db.field_sources ? db.field_sources[key] : '';
            rows.push({
                key: key,
                existing: existing,
                incoming: incoming,
                protected: source === 'manual',
                action: source === 'manual' ? 'keep' : 'replace'
            });
        });
        return rows;
    }

    window.EmploStartIntake = {
        DIAGNOSTIC: DIAGNOSTIC,
        scoreDiagnostic: scoreDiagnostic,
        parseCv: parseCv,
        parseLinkedIn: parseLinkedIn,
        repairPdfPaste: repairPdfPaste,
        deltaQuestions: deltaQuestions,
        mergePreview: mergePreview,
        validateLinkedInUrl: function (url) { return LINKEDIN.test(String(url || '').trim()); }
    };
})();
