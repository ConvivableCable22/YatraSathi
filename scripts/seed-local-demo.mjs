/**
 * Local-Only Demo Account Seeder for YatraSathi (Better Auth + Local D1)
 *
 * - Never touches remote Cloudflare resources.
 * - Uses Better Auth's real signup/signin endpoints so passwords are hashed with Better Auth's scrypt.
 * - Idempotent: reuses existing demo account if already seeded.
 *
 * Usage:
 *   DEMO_USER_EMAIL="demo.traveler@yatrasathi.local" DEMO_USER_PASSWORD="<password>" npm run seed:local-demo
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8789;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DEMO_NAME = process.env.DEMO_USER_NAME || 'Arnav Sharma (Local Demo)';
const DEMO_EMAIL = (process.env.DEMO_USER_EMAIL || 'demo.traveler@yatrasathi.local').trim().toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || '';

if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 8) {
  console.error('Error: Set DEMO_USER_PASSWORD (at least 8 characters) in your environment before running seed:local-demo.');
  process.exit(1);
}

// Ensure local .dev.vars exists for wrangler dev (git-ignored)
const devVarsPath = path.resolve(process.cwd(), '.dev.vars');
if (!fs.existsSync(devVarsPath)) {
  fs.writeFileSync(
    devVarsPath,
    [
      'BETTER_AUTH_SECRET="local-dev-only-better-auth-secret-32chars"',
      'EMAIL_HMAC_SECRET="local-dev-only-hmac-secret-32chars"',
      'APP_BASE_URL="http://127.0.0.1:8787"'
    ].join('\n') + '\n',
    'utf8'
  );
}

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
  throw new Error(`Local wrangler dev did not start within ${timeoutMs}ms`);
}

async function main() {
  // Ensure local D1 migrations are applied first
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'yatrasathi-db', '--local'], {
    stdio: 'inherit'
  });

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
      `APP_BASE_URL:${BASE_URL}`
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let logs = '';
  child.stdout.on('data', d => { logs += d.toString(); });
  child.stderr.on('data', d => { logs += d.toString(); });

  try {
    await waitForServer(BASE_URL);

    // 1. Try signing up via Better Auth
    let userId = null;
    const signupResp = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ name: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD })
    });

    if (signupResp.ok) {
      const data = await signupResp.json();
      userId = data.user && data.user.id;
      console.log(`[SEED] Created local Better Auth demo account for ${DEMO_EMAIL} (id: ${userId}).`);
    } else {
      // Account may already exist — verify via Better Auth sign-in (idempotent reuse)
      const signinResp = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      });
      if (!signinResp.ok) {
        const errBody = await signinResp.text();
        throw new Error(`Demo account exists or failed signup, and sign-in failed (${signinResp.status}): ${errBody}\n${logs}`);
      }
      const data = await signinResp.json();
      userId = data.user && data.user.id;
      console.log(`[SEED] Reused existing local Better Auth demo account for ${DEMO_EMAIL} (id: ${userId}).`);
    }

    // 2. Seed one idempotent local demo booking row for owner-scoped receipt testing
    if (userId) {
      const sql = `INSERT OR IGNORE INTO bookings (id, user_id, trip_id, service_title, amount_paise, receipt_code, status, created_at) VALUES ('b-demo-1', '${userId.replace(/'/g, "''")}', 'trip-1', 'Jaipur Heritage Haveli Stay (Demo)', 980000, 'SIM-RCPT-DEMO1', 'simulated_confirmed', ${Date.now()});`;
      execFileSync(
        process.execPath,
        ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'yatrasathi-db', '--local', '--command', sql],
        { stdio: 'inherit' }
      );
      console.log('[SEED] Ensured local sample booking b-demo-1 exists for the demo user.');
    }
  } finally {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
