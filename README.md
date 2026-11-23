# EmploStart

A standalone, permanently free career utility by Emplowise. Six career tools, a
14-prompt employability library, a 30-day challenge, and one private candidate
vault. No account, no cost. Everything runs in your browser by default; AI is
optional and only with explicit consent.

The app is self-guided rather than form-first: pick a persona, then choose one
of three ways in — drop what you already have, answer a 12-question check, or
write 300 honest words. A local coach answers plain-English questions offline.

## Modules

| # | Module | Engine | Mode |
| --- | --- | --- | --- |
| 01 | Career Pivot Planner | `js/engines/pivot.js` | Non-AI |
| 02 | Career Reimagination Lab | `js/engines/reimagine.js` | Non-AI |
| 03 | Market Assessment & Fair-Wage Readiness | `js/engines/market.js` | Non-AI |
| 04 | ATS Resume Analyzer | `js/engines/ats.js` | Non-AI |
| 05 | Interview Prep | `js/engines/interview.js` | Non-AI |
| 06 | Profile Builder | `js/engines/profile.js` | Non-AI |

All six are deterministic and local. The ATS, interview and profile engines are
byte-for-byte ports of the Emplowise PHP service; the three planning engines are
original and never invent salaries, counts, clients, placement rates or market
size.

## Self-guided paths

| Path | What the person does | What happens |
| --- | --- | --- |
| A · Drop your data | Pastes a CV, LinkedIn text, or four quick bullets | Editable preview, then merge into the vault with parsed-source precedence |
| B · Guided check | Twelve one-at-a-time questions, with plain-English notes | Scores the seven readiness bands and recommends tools, prompts and a challenge day |
| C · 300-word story | Writes up to three short prompts with a live word meter | A deterministic local extractor pulls skills, tools, frictions and direction, then recommends a tool and prompt |

The five personas (stuck or disgruntled employee, student or fresh graduate,
startup founder, woman returning or advancing, new to AI/LinkedIn/branding) only
change tone and recommendations; they never lock features. The local coach reads
`data/coach-knowledge.json`, routes plain words to a topic, and exposes only
routable actions. It works offline and never calls a network.

## Three intake lanes, one vault

No one has to fill six forms by hand. The intake section accepts whichever
starting point a person actually has:

| Lane | Input | What happens |
| --- | --- | --- |
| 1 Diagnostic | 12 questions, 2-3 minutes | Scores seven readiness dimensions into Foundation / Developing / Competitive / Evidence-Backed and recommends three prompts |
| 2 LinkedIn | Profile URL plus pasted text | Validates the URL, reads only the pasted text, then asks the missing questions. Never opens or scrapes LinkedIn |
| 3 CV | `.docx`, `.txt`, `.md`, or repaired PDF paste | Extracts sections, links and quantified lines, shows an editable preview, then asks delta questions |

Everything lands in `emplostart_vault_v2`. Hand-typed values outrank parsed ones
(`manual > cv_parse > linkedin_parse > test`), a parsed value never overwrites
one the person typed, and nothing is written until a preview is confirmed. The
vault has a session-only mode for shared or lab computers that clears the
persistent copy immediately and wipes on tab close.

The six engines read from the vault through `js/engine-bridge.js`: a target
context switcher sits above the module tabs, and writing edits back is a
checkbox that stays off unless the person turns it on.

## The 30-day challenge

`data/challenge-30.json` is the plan: 30 unique days across four weeks — mindset
and evidence, proof and CV/ATS, LinkedIn and AI, then applications, interviews
and fair pay. Each day has a task and a tip for each of the five personas, plus
one deep link into a tool or prompt.

`js/challenge-30.js` renders the 30-day grid, week filters, completion state,
best streak and per-day notes. Completion and notes live in
`challenge_progress` inside `emplostart_vault_v2`. The print button renders the
whole plan without the app chrome. The dashboard card shows completed days and
the next open day.

The challenge never invents salaries or percentiles: pay days ask the person to
collect local evidence and to say plainly when a number is unknown.

## The EMPLOWISE x START library

14 prompts, 14 letters, one per pillar: EMPLOWISE (P01-P09) gets a candidate
shortlisted and into the interview; START (P10-P14) covers interviews, fair
offers, reskilling ROI, and pivots or ventures. Each prompt ships in two
variants: a compact XML reasoning template and a step-by-step standard template.

- `data/prompt-library.json` is the source of truth. `js/prompt-library.js`
  renders the browser, `js/prompt-compiler.js` compiles one prompt from the
  vault.
- `api/prompts/P01.txt` ... `P14.txt` are generated mirrors for API consumers:
  `node tools/generate-prompt-mirrors.mjs` writes them, `--check` fails on drift.
- Only whitelisted vault fields are projected, each with a character cap. User
  values are escaped for `&`, `<`, `>` inside `<candidate_data>` and
  `<target_jd>`, so a pasted CV cannot close the tag and issue instructions.
- Missing values become `[NOT PROVIDED]`, unverifiable market facts become
  `[CANNOT VERIFY]`, and no `{{placeholder}}` or `[PASTE ...]` token survives
  compilation. The compiled payload stays under 20 KB.

## Non-AI default, AI opt-in

- `js/ai.js` reads an optional `emplostart-ai-endpoint` meta tag. With none set,
  the AI toggle is disabled and every module stays local.
- With an endpoint set, AI stays off until the person opens the consent dialog
  and chooses to continue. Consent is stored per browser and can be revoked.
- If a request fails, times out, or consent is missing, the local result stands.
- `api/cloudflare-worker.js` is the zero-dependency proxy, with an origin
  allowlist, a bounded body, a best-effort rate limit, and a prompt that forbids
  fabricated numbers and UN-endorsement claims.

## Run locally

```bash
npm run serve      # python3 -m http.server 8080
npm test           # engine, intake, vault, library, guided-app and challenge suites
npm run mirrors    # regenerate api/prompts/P01-P14 from the JSON
```

Open http://localhost:8080. No build step and no dependencies.

## Structure

```
index.html                 shell, guided paths, challenge, modules, prompt library
css/tokens.css             synced from Emplowise-Docs (canonical brand tokens)
css/fonts.css              self-hosted Montserrat and Plus Jakarta Sans
css/theme.css              Midnight Navy dark-mode token re-pointing
css/app.css                flat Brand Kit 2026 surfaces
js/engines/*.js            deterministic engines (no DOM, no network)
js/personas.js             the five audiences, tone and first-step copy
js/story-parser.js         300-word counter and local signal extractor
js/guided-app.js           persona, three paths, MCQ, dashboard, navigation
js/guided-chat.js          offline local coach over the knowledge JSON
js/challenge-30.js         30-day grid, streak, notes and printable plan
js/theme.js                light/dark toggle and pre-paint theme sync
js/candidate-vault.js      local vault, precedence, bands, import/export
js/docx-extract.js         zero-dependency .docx text extraction
js/intake-engine.js        diagnostic scoring, CV and LinkedIn parsing
js/intake-ui.js            three intake lanes and the vault panel
js/prompt-compiler.js      whitelisted projection, escaping, size caps
js/prompt-library.js       14-pillar browser and prompt workbench
js/engine-bridge.js        vault-to-engine prefill and opt-in write-back
js/ai.js                   opt-in AI adapter with consent and fallback
js/app.js                  tabs, forms, rendering, toolkit prompts
data/prompt-library.json   the 14 prompts, canonical source
data/coach-knowledge.json  plain-English coach topics and safe action routes
data/challenge-30.json     the 30-day plan, persona tips and deep links
assets/fonts, assets/img   self-hosted brand kit fonts and official logos
data/toolkit.json          roles, levels and short utility prompts
api/prompts/*.txt          generated plain-text mirrors of the 14 prompts
api/cloudflare-worker.js   optional AI proxy
tools/                     prompt-mirror generator
tests/                     node:test suites
```

## Brand and honesty rules

- Brand Kit 2026 palette and type only: Navy `#081B3E`, Teal `#0D9488`, Deep
  Teal `#0F766E`, Aqua `#5EEAD4`, Ice `#F0F9F9`, Off-White `#F7F7F7`, Slate,
  White; Montserrat 700/800 + Plus Jakarta Sans 400/500/600, self-hosted from
  `assets/fonts/` with no third-party origin.
- Light and Midnight Navy dark are both first-class. Dark mode re-points the
  shared surface and ink tokens in `css/theme.css`; components never hardcode a
  background. The choice persists under `emplowise:theme` and follows the OS
  when there is no stored choice.
- Zero neon glows, decorative gradients in body copy, or fake browser chrome.
- WCAG AA in both themes at 1440 px and 360 px, 44 px minimum tap targets, no
  horizontal overflow, and `prefers-reduced-motion` respected.
- Voluntary alignment with SDG 4, 8 and 10 and Emplowise's Fair Jobs & Fair
  Wages pledge. Never claim UN endorsement, certification or partnership.
- Never fabricate salaries, user counts, client logos, placement rates, or TAM.

### EmploStart identity

The app carries its own lockup in the Emplowise Brand Kit language: the
Emplowise layered "E" mark — traced to vector from the official raster, since
the brand kit ships no SVG — followed by EMPLOSTART in the Emplowise wordmark
cut (Montserrat ExtraBold, optically condensed and tightly tracked). This is
the one sanctioned recolour of the mark: Deep Teal `#0F766E` on light surfaces
and Aqua `#5EEAD4` on navy, so EmploStart reads as the Emplowise product family
while its own accent carries the sub-brand. The wordmark itself stays
monochrome, Navy on light and White on navy, exactly like Emplowise.

| File | Use |
| --- | --- |
| `assets/img/logo-emplostart-primary.svg` | Light surfaces (`#F7F7F7`, Ice, White) |
| `assets/img/logo-emplostart-reverse.svg` | Navy and Midnight Navy grounds |
| `assets/img/logo-emplostart-mark.svg` / `-reverse.svg` | Mark only, transparent |
| `assets/img/logo-emplostart-*-1200.png`, `*-512.png` | Decks, docs and email |
| `assets/img/favicon.svg`, `favicon.ico`, `favicon.png`, `assets/img/apple-touch-icon.png` | Browser and home-screen icons |

Use the lockup at 120 px or wider (header uses 157 × 32). Do not stretch,
recolour, rotate, add shadows or gradients, or place the primary lockup on a
dark ground; swap to the reverse file instead. The wordmark stays navy/white;
only the E carries the Deep Teal/Aqua accent, and only in these EmploStart
files.

## Tokens

`css/tokens.css` is mirrored from the `Emplowise-Docs` repository. Update it
there and sync; do not hand-edit the copy here.
