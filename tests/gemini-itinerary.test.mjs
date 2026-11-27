/**
 * YatraSathi — Gemini AI Itinerary Generation Security & Validation Tests
 * Tests non-PII prompt construction, verified place/coordinate matching, quota errors, and ownership.
 *
 * Run with: node --test tests/gemini-itinerary.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateGeminiItinerary, generateGeminiJaipurOptions } from '../src/gemini.mjs';

const PORT = 8795;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${url}/api/health`);
      if (resp.ok) return;
    } catch { }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('wrangler dev timeout');
}

function extractCookieHeader(resp) {
  const raw = typeof resp.headers.getSetCookie === 'function'
    ? resp.headers.getSetCookie()
    : [resp.headers.get('set-cookie')].filter(Boolean);
  return raw.map(c => c.split(';')[0]).join('; ');
}

test('Unit: Missing GEMINI_API_KEY fails closed with 503 GEMINI_NOT_CONFIGURED', async () => {
  await assert.rejects(
    () => generateGeminiItinerary({ stateKey: 'rajasthan', destinationIds: ['jaipur'], durationDays: 2 }, {}),
    err => err.code === 'GEMINI_NOT_CONFIGURED' && err.status === 503
  );
});

test('Unit: Gemini 429 quota error returns 429 GEMINI_QUOTA_EXCEEDED without paid fallback', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      generateGeminiItinerary(
        { stateKey: 'rajasthan', destinationIds: ['jaipur', 'jodhpur'], durationDays: 3 },
        { GEMINI_API_KEY: 'test-key' },
        {
          fetch: async () => {
            calls++;
            return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), { status: 429 });
          }
        }
      ),
    err => err.code === 'GEMINI_QUOTA_EXCEEDED' && err.status === 429
  );
  assert.equal(calls, 1, 'Must not retry/fallback to a paid model');
});

test('Unit: Non-PII prompt & verified coordinates matching (unmatched stops omitted)', async () => {
  let capturedBody = '';
  const res = await generateGeminiItinerary(
    {
      stateKey: 'rajasthan',
      destinationIds: ['jaipur', 'jodhpur'],
      durationDays: 3,
      preferences: { pacing: 'relaxed', budgetPref: 'balanced', interests: ['heritage'] }
    },
    { GEMINI_API_KEY: 'test-key' },
    {
      fetch: async (url, init) => {
        assert.ok(url.includes('gemini-2.5-flash'), 'Must use free-tier Flash model');
        capturedBody = init.body;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        days: [
                          {
                            day: 1,
                            stops: [
                              { placeId: 'raj-jai-2', timeLabel: '10:00 AM', durationLabel: '2 hrs', notes: 'Explore palace' },
                              { placeId: 'hallucinated-stop-99', timeLabel: '02:00 PM', durationLabel: '1 hr', notes: 'Fake place' }
                            ]
                          },
                          {
                            day: 2,
                            stops: [
                              { placeId: 'raj-jod-1', timeLabel: '09:30 AM', durationLabel: '2.5 hrs', notes: 'Fort visit' }
                            ]
                          },
                          { day: 3, stops: [] }
                        ]
                      })
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        );
      }
    }
  );

  assert.ok(!capturedBody.includes('@'), 'Must never send email addresses to Gemini');
  assert.equal(res.durationDays, 3);
  assert.equal(res.unmatchedCount, 1);
  assert.equal(res.items.length, 3);
  assert.equal(res.items[0].placeId, 'raj-jai-2');
  assert.equal(res.items[0].lat, 26.9258);
  assert.equal(res.items[0].lng, 75.8237);
  assert.equal(res.items[1].placeId, 'raj-jod-1');
  assert.equal(res.items[1].lat, 26.2980);
  assert.equal(res.items[2].dayKey, 'day-3');
  assert.equal(res.items[2].lat, null);
});

test('Unit: generateGeminiJaipurOptions returns 2 options restricted to selected Jaipur places & stored coords', async () => {
  const res = await generateGeminiJaipurOptions(
    {
      selectedPlaceIds: ['raj-jai-1', 'raj-jai-2'],
      durationDays: 2,
      preferences: { pacing: 'relaxed', interests: ['heritage', 'architecture'] }
    },
    { GEMINI_API_KEY: 'test-key' },
    {
      fetch: async (url) => {
        assert.ok(url.includes('gemini-2.5-flash'), 'Must use free-tier Flash model');
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        option1: {
                          summary: 'Royal Heritage Flow',
                          days: [
                            { day: 1, stops: [{ placeId: 'raj-jai-1', timeLabel: '09:00 AM', durationLabel: '2.5 hrs', notes: 'Morning fort' }] },
                            { day: 2, stops: [{ placeId: 'raj-jai-2', timeLabel: '10:00 AM', durationLabel: '1.5 hrs', notes: 'Breeze palace' }, { placeId: 'raj-jai-3', timeLabel: '02:00 PM', durationLabel: '2 hrs', notes: 'Unselected place' }] }
                          ]
                        },
                        option2: {
                          summary: 'Breeze First Pace',
                          days: [
                            { day: 1, stops: [{ placeId: 'raj-jai-2', timeLabel: '08:30 AM', durationLabel: '1.5 hrs', notes: 'Early light' }] },
                            { day: 2, stops: [{ placeId: 'raj-jai-1', timeLabel: '09:30 AM', durationLabel: '2.5 hrs', notes: 'Hilltop fort' }] }
                          ]
                        }
                      })
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        );
      }
    }
  );

  assert.equal(res.durationDays, 2);
  assert.equal(res.options.length, 2);
  assert.equal(res.unmatchedCount, 1);
  assert.equal(res.options[0].id, 'option1');
  assert.equal(res.options[1].id, 'option2');
  const opt1PlaceIds = res.options[0].items.filter(i => i.placeId).map(i => i.placeId);
  assert.deepEqual(opt1PlaceIds, ['raj-jai-1', 'raj-jai-2']);
  assert.equal(res.options[0].items[0].lat, 26.9260);
  assert.equal(res.options[0].items[0].lng, 75.7920);
});

test('Integration: AI itinerary endpoint enforces auth, trip ownership, and secret check', async () => {
  const child = spawn(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', '127.0.0.1', '--port', String(PORT),
      '--var', 'BETTER_AUTH_SECRET:test-only-local-dev-secret-32chars-minimum',
      '--var', 'EMAIL_HMAC_SECRET:test-only-local-hmac-secret-32chars',
      '--var', 'GEMINI_API_KEY:',
      '--var', `APP_BASE_URL:${BASE_URL}`
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  try {
    await waitForServer(BASE_URL);

    // 1. Unauthenticated -> 401
    const unauth = await fetch(`${BASE_URL}/api/workspace/trips/trip-1/ai-itinerary`, { method: 'POST', body: '{}' });
    assert.equal(unauth.status, 401);

    const ts = Date.now();
    const sA = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ name: 'AI User A', email: `aia.${ts}@example.com`, password: 'AiPassword2026!' })
    });
    const cookieA = extractCookieHeader(sA);

    const sB = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ name: 'AI User B', email: `aib.${ts}@example.com`, password: 'AiPassword2026!' })
    });
    const cookieB = extractCookieHeader(sB);

    const tripRes = await fetch(`${BASE_URL}/api/workspace/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieA },
      body: JSON.stringify({ name: 'AI Jaipur Trip', theme: 'rajasthan', selectedPlaces: ['jaipur'], durationDays: 3 })
    });
    assert.equal(tripRes.status, 201);
    const tripId = (await tripRes.json()).trip.id;

    // 2. Cross-account user B -> 403 FORBIDDEN
    const cross = await fetch(`${BASE_URL}/api/workspace/trips/${encodeURIComponent(tripId)}/ai-itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieB },
      body: JSON.stringify({ durationDays: 3 })
    });
    assert.equal(cross.status, 403);

    // 3. Non-Jaipur AI request -> 400 AI_DESTINATION_UNSUPPORTED
    const nonJaipur = await fetch(`${BASE_URL}/api/workspace/trips/${encodeURIComponent(tripId)}/ai-itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieA },
      body: JSON.stringify({ stateKey: 'kerala', selectedPlaces: ['munnar'], durationDays: 3 })
    });
    assert.equal(nonJaipur.status, 400);
    assert.equal((await nonJaipur.json()).code, 'AI_DESTINATION_UNSUPPORTED');

    // 4. Owner A without GEMINI_API_KEY configured -> 503 GEMINI_NOT_CONFIGURED
    const noKey = await fetch(`${BASE_URL}/api/workspace/trips/${encodeURIComponent(tripId)}/ai-itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieA },
      body: JSON.stringify({ durationDays: 3 })
    });
    assert.equal(noKey.status, 503);
    assert.equal((await noKey.json()).code, 'GEMINI_NOT_CONFIGURED');

    // 5. PUT /api/workspace/trips/:id/itinerary enforces auth, ownership, and valid Jaipur places
    const putUnauth = await fetch(`${BASE_URL}/api/workspace/trips/${encodeURIComponent(tripId)}/itinerary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ items: [] })
    });
    assert.equal(putUnauth.status, 401);

    const putCross = await fetch(`${BASE_URL}/api/workspace/trips/${encodeURIComponent(tripId)}/itinerary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieB },
      body: JSON.stringify({ items: [{ placeId: 'raj-jai-1', dayKey: 'day-1' }] })
    });
    assert.equal(putCross.status, 403);

    const putInvalid = await fetch(`${BASE_URL}/api/workspace/trips/${encodeURIComponent(tripId)}/itinerary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieA },
      body: JSON.stringify({ items: [{ placeId: 'invalid-place-999', dayKey: 'day-1' }] })
    });
    assert.equal(putInvalid.status, 400);

    const putValid = await fetch(`${BASE_URL}/api/workspace/trips/${encodeURIComponent(tripId)}/itinerary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieA },
      body: JSON.stringify({
        items: [
          { placeId: 'raj-jai-1', dayKey: 'day-1', timeLabel: '09:00 AM', durationLabel: '2 hrs', notes: 'Start at fort' },
          { placeId: 'raj-jai-2', dayKey: 'day-1', timeLabel: '12:00 PM', durationLabel: '1.5 hrs', notes: 'City view' }
        ]
      })
    });
    assert.equal(putValid.status, 200);
    const putData = await putValid.json();
    assert.equal(putData.ok, true);
    assert.equal(putData.itineraryItems.length, 2);
    assert.equal(putData.itineraryItems[0].lat, 26.9260);
    assert.equal(putData.itineraryItems[1].lat, 26.9258);
  } finally {
    child.kill();
  }
});
