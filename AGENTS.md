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
- The shell uses the EmploStart lockup (`assets/img/logo-emplostart-*.svg`),
  not the Emplowise logo. Light surfaces get the primary file, dark and navy
  grounds get the reverse file; never recolour, stretch or add effects. The
  mark is a start-flag sibling of the Emplowise layered "E".
- The vault is local by default. Nothing is written until the person confirms a
  preview, a parsed value never overwrites a hand-typed one, and session mode
  must clear the persistent copy immediately.
- Never scrape LinkedIn or claim to. The URL is validated and stored; only the
  pasted text is read.
- Compiled prompts escape `&`, `<` and `>` inside `<candidate_data>` and
  `<target_jd>`, project whitelisted fields only, and stay under 20 KB. No
  `{{placeholder}}` or `[PASTE ...]` token may survive.
- Readiness uses four bands (Foundation, Developing, Competitive,
  Evidence-Backed), never a fabricated 0-100 judgment. Never name one role or
  vendor as the only example.
- The guided app and challenge are local-first: persona, story and challenge
  progress live in the same vault, and every coach or challenge action must
  route to a real view, panel, prompt or tool. No dead links.
- Challenge content never invents pay figures. Pay days ask for local evidence
  and a plain "unknown" when no number exists.

## Engines

Each engine is a pure function on `window`: no DOM, no network, deterministic.
`pivot`, `reimagine` and `market` live on `window.EmploStartEngines`; `ats`,
`interview` and `profile` live on `window.EmplowiseToolkit` and are ports of the
main site's PHP service. Keep the two namespaces stable; `js/app.js` depends on
them.

## Guided app and challenge

- `js/guided-app.js` owns navigation, persona selection, the guided MCQ, the
  story studio and the dashboard. It may only read and write through
  `window.EmploStartVault`; it never touches storage directly.
- `js/story-parser.js` is deterministic and must strip `<` and `>` from derived
  text. The vault sanitises story and coach text again before storage.
- `js/guided-chat.js` answers offline from `data/coach-knowledge.json`. Unknown
  input must fall back rather than guess, and every action target must be
  routable.
- `data/challenge-30.json` is the only source for the 30 days. `js/challenge-30.js`
  renders it and persists completion and notes through `setChallengeDay`.
- The prompt workbench shows a "Recommended for you first" strip and a
  30-second AI guide (`#guide-ai`). Recommendations are deterministic from the
  persona and story, never a paid ranking.
- The "What's built now vs. coming next" dialog is the only place to describe
  roadmap items; it must keep the SDG 4/8/10 wording voluntary and the HR audit
  bridge subtle.

## Verify before shipping

```bash
npm test                 # engine, intake, vault, library, guided-app, challenge
npm run mirrors          # regenerate api/prompts from the JSON
node tools/generate-prompt-mirrors.mjs --check
```

A change is not done until `npm test` passes with no skipped suites, the mirror
check reports 14 files in sync, and the page loads with no console errors in
light and dark, at desktop and mobile widths.
