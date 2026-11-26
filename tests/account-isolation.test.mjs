/**
 * YatraSathi — Cross-Account Data Isolation Security Tests
 * Exercises real `wrangler dev` + local D1 with two independent Better Auth accounts.
 *
 * Run with: node --test tests/account-isolation.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 8789;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${url}/api/health`);
      if (resp.ok) return;
    } catch {
      // Server still starting
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

async function signUpUser(name, email, password) {
  const resp = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ name, email, password })
  });
  const body = await resp.json().catch(() => ({}));
  assert.equal(resp.status, 200, `Signup failed for ${email}: ${JSON.stringify(body)}`);
  const cookie = extractCookieHeader(resp);
  assert.ok(cookie.includes('better-auth.session_token='), 'Expected session cookie on signup');
  return { user: body.user, cookie };
}

async function apiJson(path, { method = 'GET', cookie = '', body } = {}) {
  const headers = { Origin: BASE_URL };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, data };
}

test('Cross-account data isolation: User B cannot read or mutate User A records', async () => {
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

    // 1. Unauthenticated requests must fail closed with 401
    for (const path of ['/api/workspace/bootstrap', '/api/bookings/bk-1/receipt-email']) {
      const res = await apiJson(path);
      assert.equal(res.status, 401, `Expected 401 for unauthenticated ${path}`);
    }
    const unauthTrip = await apiJson('/api/workspace/trips', {
      method: 'POST',
      body: { name: 'Anon Trip', destination: 'Goa' }
    });
    assert.equal(unauthTrip.status, 401);

    // 2. Create two separate accounts
    const ts = Date.now();
    const userA = await signUpUser('User Alpha', `alpha.${ts}@example.com`, 'AlphaPass2026!');
    const userB = await signUpUser('User Beta', `beta.${ts}@example.com`, 'BetaPass2026!');
    assert.notEqual(userA.user.id, userB.user.id);

    // 3. User A creates private records (including spoofed userId/ownerId in payload, which server must ignore)
    const profA = await apiJson('/api/workspace/profile', {
      method: 'PUT',
      cookie: userA.cookie,
      body: { userId: userB.user.id, displayName: 'Alpha Private Name', phone: '+91 90000 00001', pacing: 'slow' }
    });
    assert.equal(profA.status, 200);

    const destA = await apiJson('/api/workspace/saved-destinations/toggle', {
      method: 'POST',
      cookie: userA.cookie,
      body: { userId: userB.user.id, destinationId: 'rajasthan' }
    });
    assert.equal(destA.status, 200);

    // Forged client badgeIds must be ignored by server
    const achA = await apiJson('/api/workspace/achievements/sync', {
      method: 'POST',
      cookie: userA.cookie,
      body: { userId: userB.user.id, badgeIds: ['route-scout', 'expense-tracker'] }
    });
    assert.equal(achA.status, 200);
    assert.deepEqual(achA.data.achievements, []);

    const tripRes = await apiJson('/api/workspace/trips', {
      method: 'POST',
      cookie: userA.cookie,
      body: { userId: userB.user.id, ownerId: userB.user.id, name: 'Alpha Secret Trip', destination: 'Udaipur', budget: 50000 }
    });
    assert.equal(tripRes.status, 201);
    const tripA = tripRes.data.trip.id;

    const itRes = await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/itinerary`, {
      method: 'POST',
      cookie: userA.cookie,
      body: { title: 'Alpha City Palace', estimatedCost: 1200 }
    });
    assert.equal(itRes.status, 201);
    const itemA = itRes.data.item.id;

    const expRes = await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/expenses`, {
      method: 'POST',
      cookie: userA.cookie,
      body: { category: 'food', amountPaise: 45000, note: 'Alpha Thali' }
    });
    assert.equal(expRes.status, 201);
    const expA = expRes.data.expense.id;

    const noteRes = await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/booking-notes`, {
      method: 'POST',
      cookie: userA.cookie,
      body: { category: 'stay', provider: 'Alpha Haveli', reference: 'PNR-ALPHA', amount: 8000 }
    });
    assert.equal(noteRes.status, 201);
    const noteA = noteRes.data.bookingNote.id;

    // 4. User B bootstrap must see ZERO of User A's private data
    const bootB = await apiJson('/api/workspace/bootstrap', { cookie: userB.cookie });
    assert.equal(bootB.status, 200);
    assert.equal(bootB.data.user.id, userB.user.id);
    assert.equal(bootB.data.profile.displayName, 'User Beta');
    assert.deepEqual(bootB.data.trips, []);
    assert.deepEqual(bootB.data.itineraryItems, []);
    assert.deepEqual(bootB.data.expenses, []);
    assert.deepEqual(bootB.data.bookingNotes, []);
    assert.deepEqual(bootB.data.savedDestinations, []);
    assert.deepEqual(bootB.data.achievements, []);

    // 5. User B cross-account IDOR attempts on User A's IDs must all return 403
    const idorChecks = [
      await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}`, {
        method: 'PATCH',
        cookie: userB.cookie,
        body: { name: 'Hacked Trip' }
      }),
      await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/itinerary`, {
        method: 'POST',
        cookie: userB.cookie,
        body: { title: 'Injected Activity' }
      }),
      await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/itinerary/${encodeURIComponent(itemA)}`, {
        method: 'DELETE',
        cookie: userB.cookie
      }),
      await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/expenses`, {
        method: 'POST',
        cookie: userB.cookie,
        body: { category: 'other', amountPaise: 1000, note: 'Injected Expense' }
      }),
      await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/expenses/${encodeURIComponent(expA)}`, {
        method: 'PATCH',
        cookie: userB.cookie,
        body: { category: 'other', amountPaise: 99900, note: 'Tampered Expense' }
      }),
      await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/expenses/${encodeURIComponent(expA)}`, {
        method: 'DELETE',
        cookie: userB.cookie
      }),
      await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/booking-notes`, {
        method: 'POST',
        cookie: userB.cookie,
        body: { category: 'other', provider: 'Injected Note' }
      }),
      await apiJson(`/api/workspace/trips/${encodeURIComponent(tripA)}/booking-notes/${encodeURIComponent(noteA)}`, {
        method: 'DELETE',
        cookie: userB.cookie
      })
    ];

    for (const check of idorChecks) {
      assert.equal(check.status, 403, `Expected 403 FORBIDDEN on cross-account request, got ${check.status}: ${JSON.stringify(check.data)}`);
    }

    // 6. Verify User A's records remain completely intact
    const bootA = await apiJson('/api/workspace/bootstrap', { cookie: userA.cookie });
    assert.equal(bootA.status, 200);
    assert.equal(bootA.data.trips.length, 1);
    assert.equal(bootA.data.trips[0].name, 'Alpha Secret Trip');
    assert.equal(bootA.data.itineraryItems.length, 1);
    assert.equal(bootA.data.expenses.length, 1);
    assert.equal(bootA.data.bookingNotes.length, 1);
    assert.deepEqual(bootA.data.savedDestinations, ['rajasthan']);
    assert.deepEqual(bootA.data.achievements.slice().sort(), ['budget-architect', 'expense-tracker', 'first-blueprint', 'vault-keeper']);

    // 7. Account deletion requires authentication and explicit DELETE confirmation
    const unauthDel = await apiJson('/api/workspace/account', {
      method: 'DELETE',
      body: { confirmText: 'DELETE' }
    });
    assert.equal(unauthDel.status, 401);

    const badConfirmDel = await apiJson('/api/workspace/account', {
      method: 'DELETE',
      cookie: userA.cookie,
      body: { confirmText: 'nope' }
    });
    assert.equal(badConfirmDel.status, 400);

    // Create a private trip for User B to confirm deletion of User A does not affect User B
    const tripBRes = await apiJson('/api/workspace/trips', {
      method: 'POST',
      cookie: userB.cookie,
      body: { name: 'Beta Safe Trip', destination: 'Kochi', budget: 30000 }
    });
    assert.equal(tripBRes.status, 201);

    // 8. User A deletes their own account; active session must be revoked immediately
    const delA = await apiJson('/api/workspace/account', {
      method: 'DELETE',
      cookie: userA.cookie,
      body: { confirmText: 'DELETE' }
    });
    assert.equal(delA.status, 200);
    assert.equal(delA.data.deleted, true);

    const afterDelBootA = await apiJson('/api/workspace/bootstrap', { cookie: userA.cookie });
    assert.equal(afterDelBootA.status, 401, 'Deleted account session must be rejected');

    // User B's account and trip must remain intact
    const afterDelBootB = await apiJson('/api/workspace/bootstrap', { cookie: userB.cookie });
    assert.equal(afterDelBootB.status, 200);
    assert.equal(afterDelBootB.data.trips.length, 1);
    assert.equal(afterDelBootB.data.trips[0].name, 'Beta Safe Trip');
  } finally {
    child.kill();
  }
});
