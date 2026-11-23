# EmploStart

A standalone, permanently free career utility by Emplowise. Six modules, no
account, no cost. Everything runs in your browser by default; AI is optional
and only with explicit consent.

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
npm test           # node --test tests/*.test.mjs
```

Open http://localhost:8080. No build step and no dependencies.

## Structure

```
index.html            shell and the six module panels
css/tokens.css        synced from Emplowise-Docs (canonical brand tokens)
css/app.css           flat Brand Kit 2026 surfaces
js/engines/*.js       deterministic engines (no DOM, no network)
js/ai.js              opt-in AI adapter with consent and fallback
js/app.js             tabs, forms, rendering, prompt library
data/toolkit.json     roles, levels and the 14 ready prompts
api/                  optional AI proxy (Cloudflare Worker)
tests/                node:test engine suite
```

## Brand and honesty rules

- Brand Kit 2026 palette and type only: Navy `#081B3E`, Teal `#0D9488`, Deep
  Teal `#0F766E`, Aqua `#5EEAD4`, Ice `#F0F9F9`, Off-White `#F7F7F7`, Slate,
  White; Montserrat 700/800 + Plus Jakarta Sans 400/500/600.
- Zero neon glows, decorative gradients in body copy, or fake browser chrome.
- Voluntary alignment with SDG 4, 8 and 10 and Emplowise's Fair Jobs & Fair
  Wages pledge. Never claim UN endorsement, certification or partnership.
- Never fabricate salaries, user counts, client logos, placement rates, or TAM.

## Tokens

`css/tokens.css` is mirrored from the `Emplowise-Docs` repository. Update it
there and sync; do not hand-edit the copy here.
