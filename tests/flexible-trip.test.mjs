/**
 * YatraSathi — Flexible State/Destination/Duration Trip Planning Tests
 * Tests state/destination validation, day-by-day itinerary generation, and D1 persistence.
 *
 * Run with: node --test tests/flexible-trip.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateFlexibleItinerary, validateStateAndDestinations } from '../src/destinations.mjs';

const PORT = 8790;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${url}/api/health`);
      if (resp.ok) return;
    } catch {
      // Starting
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`wrangler dev did not become ready within ${timeoutMs}ms`);
}

function extractCookieHeader(resp) {
  const raw = typeof resp.headers.getSetCookie === 'function'
    ? resp.headers.getSetCookie()
    : [resp.headers.get('set-cookie')].filter(Boolean);
  return raw.map(c => c.split(';')[0]).join('; ');
}

test('Unit: validateStateAndDestinations & generateFlexibleItinerary', () => {
  const ok = validateStateAndDestinations('rajasthan', ['jaipur', 'jodhpur']);
  assert.equal(ok.ok, true);

  const mismatch = validateStateAndDestinations('rajasthan', ['jaipur', 'munnar']);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'DESTINATION_STATE_MISMATCH');

  const empty = validateStateAndDestinations('kerala', []);
  assert.equal(empty.ok, false);
  assert.equal(empty.code, 'DESTINATIONS_REQUIRED');

  const plan3 = generateFlexibleItinerary('rajasthan', ['jaipur', 'jodhpur'], 3);
  const days3 = new Set(plan3.map(i => i.dayKey));
  assert.deepEqual([...days3], ['day-1', 'day-2', 'day-3']);
  assert.ok(plan3.some(i => i.location.includes('Jaipur')));
  assert.ok(plan3.some(i => i.location.includes('Jodhpur')));

  const plan5 = generateFlexibleItinerary('rajasthan', ['jaipur', 'jaisalmer'], 5);
  const days5 = new Set(plan5.map(i => i.dayKey));
  assert.deepEqual([...days5], ['day-1', 'day-2', 'day-3', 'day-4', 'day-5']);
  assert.ok(plan5.some(i => i.location.includes('Jaipur')));
  assert.ok(plan5.some(i => i.location.includes('Jaisalmer')));
});

test('Integration: Flexible trip creation & state validation in wrangler dev + D1', async () => {
  const child = spawn(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--ip',
      '127.0.0.1',
      '--port',
      String(PORT),
      '--var',
      'BETTER_AUTH_SECRET:test-only-local-dev-secret-32chars-minimum',
      '--var',
      'EMAIL_HMAC_SECRET:test-only-local-hmac-secret-32chars',
      '--var',
      `APP_BASE_URL:${BASE_URL}`
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  try {
    await waitForServer(BASE_URL);

    const signupResp = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({
        name: 'Flex Planner',
        email: `flex.${Date.now()}@example.com`,
        password: 'FlexPassword2026!'
      })
    });
    assert.equal(signupResp.status, 200);
    const cookie = extractCookieHeader(signupResp);

    // 1. Reject cross-state destination mismatch
    const badResp = await fetch(`${BASE_URL}/api/workspace/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie },
      body: JSON.stringify({
        name: 'Invalid Mix',
        theme: 'rajasthan',
        selectedPlaces: ['jaipur', 'munnar'],
        durationDays: 3,
        generateItinerary: true
      })
    });
    assert.equal(badResp.status, 400);
    const badBody = await badResp.json();
    assert.equal(badBody.code, 'DESTINATION_STATE_MISMATCH');

    // 2. Create Jaipur + Jodhpur for 3 days
    const r3 = await fetch(`${BASE_URL}/api/workspace/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie },
      body: JSON.stringify({
        name: 'Jaipur & Jodhpur 3D',
        theme: 'rajasthan',
        selectedPlaces: ['jaipur', 'jodhpur'],
        durationDays: 3,
        budgetPaise: 4000000,
        generateItinerary: true
      })
    });
    assert.equal(r3.status, 201);
    const d3 = await r3.json();
    assert.equal(d3.trip.destination, 'Jaipur, Jodhpur');
    assert.equal(d3.trip.spentPaise, 0); // Estimated costs remain separate from actual expenses
    assert.ok(d3.itineraryItems.length >= 3);
    assert.deepEqual([...new Set(d3.itineraryItems.map(i => i.dayKey))], ['day-1', 'day-2', 'day-3']);

    // 3. Create Kerala (Munnar + Alleppey) for 4 days
    const rKer = await fetch(`${BASE_URL}/api/workspace/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie },
      body: JSON.stringify({
        name: 'Kerala Hills & Backwaters',
        theme: 'kerala',
        selectedPlaces: ['munnar', 'alleppey'],
        durationDays: 4,
        budgetPaise: 3500000,
        generateItinerary: true
      })
    });
    assert.equal(rKer.status, 201);
    const dKer = await rKer.json();
    assert.equal(dKer.trip.destination, 'Munnar, Alleppey');
    assert.deepEqual([...new Set(dKer.itineraryItems.map(i => i.dayKey))], ['day-1', 'day-2', 'day-3', 'day-4']);
  } finally {
    child.kill();
  }
});
