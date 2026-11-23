/*
 * EmploStart: Market Assessment & Fair-Wage Readiness (module 03, Non-AI).
 *
 * Deterministic and local. It scores readiness to assess a market and a fair
 * wage from the inputs a person can actually control, and returns a research
 * checklist and negotiation questions. It deliberately generates no salary
 * figures, no demand numbers and no market sizes: those must come from the
 * person's own verified sources.
 *
 * Public surface: window.EmploStartEngines.market.assess(input)
 */
(function () {
    'use strict';

    window.EmploStartEngines = window.EmploStartEngines || {};

    function clamp(n) {
        return Math.max(0, Math.min(100, Math.round(n)));
    }

    function assess(input) {
        input = input || {};
        var role = String(input.role || '').trim();
        var region = String(input.region || '').trim();
        var years = String(input.years || '').trim();
        var transparency = ['yes', 'partial', 'no'].indexOf(input.transparency) >= 0 ? input.transparency : 'partial';

        var clarity = role ? (region ? 100 : 65) : region ? 40 : 15;
        var evidence = years ? 70 : 35;
        var negotiation = transparency === 'yes' ? 85 : transparency === 'partial' ? 55 : 25;
        var research = (role && region && years) ? 80 : (role && region) ? 60 : 35;

        var dimensions = [
            { key: 'clarity', label: 'Target clarity', score: clarity, note: 'A named role and region make every later step sharper.' },
            { key: 'evidence', label: 'Experience evidence', score: evidence, note: 'Years are a shortcut; outcomes and proof travel further.' },
            { key: 'research', label: 'Market research', score: research, note: 'Check live postings and public pay references for the exact role and region.' },
            { key: 'negotiation', label: 'Negotiation prep', score: negotiation, note: 'Know your range, your walk-away point, and what you will ask for in writing.' }
        ];

        var overall = clamp(dimensions.reduce(function (sum, d) { return sum + d.score; }, 0) / dimensions.length);

        var checklist = [
            'Collect 15 to 20 live postings for ' + (role || 'the target role') + (region ? ' in ' + region : '') + ' and note the recurring tasks, tools and stated ranges.',
            'Use at least two independent public pay sources for the same role and region; write down the date you checked each one.',
            'Separate base pay from bonus, equity, benefits and on-call; compare like with like.',
            'List the five outcomes you can prove, with numbers where you own the number.',
            'Decide your target range, your acceptable range, and your walk-away point before the first conversation.',
            'Prepare two questions about pay progression, review cadence and how ranges are set.'
        ];

        var questions = [
            'What is the published range for this role, and what decides where someone lands in it?',
            'How and when are pay reviews handled, and what evidence counts?',
            'Which parts of the package are fixed and which are discretionary?',
            'How do you keep pay fair across similar roles and backgrounds?',
            'What does success look like in the first six months, and how is it measured?'
        ];

        var redFlags = [
            'A range that is only revealed after you state a number first.',
            'Pay that depends on undisclosed targets or unpaid overtime.',
            'No written offer, or terms that change between conversations.',
            'A role described very differently by different interviewers.',
            'Pressure to decide before you can check the market.'
        ];

        return {
            source: 'local',
            role: role,
            region: region,
            overall: overall,
            band: overall >= 75 ? 'Ready to negotiate' : overall >= 50 ? 'Almost ready' : 'Build the evidence first',
            dimensions: dimensions,
            checklist: checklist,
            questions: questions,
            redFlags: redFlags,
            disclaimer: 'No salary figures are generated here. Use live postings and public pay sources for your role and region, and record when you checked them.',
            bridge: 'Employers can benchmark fairly too. Emplowise runs a free HR audit for teams that want structure behind pay and roles.'
        };
    }

    window.EmploStartEngines.market = { assess: assess };
})();
