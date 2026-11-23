# AGENTS.md — EmploStart

## Role

Standalone, permanently free career utility. One of Emplowise's streamlined
workforce solutions. It is not a student-only hub and not a lead magnet: it is
a real product with its own Pages deployment.

## Non-negotiables

- Non-AI is the default and must keep working offline with zero network calls.
- AI is opt-in only, behind explicit consent, with automatic fallback to the
  local result on any failure. Never send personal data without consent.
- Never claim UN endorsement, certification or partnership. Alignment with SDG
  4, 8 and 10 and the Fair Jobs & Fair Wages pledge is voluntary.
- Never fabricate salaries, pay ranges, user counts, client logos, placement
  rates, or TAM/SAM/SOM.
- B2B pages stay ROI-driven; this product carries the public-good halo with a
  subtle B2B HR Audit bridge on tool outputs.
- Brand Kit 2026 only. Zero neon glows, decorative gradients in body copy, or
  fake browser chrome. No raw `[To Verify]` markers in shipped HTML.

## Engines

Each engine is a pure function on `window`: no DOM, no network, deterministic.
`pivot`, `reimagine` and `market` live on `window.EmploStartEngines`; `ats`,
`interview` and `profile` live on `window.EmplowiseToolkit` and are ports of the
main site's PHP service. Keep the two namespaces stable; `js/app.js` depends on
them.

## Verify before shipping

```bash
npm test     # node:test, seven engine tests
```

A change is not done until the engine tests pass and the page loads with no
console errors in light and dark, at desktop and mobile widths.
