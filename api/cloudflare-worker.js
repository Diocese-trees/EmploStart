/*
 * EmploStart optional AI proxy (Cloudflare Worker, zero dependencies).
 *
 * Deploy this only if you want the opt-in AI mode. The static site works fully
 * without it: js/ai.js sees no endpoint and every module stays local.
 *
 * Security posture:
 *  - POST only, JSON only, bounded body size.
 *  - Origin allowlist from ALLOWED_ORIGINS.
 *  - Best-effort per-isolate rate limit (use a Durable Object or KV for a
 *    production-grade limit).
 *  - No logging of request bodies. No storage of personal data.
 *  - The prompt forbids invented salaries, counts, clients and outcomes.
 *
 * Environment:
 *   AI_BASE_URL  e.g. https://api.example.com/v1/chat/completions
 *   AI_API_KEY   provider key (secret)
 *   AI_MODEL     e.g. a small instruction model
 *   ALLOWED_ORIGINS comma separated, e.g. https://you.github.io
 */

const MAX_BODY = 16 * 1024;
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 12;
const hits = new Map();

function cors(origin, allowed) {
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function limited(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || { start: now, count: 0 };
  if (now - entry.start > WINDOW_MS) { entry.start = now; entry.count = 0; }
  entry.count += 1;
  hits.set(ip, entry);
  return entry.count > MAX_PER_WINDOW;
}

const SYSTEM = [
  'You are a career planning assistant inside EmploStart.',
  'Be concrete, calm and brief.',
  'Never invent salaries, pay ranges, user counts, client names, placement rates, or market sizes.',
  'When a figure would help, tell the person which public source to check and to record the date.',
  'Never claim UN endorsement, certification or partnership.',
  'Treat every input as personal data: do not repeat it beyond what the answer needs.'
].join(' ');

export default {
  async fetch(request, env) {
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, allowed);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST' || !allowed.includes(origin)) {
      return new Response(JSON.stringify({ ok: false, reason: 'not-allowed' }), { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    if (!env.AI_BASE_URL || !env.AI_API_KEY) {
      return new Response(JSON.stringify({ ok: false, reason: 'not-configured' }), { status: 503, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (limited(ip)) {
      return new Response(JSON.stringify({ ok: false, reason: 'rate-limited' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return new Response(JSON.stringify({ ok: false, reason: 'too-large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    let body;
    try { body = JSON.parse(raw); } catch (e) {
      return new Response(JSON.stringify({ ok: false, reason: 'bad-json' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const message = String(body && body.message || '').slice(0, 4000);
    if (!message) {
      return new Response(JSON.stringify({ ok: false, reason: 'empty' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    try {
      const upstream = await fetch(env.AI_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + env.AI_API_KEY
        },
        body: JSON.stringify({
          model: env.AI_MODEL || 'default',
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: message }
          ],
          max_tokens: 400,
          temperature: 0.3
        })
      });
      if (!upstream.ok) { throw new Error('upstream ' + upstream.status); }
      const data = await upstream.json();
      const reply = data && data.choices && data.choices[0] && data.choices[0].message
        ? String(data.choices[0].message.content || '').trim()
        : '';
      if (!reply) { throw new Error('empty reply'); }
      return new Response(JSON.stringify({ ok: true, reply: reply, source: 'ai' }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, reason: 'upstream-failed' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
  }
};
