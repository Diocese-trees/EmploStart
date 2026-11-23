/*
 * EmploStart: Career Pivot Planner (module 01, Non-AI default).
 *
 * Deterministic and local. It turns a current role, a target direction,
 * transferable skills and a few constraints into a staged plan. It never
 * invents salaries, hiring volumes, or placement odds: every phase is a list
 * of actions the person can take and verify themselves.
 *
 * Public surface: window.EmploStartEngines.pivot.plan(input)
 */
(function () {
    'use strict';

    window.EmploStartEngines = window.EmploStartEngines || {};

    var RISK_WEEKS = { low: 1.2, medium: 1, high: 0.8 };

    function words(text) {
        return String(text || '')
            .toLowerCase()
            .split(/[^a-z0-9+]+/)
            .filter(function (w) { return w.length > 2; });
    }

    function overlap(a, b) {
        var setB = {};
        words(b).forEach(function (w) { setB[w] = true; });
        var seen = {};
        var hits = [];
        words(a).forEach(function (w) {
            if (setB[w] && !seen[w]) { seen[w] = true; hits.push(w); }
        });
        return hits;
    }

    function clamp(n, lo, hi) {
        return Math.max(lo, Math.min(hi, Math.round(n)));
    }

    function plan(input) {
        input = input || {};
        var current = String(input.current || '').trim();
        var target = String(input.target || '').trim();
        var skills = String(input.skills || '').trim();
        var strengths = String(input.strengths || '').trim();
        var hours = Number(input.hoursPerWeek) > 0 ? Number(input.hoursPerWeek) : 5;
        var runway = ['explore', 'transition', 'urgent'].indexOf(input.runway) >= 0 ? input.runway : 'transition';
        var risk = ['low', 'medium', 'high'].indexOf(input.risk) >= 0 ? input.risk : 'medium';
        var network = ['none', 'some', 'strong'].indexOf(input.network) >= 0 ? input.network : 'some';

        var shared = overlap(skills + ' ' + strengths, target);
        var clarity = target ? (current ? 1 : 0.6) : 0;
        var skillSignal = skills ? Math.min(1, shared.length / 5) : 0;
        var timeSignal = Math.min(1, hours / 10);
        var networkSignal = network === 'strong' ? 1 : network === 'some' ? 0.55 : 0.15;

        var readiness = clamp(100 * (0.35 * clarity + 0.3 * skillSignal + 0.2 * timeSignal + 0.15 * networkSignal), 0, 96);

        var pace = RISK_WEEKS[risk] * (runway === 'urgent' ? 0.7 : runway === 'explore' ? 1.25 : 1);
        var w1 = clamp(4 * pace, 2, 8);
        var w2 = clamp(Math.round((hours >= 8 ? 8 : 10) * pace), 4, 16);
        var w3 = clamp(12 * pace, 8, 24);

        var phases = [
            {
                name: 'Discover',
                weeks: w1,
                focus: 'Name the move and test it before you spend money.',
                actions: [
                    'List 12 things you already do well, then keep the 5 that a target team would pay for.',
                    'Shortlist three target roles in ' + (target || 'the field you are testing') + ' and read ten live job posts for each.',
                    'Run two informational conversations with people already in the target role; ask what they wish they had known.',
                    'Write a one-page brief: what you bring, what you still need, and the first role you will aim for.'
                ]
            },
            {
                name: 'Build',
                weeks: w2,
                focus: 'Close the smallest credible skill gap and prove it with work.',
                actions: [
                    'Pick one bridge skill from the list below and finish a short, specific course or project in it.',
                    'Ship one portfolio artifact that mirrors a real task in the target role.',
                    'Rewrite your resume around outcomes for the target role, not duties from the old one.',
                    'Run three mock interviews and score the answers against the target role.',
                    'Ask two people for a referral or a warm introduction, not a job.'
                ]
            },
            {
                name: 'Transition',
                weeks: w3,
                focus: 'Apply in a focused wave and keep the pipeline honest.',
                actions: [
                    'Apply to roles that match at least 70 percent of your brief; track every one in a simple sheet.',
                    'Follow up once after seven days, then move on; do not chase silence.',
                    'Prepare a 60-second story for the pivot that leads with transferable value.',
                    'Compare any offer against your fair-wage checklist before you answer.',
                    'Plan the first 90 days so the new team sees value fast.'
                ]
            }
        ];

        var bridgePool = [
            { key: 'communication', label: 'Written and spoken communication', hint: 'Practise a weekly written update and one short presentation.' },
            { key: 'data', label: 'Data literacy', hint: 'Learn to read a spreadsheet, a funnel, and one dashboard end to end.' },
            { key: 'tools', label: 'Role tools', hint: 'Pick the two tools the job posts mention most and build one small thing in each.' },
            { key: 'domain', label: 'Domain vocabulary', hint: 'Keep a glossary of the target field and use it in your next three conversations.' },
            { key: 'stakeholder', label: 'Stakeholder management', hint: 'Shadow a project with a cross-team decision and note how it was made.' },
            { key: 'portfolio', label: 'Evidence of work', hint: 'Turn one past project into a before/after case study.' }
        ];

        var chosen = [];
        for (var i = 0; i < bridgePool.length && chosen.length < 4; i += 1) {
            if (overlap(bridgePool[i].label, skills).length === 0) {
                chosen.push(bridgePool[i]);
            }
        }
        if (chosen.length < 3) {
            chosen = chosen.concat(bridgePool.slice(0, 3 - chosen.length));
        }

        var risks = [];
        if (!target) { risks.push('No target direction yet. Do the Discover phase before committing money or leave.'); }
        if (hours < 5) { risks.push('Under five hours a week makes the Build phase slow. Protect a fixed weekly block.'); }
        if (network === 'none') { risks.push('No network signal. Add two conversations a month before you apply at scale.'); }
        if (runway === 'urgent') { risks.push('An urgent timeline narrows options. Favour roles that value your existing domain first.'); }
        if (!risks.length) { risks.push('The plan is only as good as the evidence. Re-check it every four weeks.'); }

        return {
            source: 'local',
            readiness: readiness,
            headline: target ? 'A staged route from ' + (current || 'where you are') + ' to ' + target + '.' : 'Start by naming the direction, then build the route.',
            phases: phases,
            bridges: chosen,
            risks: risks,
            disclaimer: 'This is a planning aid, not a prediction. It does not promise interviews, offers, or a timeline.'
        };
    }

    window.EmploStartEngines.pivot = { plan: plan };
})();
