/*
 * EmploStart: the 300-word story studio parser.
 *
 * Deterministic, offline, and honest. It reads the three guided parts, counts
 * words, pulls out only what is literally there (skills, tools, blockers,
 * directions, career stage) and returns a small set of vault fields plus a
 * starting recommendation. It never invents experience, titles or numbers.
 *
 * Public surface: window.EmploStartStory
 */
(function () {
    'use strict';

    var WORD_TARGET = 300;

    var SKILLS = [
        'communication', 'writing', 'copywriting', 'editing', 'research', 'analysis',
        'data analysis', 'excel', 'sql', 'python', 'javascript', 'html', 'css', 'react',
        'node', 'php', 'laravel', 'figma', 'canva', 'photoshop', 'design', 'ux', 'ui',
        'project management', 'operations', 'logistics', 'supply chain', 'budgeting',
        'finance', 'accounting', 'bookkeeping', 'sales', 'business development',
        'customer success', 'customer support', 'marketing', 'seo', 'social media',
        'email marketing', 'content', 'strategy', 'product management', 'agile', 'scrum',
        'stakeholder management', 'team leadership', 'hiring', 'training', 'coaching',
        'mentoring', 'facilitation', 'negotiation', 'procurement', 'vendor management',
        'event planning', 'administration', 'scheduling', 'reporting', 'dashboards',
        'power bi', 'tableau', 'google analytics', 'crm', 'hubspot', 'salesforce',
        'wordpress', 'shopify', 'teaching', 'curriculum', 'translation', 'proofreading',
        'photography', 'video editing', 'public speaking', 'networking', 'problem solving',
        'time management', 'quality assurance', 'testing', 'devops', 'git', 'cloud',
        'aws', 'azure', 'cybersecurity', 'prompting'
    ];

    var TOOLS = [
        'excel', 'google sheets', 'power bi', 'tableau', 'sql', 'python', 'javascript',
        'php', 'laravel', 'react', 'node', 'figma', 'canva', 'photoshop', 'wordpress',
        'shopify', 'hubspot', 'salesforce', 'notion', 'trello', 'asana', 'jira', 'slack',
        'zoom', 'google analytics', 'mailchimp', 'git', 'github', 'aws', 'azure',
        'chatgpt', 'gemini', 'claude', 'copilot', 'midjourney', 'linkedin'
    ];

    var FRICTIONS = [
        { key: 'burnout', label: 'burnout and exhaustion', re: /burn(?:ed|t)?\s*out|exhaust|drained|overwhelm|no energy/i },
        { key: 'underpaid', label: 'underpaid for the work you do', re: /underpaid|low pay|low salary|too little money|pay is low|underpay/i },
        { key: 'career_gap', label: 'a career gap to explain', re: /career break|career gap|took a break|time off|re-?enter|returning|maternity|family break/i },
        { key: 'no_portfolio', label: 'no proof or portfolio yet', re: /no portfolio|nothing to show|lack proof|no proof|no projects/i },
        { key: 'ai_anxiety', label: 'uncertainty about AI', re: /afraid of ai|scared of ai|ai is confusing|don'?t (?:know|understand) ai|new to ai|no idea how ai/i },
        { key: 'thin_network', label: 'a thin professional network', re: /no network|no contacts|few contacts|nobody to ask|alone in this|no referrals/i },
        { key: 'imposter', label: 'imposter feelings', re: /imposter|not good enough|fraud|don'?t belong|cant do it|can'?t do it/i },
        { key: 'rejections', label: 'silent rejections', re: /reject|no replies|no response|ghosted|never hear back|application(?:s)? (?:go|went) nowhere/i },
        { key: 'no_experience', label: 'no formal experience yet', re: /no experience|fresh grad|just graduated|no job yet|first job|internship/i },
        { key: 'stuck_role', label: 'stuck in the current role', re: /stuck|hate my job|disgruntl|unhappy at work|dead end|going nowhere|bored at work/i },
        { key: 'relocation', label: 'location or relocation limits', re: /cannot relocate|can'?t relocate|relocat|visa|remote only|only remote|must stay/i },
        { key: 'time_pressure', label: 'very little time each week', re: /no time|busy|tight schedule|caregiv|two jobs|shift work/i }
    ];

    var DIRECTIONS = [
        'product manager', 'project manager', 'data analyst', 'business analyst', 'marketing',
        'digital marketing', 'content writer', 'copywriter', 'ux designer', 'ui designer',
        'graphic designer', 'software developer', 'software engineer', 'frontend developer',
        'backend developer', 'full stack developer', 'data scientist', 'machine learning',
        'hr', 'human resources', 'recruiter', 'operations', 'supply chain', 'finance',
        'accountant', 'sales', 'business development', 'customer success', 'customer support',
        'teacher', 'researcher', 'consultant', 'founder', 'freelancer', 'remote',
        'cybersecurity', 'devops', 'qa', 'administrator', 'office manager'
    ];

    var STAGES = [
        { key: 'student', label: 'student or fresh graduate', re: /student|university|college|graduat|final year|internship/i },
        { key: 'returning', label: 'returning after a break', re: /career break|career gap|returning|re-?enter|maternity|after a break|time off/i },
        { key: 'founder', label: 'founder or self-employed', re: /founder|startup|my company|my business|freelanc|self-?employed/i },
        { key: 'senior', label: 'senior or leading', re: /senior|lead|manager|head of|director|years of experience|team of/i },
        { key: 'early', label: 'early career', re: /junior|entry|assistant|associate|1 year|2 years|3 years|starting out/i }
    ];

    var RECOMMEND = {
        stuck_employee: { tools: ['pivot', 'market', 'profile'], prompts: ['P02', 'P12', 'P01'] },
        student: { tools: ['profile', 'ats', 'interview'], prompts: ['P01', 'P06', 'P05'] },
        founder: { tools: ['reimagine', 'market', 'pivot'], prompts: ['P13', 'P09', 'P12'] },
        women_career: { tools: ['profile', 'pivot', 'interview'], prompts: ['P04', 'P05', 'P12'] },
        beginner_ai_brand: { tools: ['profile', 'ats', 'pivot'], prompts: ['P04', 'P06', 'P05'] }
    };

    var FRICTION_BOOST = {
        burnout: { tools: ['pivot'], prompts: ['P02'] },
        underpaid: { tools: ['market'], prompts: ['P12'] },
        career_gap: { tools: ['profile'], prompts: ['P04'] },
        no_portfolio: { tools: ['profile'], prompts: ['P06'] },
        ai_anxiety: { tools: ['profile'], prompts: ['P04'] },
        thin_network: { tools: ['pivot'], prompts: ['P08'] },
        imposter: { tools: ['profile'], prompts: ['P01'] },
        rejections: { tools: ['ats'], prompts: ['P09'] },
        no_experience: { tools: ['profile'], prompts: ['P06'] },
        stuck_role: { tools: ['pivot'], prompts: ['P02'] },
        relocation: { tools: ['market'], prompts: ['P03'] },
        time_pressure: { tools: ['pivot'], prompts: ['P14'] }
    };

    var TOOL_NAMES = {
        pivot: 'Career Pivot Planner',
        reimagine: 'Reimagination Lab',
        market: 'Market & Fair Wage',
        ats: 'ATS Analyzer',
        interview: 'Interview Prep',
        profile: 'Profile Builder'
    };

    function clean(value, cap) {
        var text = String(value == null ? '' : value)
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
            .replace(/[<>]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cap ? text.slice(0, cap) : text;
    }

    function countWords(text) {
        var trimmed = String(text || '').replace(/[<>]/g, ' ').trim();
        if (!trimmed) { return 0; }
        return trimmed.split(/\s+/).filter(function (word) { return word.length > 0; }).length;
    }

    function wordStatus(count) {
        var n = Number(count) || 0;
        if (n === 0) { return 'empty'; }
        if (n < 60) { return 'start'; }
        if (n <= WORD_TARGET) { return 'good'; }
        return 'over';
    }

    function findTerms(haystack, vocabulary) {
        var hits = [];
        vocabulary.forEach(function (term) {
            if (hits.length >= 12) { return; }
            var pattern = new RegExp('(^|[^a-z0-9])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(e?s)?([^a-z0-9]|$)', 'i');
            if (pattern.test(haystack)) { hits.push(term); }
        });
        return hits;
    }

    function detectFrictions(haystack) {
        var hits = [];
        FRICTIONS.forEach(function (entry) {
            if (entry.re.test(haystack)) { hits.push({ key: entry.key, label: entry.label }); }
        });
        return hits.slice(0, 6);
    }

    function detectDirections(haystack) {
        var hits = [];
        DIRECTIONS.forEach(function (term) {
            if (hits.length >= 6) { return; }
            var pattern = new RegExp('(^|[^a-z0-9])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es)?([^a-z0-9]|$)', 'i');
            if (pattern.test(haystack)) { hits.push(term); }
        });
        return hits;
    }

    function detectStage(haystack, persona) {
        for (var i = 0; i < STAGES.length; i += 1) {
            if (STAGES[i].re.test(haystack)) { return STAGES[i].label; }
        }
        if (persona === 'student') { return 'student or fresh graduate'; }
        if (persona === 'founder') { return 'founder or self-employed'; }
        if (persona === 'women_career') { return 'returning after a break'; }
        return 'career changer';
    }

    function uniq(list) {
        var seen = {};
        return list.filter(function (item) {
            if (!item || seen[item]) { return false; }
            seen[item] = true;
            return true;
        });
    }

    function buildRecommendations(persona, frictions) {
        var base = RECOMMEND[persona] || RECOMMEND.beginner_ai_brand;
        var tools = base.tools.slice();
        var prompts = base.prompts.slice();
        (frictions || []).forEach(function (friction) {
            var boost = FRICTION_BOOST[friction.key];
            if (!boost) { return; }
            tools = boost.tools.concat(tools);
            prompts = boost.prompts.concat(prompts);
        });
        tools = uniq(tools).slice(0, 2);
        prompts = uniq(prompts).slice(0, 2);
        return {
            tools: tools.map(function (id) { return { id: id, name: TOOL_NAMES[id] || id }; }),
            prompts: prompts,
            day: 1
        };
    }

    function normalizeInput(input) {
        if (input && typeof input === 'object') {
            return {
                who: clean(input.who_am_i, 2000),
                where: clean(input.where_am_i, 2000),
                what: clean(input.what_i_want, 2000),
                raw: clean(
                    [input.who_am_i, input.where_am_i, input.what_i_want].filter(Boolean).join('\n\n'),
                    4000
                )
            };
        }
        var raw = clean(input, 4000);
        return { who: '', where: '', what: '', raw: raw };
    }

    function parseStory300(input, persona) {
        var parts = normalizeInput(input);
        var words = countWords(parts.raw);
        var haystack = parts.raw.toLowerCase();

        var skills = findTerms(haystack, SKILLS);
        var tools = findTerms(haystack, TOOLS);
        var frictions = detectFrictions(haystack);
        var directions = detectDirections(haystack);
        var stage = detectStage(haystack, persona);
        var recommendation = buildRecommendations(persona, frictions);

        var signals = [];
        if (skills.length) { signals.push('Skills: ' + skills.slice(0, 4).join(', ')); }
        if (tools.length) { signals.push('Tools: ' + tools.slice(0, 4).join(', ')); }
        if (frictions.length) { signals.push('Blocker: ' + frictions[0].label); }
        if (directions.length) { signals.push('Direction: ' + directions.slice(0, 3).join(', ')); }
        signals.push('Stage: ' + stage);
        signals = uniq(signals).slice(0, 6);

        var fields = {};
        if (skills.length) { fields.skills = skills.slice(0, 12); }
        if (tools.length) { fields.tools = tools.slice(0, 12); }
        if (parts.where || parts.what) {
            fields.goals_and_constraints = clean(
                [parts.where ? 'Right now: ' + parts.where : '', parts.what ? 'Goal: ' + parts.what : '']
                    .filter(Boolean).join(' '),
                400
            );
        }
        fields.career_stage = stage;

        return {
            raw_text: parts.raw,
            who_am_i: parts.who,
            where_am_i: parts.where,
            what_i_want: parts.what,
            word_count: words,
            word_status: wordStatus(words),
            extracted_signals: signals,
            skills: skills,
            tools: tools,
            frictions: frictions,
            directions: directions,
            career_stage: stage,
            fields: fields,
            recommended: recommendation
        };
    }

    window.EmploStartStory = {
        WORD_TARGET: WORD_TARGET,
        countWords: countWords,
        wordStatus: wordStatus,
        parseStory300: parseStory300,
        toolName: function (id) { return TOOL_NAMES[id] || id; }
    };
})();
