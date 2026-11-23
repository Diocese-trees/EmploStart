/* The five audiences EmploStart is built for. One source of truth for labels,
   tone and the one-line tip that the quiz, the story studio, the coach and the
   30-day challenge all reuse. */
(function () {
    'use strict';

    var PERSONAS = [
        {
            key: 'stuck_employee',
            label: 'Stuck or disgruntled employee',
            short: 'Stuck at work',
            tone: 'Direct, fair-wage aware, no hustle talk.',
            tip: 'You already have proof. The job is to name it, price it, and test one move before you resign.',
            firstStep: 'Write the 300-word truth about what is actually wrong.'
        },
        {
            key: 'student',
            label: 'Student or fresh graduate',
            short: 'Student / grad',
            tone: 'Encouraging, concrete, no fake experience.',
            tip: 'You do not need a job title to have proof. Projects, coursework and small fixes count.',
            firstStep: 'List three things you finished, however small.'
        },
        {
            key: 'founder',
            label: 'Startup founder',
            short: 'Founder',
            tone: 'Commercial, evidence-first, allergic to vanity.',
            tip: 'Position the venture around one verifiable customer problem, not a feature list.',
            firstStep: 'Write the customer problem in one sentence a stranger would repeat.'
        },
        {
            key: 'women_career',
            label: 'Woman returning or advancing',
            short: 'Returning / advancing',
            tone: 'Warm, confident, gap-positive and flexible-work aware.',
            tip: 'A career gap is a fact, not a flaw. Frame what you kept doing and what you can do again.',
            firstStep: 'Write what you kept doing during the break, paid or not.'
        },
        {
            key: 'beginner_ai_brand',
            label: 'New to AI, LinkedIn and branding',
            short: 'New to AI',
            tone: 'Plain language, one step at a time, zero jargon.',
            tip: 'AI is a thinking partner, not a ghostwriter. Learn fill, copy, paste, then read and edit.',
            firstStep: 'Open the 30-second AI guide and try one prompt on your own words.'
        }
    ];

    var BY_KEY = {};
    PERSONAS.forEach(function (persona) { BY_KEY[persona.key] = persona; });

    window.EmploStartPersonas = {
        list: PERSONAS,
        keys: PERSONAS.map(function (persona) { return persona.key; }),
        get: function (key) { return BY_KEY[key] || null; },
        label: function (key) { return BY_KEY[key] ? BY_KEY[key].label : ''; }
    };
})();
