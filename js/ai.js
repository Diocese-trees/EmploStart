/*
 * EmploStart: optional AI adapter.
 *
 * Non-AI is the default and always works offline. AI mode is opt-in, and the
 * adapter refuses to send anything until the person gives explicit consent.
 * If no endpoint is configured, or the request fails, or the person has not
 * consented, every caller falls back to the local deterministic engines.
 *
 * Public surface: window.EmploStartAI
 */
(function () {
    'use strict';

    var CONSENT_KEY = 'emplostart_ai_consent_v1';
    var meta = document.querySelector('meta[name="emplostart-ai-endpoint"]');
    var endpoint = (window.EMPLOSTART_AI_ENDPOINT || (meta && meta.content) || '').trim();

    function readConsent() {
        try {
            return window.localStorage.getItem(CONSENT_KEY) === 'granted';
        } catch (e) {
            return false;
        }
    }

    function setConsent(granted) {
        try {
            if (granted) { window.localStorage.setItem(CONSENT_KEY, 'granted'); }
            else { window.localStorage.removeItem(CONSENT_KEY); }
        } catch (e) { /* storage blocked: consent stays off for this page */ }
        return readConsent();
    }

    function available() {
        return Boolean(endpoint);
    }

    function ask(payload) {
        if (!available()) {
            return Promise.resolve({ ok: false, reason: 'no-endpoint' });
        }
        if (!readConsent()) {
            return Promise.resolve({ ok: false, reason: 'no-consent' });
        }
        return fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {})
        }).then(function (response) {
            if (!response.ok) { throw new Error('HTTP ' + response.status); }
            return response.json();
        }).then(function (data) {
            return { ok: true, data: data };
        }).catch(function (error) {
            return { ok: false, reason: 'request-failed', error: String(error && error.message || error) };
        });
    }

    window.EmploStartAI = {
        available: available,
        consentGiven: readConsent,
        setConsent: setConsent,
        ask: ask
    };
})();
