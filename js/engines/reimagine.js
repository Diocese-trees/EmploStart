/*
 * EmploStart: Career Reimagination Lab (module 02, Non-AI default).
 *
 * Deterministic and local. It maps a person's strengths, interests and work
 * style onto a fixed catalogue of role archetypes and returns the closest
 * matches. The output names directions to explore, not jobs anyone owes you,
 * and it never fabricates salaries or demand.
 *
 * Public surface: window.EmploStartEngines.reimagine.lab(input)
 */
(function () {
    'use strict';

    window.EmploStartEngines = window.EmploStartEngines || {};

    var ARCHETYPES = [
        {
            id: 'builder',
            title: 'The Builder',
            why: 'You like turning a rough idea into something that works.',
            tags: ['build', 'ship', 'product', 'engineer', 'maker', 'prototype', 'design', 'technical', 'software', 'create'],
            titles: ['Product manager', 'Solutions engineer', 'Technical project lead', 'Founder operations'],
            skills: ['Scoping', 'Prototyping', 'Working with engineers', 'Shipping under constraints'],
            firstStep: 'Ship one small end-to-end artifact and write down what you would change next time.',
            caution: 'Builders can over-invest in the artifact. Set a finish line before you start.'
        },
        {
            id: 'analyst',
            title: 'The Analyst',
            why: 'You trust evidence and like making the messy measurable.',
            tags: ['data', 'analyse', 'analyze', 'research', 'metrics', 'numbers', 'insight', 'report', 'finance', 'sql', 'statistics'],
            titles: ['Data analyst', 'Business analyst', 'Operations analyst', 'Research associate'],
            skills: ['Spreadsheets and SQL', 'Structuring a question', 'Reading a funnel', 'Writing a clear finding'],
            firstStep: 'Take one public dataset and write a one-page finding that a non-specialist could act on.',
            caution: 'Analysis without a decision is busywork. Always end with a recommendation.'
        },
        {
            id: 'people',
            title: 'The People Lead',
            why: 'You get energy from helping other people do their best work.',
            tags: ['people', 'team', 'coach', 'hr', 'train', 'support', 'community', 'teach', 'mentor', 'recruit'],
            titles: ['People operations', 'Programme manager', 'Customer success', 'Learning and development'],
            skills: ['Structured listening', 'Facilitation', 'Feedback', 'Process design for teams'],
            firstStep: 'Run one small workshop or onboarding session and collect structured feedback.',
            caution: 'Care work is real work. Track your own load, not just other people\'s.'
        },
        {
            id: 'operator',
            title: 'The Operator',
            why: 'You make complex systems run calmly and on time.',
            tags: ['operations', 'process', 'logistics', 'supply', 'coordinate', 'run', 'efficiency', 'project', 'delivery', 'systems'],
            titles: ['Operations manager', 'Programme coordinator', 'Supply chain planner', 'Chief of staff'],
            skills: ['Process mapping', 'Vendor management', 'Risk logs', 'Cross-team scheduling'],
            firstStep: 'Map one recurring process end to end and remove a single avoidable step.',
            caution: 'Operators absorb chaos silently. Document the load so it is visible.'
        },
        {
            id: 'communicator',
            title: 'The Communicator',
            why: 'You turn complicated work into words and stories people act on.',
            tags: ['write', 'writing', 'communicate', 'content', 'market', 'brand', 'story', 'storytelling', 'editor', 'copy', 'social'],
            titles: ['Content strategist', 'Communications manager', 'Brand associate', 'Marketing generalist'],
            skills: ['Clear writing', 'Audience research', 'Editing', 'Message testing'],
            firstStep: 'Rewrite one real piece of work for a specific audience and measure the response.',
            caution: 'Good writing needs a distribution plan, not just a draft.'
        },
        {
            id: 'advisor',
            title: 'The Advisor',
            why: 'You like diagnosing a problem and recommending the next move.',
            tags: ['advise', 'consult', 'strategy', 'client', 'solve', 'problem', 'recommend', 'sales', 'partner', 'growth'],
            titles: ['Consultant', 'Customer success lead', 'Partnerships manager', 'Strategy associate'],
            skills: ['Problem framing', 'Stakeholder interviews', 'Options analysis', 'Recommendation writing'],
            firstStep: 'Take one real problem you have solved and turn it into a two-page case study.',
            caution: 'Advice is cheap without evidence of outcomes. Show the before and after.'
        }
    ];

    var STYLE_WEIGHT = {
        builder: { builder: 2.5, operator: 1.2, analyst: 0.8 },
        analyst: { analyst: 2.5, operator: 1.2, advisor: 1 },
        people: { people: 2.5, communicator: 1.2, advisor: 0.8 },
        operator: { operator: 2.5, builder: 1, analyst: 0.8 },
        communicator: { communicator: 2.5, people: 1.2, advisor: 0.8 },
        advisor: { advisor: 2.5, analyst: 1.2, communicator: 0.8 }
    };

    function words(text) {
        return String(text || '')
            .toLowerCase()
            .split(/[^a-z0-9+]+/)
            .filter(function (w) { return w.length > 2; });
    }

    function countHits(tokens, tags) {
        var seen = {};
        var hits = 0;
        tokens.forEach(function (t) {
            if (tags.indexOf(t) >= 0 && !seen[t]) { seen[t] = true; hits += 1; }
        });
        return hits;
    }

    function lab(input) {
        input = input || {};
        var current = String(input.current || '').trim();
        var strengths = String(input.strengths || '').trim();
        var interests = String(input.interests || '').trim();
        var style = String(input.workStyle || '').trim();
        var constraints = String(input.constraints || '').trim();

        var tokens = words(strengths + ' ' + interests + ' ' + constraints);
        var styleBoost = STYLE_WEIGHT[style] || {};

        var scored = ARCHETYPES.map(function (a) {
            var score = countHits(tokens, a.tags) * 2;
            score += styleBoost[a.id] || 0;
            if (!tokens.length && !style) { score = 1; }
            return { archetype: a, score: score };
        });

        scored.sort(function (x, y) {
            if (y.score !== x.score) { return y.score - x.score; }
            return x.archetype.id < y.archetype.id ? -1 : 1;
        });

        var top = scored.slice(0, 3).map(function (row) {
            return {
                id: row.archetype.id,
                title: row.archetype.title,
                why: row.archetype.why,
                titles: row.archetype.titles.slice(),
                skills: row.archetype.skills.slice(),
                firstStep: row.archetype.firstStep,
                caution: row.archetype.caution
            };
        });

        var note = (!strengths && !interests && !style)
            ? 'Add a few strengths, interests or a work style to sharpen the matches.'
            : 'These are directions to test, not a shortlist of guaranteed openings.';

        return {
            source: 'local',
            current: current,
            matches: top,
            note: note,
            disclaimer: 'A reflection aid only. It does not predict demand, salary, or hiring outcomes.'
        };
    }

    window.EmploStartEngines.reimagine = { lab: lab };
})();
