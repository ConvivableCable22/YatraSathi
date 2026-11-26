/**
 * YatraSathi — Private Trip Reviews Security & Upload Validation Tests
 * Exercises real `wrangler dev` + local D1.
 *
 * Run with: node --test tests/trip-reviews.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 8792;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${url}/api/health`);
      if (resp.ok) return;
    } catch {}
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

async function signUp(name, email, password) {
  const resp = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ name, email, password })
  });
  assert.equal(resp.status, 200);
  return extractCookieHeader(resp);
}

test('Private Trip Reviews: ownership, privacy, upload type/size validation, edit & delete', async () => {
  const child = spawn(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', '127.0.0.1', '--port', String(PORT),
      '--var', 'BETTER_AUTH_SECRET:test-only-local-dev-secret-32chars-minimum',
      '--var', 'EMAIL_HMAC_SECRET:test-only-local-hmac-secret-32chars',
      '--var', `APP_BASE_URL:${BASE_URL}`
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  try {
    await waitForServer(BASE_URL);

    // 1. Unauthenticated must return 401
    const unauth = await fetch(`${BASE_URL}/api/workspace/reviews`);
    assert.equal(unauth.status, 401);

    const ts = Date.now();
    const cookieA = await signUp('Reviewer A', `reva.${ts}@example.com`, 'ReviewPass2026!');
    const cookieB = await signUp('Reviewer B', `revb.${ts}@example.com`, 'ReviewPass2026!');

    // 2. Reject video / unsupported MIME type
    const badMime = await fetch(`${BASE_URL}/api/workspace/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieA },
      body: JSON.stringify({
        title: 'Video Attempt',
        rating: 5,
        body: 'Trying to upload a reel',
        photoDataUrl: 'data:video/mp4;base64,AAAA'
      })
    });
    assert.equal(badMime.status, 400);
    assert.equal((await badMime.json()).code, 'INVALID_MEDIA_TYPE');

    // 3. Reject oversized photo (> 250 KB)
    const bigB64 = 'A'.repeat(350 * 1024);
    const bigRes = await fetch(`${BASE_URL}/api/workspace/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieA },
      body: JSON.stringify({
        title: 'Huge Photo',
        rating: 4,
        body: 'Too big for D1',
        photoDataUrl: `data:image/png;base64,${bigB64}`
      })
    });
    assert.equal(bigRes.status, 400);
    assert.equal((await bigRes.json()).code, 'MEDIA_TOO_LARGE');

    // 4. Create valid private review with small PNG
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const createRes = await fetch(`${BASE_URL}/api/workspace/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieA },
      body: JSON.stringify({
        title: 'Amer Fort Morning',
        location: 'Jaipur, Rajasthan',
        rating: 5,
        body: 'Quiet before 9 AM.',
        photoDataUrl: validPng
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.review.visibility, 'private');
    const reviewId = created.review.id;

    // 5. User B cannot see or modify User A's private review
    const listB = await fetch(`${BASE_URL}/api/workspace/reviews`, { headers: { Cookie: cookieB } });
    assert.equal(listB.status, 200);
    assert.deepEqual((await listB.json()).reviews, []);

    const patchB = await fetch(`${BASE_URL}/api/workspace/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieB },
      body: JSON.stringify({ title: 'Tampered' })
    });
    assert.equal(patchB.status, 404);

    const delB = await fetch(`${BASE_URL}/api/workspace/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'DELETE',
      headers: { Origin: BASE_URL, Cookie: cookieB }
    });
    assert.equal(delB.status, 404);

    // 6. Owner A can edit and delete their review
    const patchA = await fetch(`${BASE_URL}/api/workspace/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookieA },
      body: JSON.stringify({ title: 'Amer Fort Updated', rating: 4 })
    });
    assert.equal(patchA.status, 200);
    assert.equal((await patchA.json()).review.title, 'Amer Fort Updated');

    const delA = await fetch(`${BASE_URL}/api/workspace/reviews/${encodeURIComponent(reviewId)}`, {
      method: 'DELETE',
      headers: { Origin: BASE_URL, Cookie: cookieA }
    });
    assert.equal(delA.status, 200);
  } finally {
    child.kill();
  }
});
