/**
 * YatraSathi — Cloudflare Worker Entrypoint
 * Serves plain HTML/CSS/JS via Workers Static Assets and routes:
 * - /api/auth/forgot-password (anti-enumeration D1 outbox + Queue)
 * - /api/auth/reset-password (single-use SHA-256 token completion via Better Auth password hash)
 * - /api/auth/* (Better Auth: sign-up, sign-in, sign-out, get-session, change-password)
 * - /api/bookings/:id/receipt-email (verified Better Auth session + booking ownership check)
 * - EMAIL_QUEUE / EMAIL_DLQ consumers & Cron outbox/lease sweeper
 */

import { createAuth } from './auth.mjs';
import {
  handleForgotPassword,
  handleGetBookingReceiptStatus,
  handleRetryBookingReceipt,
  processEmailDlqBatch,
  processEmailQueueBatch,
  runOutboxAndLeaseSweeper,
  sha256Hex
} from './email/dispatcher.mjs';
import { handleWorkspaceRequest } from './workspace.mjs';

export async function resolveSessionUser(request, env, deps = {}) {
  const getSessionFn = deps.getSession;
  if (typeof getSessionFn === 'function') {
    const res = await getSessionFn(request, env);
    return res && res.user ? res.user : null;
  }

  const origin = new URL(request.url).origin;
  const auth = createAuth(env, origin);
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  return sessionResult && sessionResult.user ? sessionResult.user : null;
}

export async function handleCompletePasswordReset(request, env, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const body = await request.json().catch(() => ({}));
  const rawToken = String(body.token || '').trim();
  const newPassword = String(body.newPassword || '');

  if (!rawToken || newPassword.length < 8) {
    return new Response(
      JSON.stringify({ ok: false, code: 'INVALID_RESET_PAYLOAD', message: 'Valid reset token and 8+ character password required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const tokenHash = await sha256Hex(rawToken);
  const resetRow = await env.DB.prepare(
    `SELECT id, user_id, expires_at, used_at, revoked_at
     FROM password_resets
     WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first();

  if (!resetRow || resetRow.used_at !== null || resetRow.revoked_at !== null || resetRow.expires_at <= now) {
    return new Response(
      JSON.stringify({ ok: false, code: 'INVALID_OR_EXPIRED_TOKEN', message: 'This password reset link is invalid or has expired.' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  let hashedPassword;
  if (typeof deps.hashPassword === 'function') {
    hashedPassword = await deps.hashPassword(newPassword);
  } else {
    const auth = createAuth(env, new URL(request.url).origin);
    const ctx = await auth.$context;
    hashedPassword = await ctx.password.hash(newPassword);
  }

  // Atomically mark token used, update Better Auth credential password, and revoke active sessions
  const batchRes = await env.DB.batch([
    env.DB.prepare(
      `UPDATE password_resets
       SET used_at = ?
       WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`
    ).bind(now, resetRow.id, now),

    env.DB.prepare(
      `UPDATE account
       SET password = ?, updatedAt = ?
       WHERE userId = ? AND providerId = 'credential'
         AND EXISTS (SELECT 1 FROM password_resets WHERE id = ? AND used_at = ?)`
    ).bind(hashedPassword, now, resetRow.user_id, resetRow.id, now),

    env.DB.prepare(
      `DELETE FROM session
       WHERE userId = ?
         AND EXISTS (SELECT 1 FROM password_resets WHERE id = ? AND used_at = ?)`
    ).bind(resetRow.user_id, resetRow.id, now)
  ]);

  if (!batchRes[0] || !batchRes[0].meta || batchRes[0].meta.changes === 0) {
    return new Response(
      JSON.stringify({ ok: false, code: 'INVALID_OR_EXPIRED_TOKEN', message: 'This password reset link is invalid or has expired.' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, message: 'Password updated. Please sign in with your new password.' }),
    { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
}

const LOCAL_DEV_CORS_ORIGINS = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:5500'
]);

function getLocalDevCorsOrigin(request, env) {
  const baseUrl = String(env.APP_BASE_URL || '');
  const isLocalEnv = baseUrl.startsWith('http://127.0.0.1:') || baseUrl.startsWith('http://localhost:');
  if (!isLocalEnv) return null;
  const origin = request.headers.get('Origin') || '';
  return LOCAL_DEV_CORS_ORIGINS.has(origin) ? origin : null;
}

function withCors(response, corsOrigin) {
  if (!corsOrigin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', corsOrigin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsOrigin = url.pathname.startsWith('/api/') ? getLocalDevCorsOrigin(request, env) : null;

    if (corsOrigin && request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), corsOrigin);
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return withCors(new Response(JSON.stringify({ ok: true, service: 'yatrasathi-worker' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }), corsOrigin);
    }

    if (url.pathname === '/api/auth/forgot-password' && request.method === 'POST') {
      return withCors(await handleForgotPassword(request, env, ctx), corsOrigin);
    }

    if (url.pathname === '/api/auth/reset-password' && request.method === 'POST') {
      return withCors(await handleCompletePasswordReset(request, env), corsOrigin);
    }

    if (url.pathname.startsWith('/api/auth/')) {
      const auth = createAuth(env, url.origin);
      return withCors(await auth.handler(request), corsOrigin);
    }

    if (url.pathname.startsWith('/api/workspace/')) {
      const sessionUser = await resolveSessionUser(request, env);
      return withCors(await handleWorkspaceRequest(request, env, sessionUser), corsOrigin);
    }

    const receiptMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/receipt-email$/);
    if (receiptMatch) {
      const bookingId = decodeURIComponent(receiptMatch[1]);
      const sessionUser = await resolveSessionUser(request, env);

      if (request.method === 'GET') {
        return withCors(await handleGetBookingReceiptStatus(bookingId, sessionUser, env), corsOrigin);
      }
      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        return withCors(await handleRetryBookingReceipt(bookingId, sessionUser, body, env, ctx), corsOrigin);
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return withCors(new Response(JSON.stringify({ ok: false, code: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }), corsOrigin);
    }

    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      const indexUrl = new URL('/index.html', url);
      return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    }

    return env.ASSETS.fetch(request);
  },

  async queue(batch, env) {
    if (batch.queue === 'yatrasathi-email-dlq') {
      await processEmailDlqBatch(batch, env);
      return;
    }
    await processEmailQueueBatch(batch, env);
  },

  async scheduled(_event, env) {
    await runOutboxAndLeaseSweeper(env);
  }
};
