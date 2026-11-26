/**
 * Focused Cloudflare Workers (workerd) runtime test for Better Auth signup & sign-in.
 * Exercises real `wrangler dev` + local D1 without modifying password hashing.
 *
 * Run with: node --test tests/wrangler-auth-runtime.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 8788;
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

test('Wrangler workerd runtime: Better Auth signup and sign-in against local D1', async () => {
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
    {
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  let logs = '';
  child.stdout.on('data', d => { logs += d.toString(); });
  child.stderr.on('data', d => { logs += d.toString(); });

  try {
    await waitForServer(BASE_URL);

    const uniqueEmail = `runtime.${Date.now()}@example.com`;
    const password = 'StrongWorkerPass2026!';

    // 1. Measure Better Auth Sign-Up inside actual workerd runtime
    const t0 = performance.now();
    const signupResp = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL
      },
      body: JSON.stringify({
        name: 'Runtime Test User',
        email: uniqueEmail,
        password
      })
    });
    const signupWallMs = performance.now() - t0;
    const signupBody = await signupResp.json().catch(() => ({}));
    assert.equal(signupResp.status, 200, `Expected 200 on signup, got ${signupResp.status}: ${JSON.stringify(signupBody)}`);
    assert.ok(signupBody.user && signupBody.user.email === uniqueEmail);

    // 2. Verify invalid credentials return 401 with useful error and no session cookie
    const badSigninResp = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL
      },
      body: JSON.stringify({
        email: uniqueEmail,
        password: 'WrongPassword999!'
      })
    });
    assert.equal(badSigninResp.status, 401, 'Expected 401 for wrong password');
    const badBody = await badSigninResp.json().catch(() => ({}));
    assert.ok(badBody.message || badBody.code, 'Expected useful error message on invalid credentials');
    assert.equal(badSigninResp.headers.get('set-cookie'), null);

    // 3. Measure Better Auth Sign-In inside actual workerd runtime
    const t1 = performance.now();
    const signinResp = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL
      },
      body: JSON.stringify({
        email: uniqueEmail,
        password
      })
    });
    const signinWallMs = performance.now() - t1;
    const signinBody = await signinResp.json().catch(() => ({}));
    assert.equal(signinResp.status, 200, `Expected 200 on signin, got ${signinResp.status}: ${JSON.stringify(signinBody)}`);

    const setCookie = signinResp.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes('better-auth.session_token'), 'Expected Better Auth session cookie on sign-in');
    const cookieHeader = setCookie.split(';')[0];

    // 4. Verify redirect target /app.html serves 200 OK directly (no 307 redirect loop)
    const appResp = await fetch(`${BASE_URL}/app.html`, {
      redirect: 'manual',
      headers: { Cookie: cookieHeader }
    });
    assert.equal(appResp.status, 200, `Expected /app.html to return 200 OK directly, got ${appResp.status}`);
    const appHtml = await appResp.text();
    assert.ok(appHtml.includes('<title>YatraSathi'), 'Expected complete app.html document');

    // 5. Verify session via GET /api/auth/get-session
    const sessionResp = await fetch(`${BASE_URL}/api/auth/get-session`, {
      headers: { Cookie: cookieHeader }
    });
    assert.equal(sessionResp.status, 200);
    const sessionData = await sessionResp.json();
    assert.equal(sessionData.user.email, uniqueEmail);

    // 4. Query Wrangler Local Explorer Observability spans to check if CPU time is reported
    let spansSample = null;
    try {
      const obsResp = await fetch(`${BASE_URL}/cdn-cgi/local/explorer/api/local/observability/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: 'SELECT name, outcome, duration_ms FROM spans WHERE parent_id IS NULL ORDER BY start_time_ms DESC LIMIT 5'
        })
      });
      if (obsResp.ok) spansSample = await obsResp.json();
    } catch {
      // Optional local explorer check
    }

    console.log(JSON.stringify({
      runtime: 'wrangler dev (workerd local)',
      signup_wall_clock_ms: Number(signupWallMs.toFixed(2)),
      signin_wall_clock_ms: Number(signinWallMs.toFixed(2)),
      worker_cpu_time_ms: 'not_exposed_or_enforced_in_local_wrangler_dev',
      local_observability_spans: spansSample,
      note: 'wrangler dev measures wall-clock duration_ms; it does not enforce or report production 10ms Workers Free CPU time.'
    }));
  } catch (err) {
    throw new Error(`${err.message}\n--- wrangler dev logs ---\n${logs}`);
  } finally {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
});
