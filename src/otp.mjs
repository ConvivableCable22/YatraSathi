/**
 * YatraSathi — Server-Side Email OTP Verification for Google OAuth Sign-In
 *
 * Security invariants:
 * - No usable Better Auth session exists or is returned before OTP verification.
 * - Applies strictly to Google OAuth sign-in (/api/auth/callback/google).
 * - Codes are 6-digit CSPRNG values, stored only as HMAC-SHA256 hashes, 5-min TTL, single-use.
 * - Resending invalidates prior codes and enforces a 60s cooldown.
 * - Max 5 failed verification attempts per challenge.
 * - Never logs OTPs or exposes them in URLs, responses, or browser storage.
 */

import { createAuth } from './auth.mjs';
import { maskEmail, sendTransactionalEmailDirect } from './email/dispatcher.mjs';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const CHALLENGE_COOKIE_NAME = 'ys_otp_challenge';

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extraHeaders)
  });
}

function parseCookieMap(cookieHeader) {
  const map = new Map();
  if (!cookieHeader) return map;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    map.set(k, v);
  }
  return map;
}

function getSetCookiesFromHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const raw = headers.get('Set-Cookie');
  return raw ? [raw] : [];
}

function extractSessionTokenFromCookies(setCookies) {
  for (const header of setCookies) {
    const firstPart = String(header).split(';')[0] || '';
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = firstPart.slice(0, eqIdx).trim();
    if (name === 'better-auth.session_token' || name === '__Secure-better-auth.session_token') {
      const val = decodeURIComponent(firstPart.slice(eqIdx + 1).trim());
      return val.split('.')[0] || null;
    }
  }
  return null;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadInlineLogoAttachment(env) {
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') return null;
  try {
    const resp = await env.ASSETS.fetch(new Request('https://assets.local/assets/brand/yatrasathi-wordmark-dark.png'));
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return {
      cid: 'yatrasathi-logo',
      contentType: 'image/png',
      filename: 'yatrasathi-logo.png',
      base64: btoa(bin)
    };
  } catch {
    return null;
  }
}

function buildOtpEmailContent({ name, otp, isResend = false, hasLogoImage = false }) {
  const safeName = escapeHtml(name || 'Traveler');
  const plainName = String(name || 'Traveler').replace(/[\r\n]/g, ' ');
  const subject = isResend
    ? 'YatraSathi - Your New Sign-In Verification Code'
    : 'YatraSathi - Your Google Sign-In Verification Code';

  const text = [
    `Hello ${plainName},`,
    '',
    'Your YatraSathi sign-in code:',
    otp,
    '',
    'This 6-digit code expires in 5 minutes and can only be used once.',
    isResend ? 'Any previous verification code is no longer valid.' : '',
    '',
    'If you did not try to sign in to YatraSathi, you can safely ignore this email.',
    '',
    'YatraSathi - Raaste naye, saath apna'
  ].filter(Boolean).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F5EFE2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17221F;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5EFE2;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#FBF8EE;border:1.5px solid #D8D2C5;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#0B3B24;padding:18px 24px;border-bottom:4px solid #EA8C00;">
              ${hasLogoImage
                ? '<img src="cid:yatrasathi-logo" alt="YatraSathi - Raaste naye, saath apna" width="220" style="display:block;border:0;height:auto;max-width:100%;">'
                : '<div style="font-size:24px;font-weight:800;letter-spacing:-0.5px;line-height:1.1;"><span style="color:#FBF8EE;">Yatra</span><span style="color:#EA8C00;">Sathi</span></div><div style="font-size:12px;font-style:italic;color:#D8E8DF;margin-top:4px;">Raaste naye, saath apna</div>'}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 20px 24px;background-color:#FBF8EE;">
              <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;font-weight:800;color:#0B3B24;">
                Your YatraSathi sign-in code
              </h1>
              <p style="margin:0 0 18px 0;font-size:15px;line-height:1.55;color:#273833;">
                Hello ${safeName}, use this one-time verification code to finish signing in with Google:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">
                <tr>
                  <td align="center" style="background-color:#FFFFFF;border:2px solid #EA8C00;border-radius:12px;padding:18px 16px;">
                    <span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#0B3B24;display:inline-block;">${otp}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px 0;font-size:14px;line-height:1.5;color:#17221F;font-weight:600;">
                Expires in 5 minutes &bull; Single-use only
              </p>
              ${isResend ? '<p style="margin:0 0 10px 0;font-size:13px;line-height:1.5;color:#06706B;">Any earlier verification code has been invalidated.</p>' : ''}
              <p style="margin:14px 0 0 0;padding-top:14px;border-top:1px solid #E5DFD2;font-size:13px;line-height:1.5;color:#4A5954;">
                Security note: If you did not try to sign in to YatraSathi, you can safely ignore this email. Never share this code with anyone.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background-color:#F2ECE0;font-size:12px;color:#4A5954;text-align:center;">
              YatraSathi &bull; India Trip Planning Workspace
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function generateSixDigitOtp() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

async function computeOtpHash(secret, challengeId, code) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || 'dev-otp-secret')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${challengeId}:${code}`));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
}

async function signBetterAuthCookieValue(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value)));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return encodeURIComponent(`${value}.${b64}`);
}

function timingSafeEqualHex(a, b) {
  const sa = String(a || '').toLowerCase();
  const sb = String(b || '').toLowerCase();
  if (sa.length !== sb.length || sa.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) {
    diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  }
  return diff === 0;
}

function buildChallengeCookie(challengeId, isHttps, maxAgeSec = 300) {
  return `${CHALLENGE_COOKIE_NAME}=${encodeURIComponent(challengeId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${isHttps ? '; Secure' : ''}`;
}

export async function interceptGoogleOAuthCallback(request, env, authHandlerResp) {
  if (!authHandlerResp || authHandlerResp.status < 300 || authHandlerResp.status >= 400) {
    return authHandlerResp;
  }

  const location = authHandlerResp.headers.get('Location') || '';
  if (location.includes('error=')) {
    return authHandlerResp;
  }

  const setCookies = getSetCookiesFromHeaders(authHandlerResp.headers);
  const sessionToken = extractSessionTokenFromCookies(setCookies);
  if (!sessionToken || !env.DB) {
    return authHandlerResp;
  }

  // Immediately read and revoke the temporary Better Auth session before any cookie reaches the browser
  const sessionRow = await env.DB
    .prepare(
      `SELECT s.userId, u.email, u.name, u.emailVerified
       FROM session s
       JOIN user u ON u.id = s.userId
       WHERE s.token = ?`
    )
    .bind(sessionToken)
    .first();

  await env.DB.prepare(`DELETE FROM session WHERE token = ?`).bind(sessionToken).run();

  const url = new URL(request.url);
  const isHttps = url.protocol === 'https:';

  if (!sessionRow || !sessionRow.email || Number(sessionRow.emailVerified) !== 1) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/index.html?error=email_not_verified', 'Cache-Control': 'no-store' }
    });
  }

  const now = Date.now();
  const challengeId = crypto.randomUUID();
  const otp = generateSixDigitOtp();
  const otpHash = await computeOtpHash(env.BETTER_AUTH_SECRET, challengeId, otp);
  const maskedEmail = maskEmail(sessionRow.email);
  const expiresAt = now + OTP_TTL_MS;
  const resendAfter = now + OTP_RESEND_COOLDOWN_MS;

  // Revoke any prior pending challenges for this user
  await env.DB.batch([
    env.DB.prepare(`UPDATE google_otp_challenges SET revoked_at = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL`).bind(now, sessionRow.userId),
    env.DB.prepare(
      `INSERT INTO google_otp_challenges (id, user_id, masked_email, otp_hash, attempts, expires_at, resend_after, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
    ).bind(challengeId, sessionRow.userId, maskedEmail, otpHash, expiresAt, resendAfter, now)
  ]);

  try {
    const logoAttachment = await loadInlineLogoAttachment(env);
    const emailContent = buildOtpEmailContent({ name: sessionRow.name, otp, isResend: false, hasLogoImage: Boolean(logoAttachment) });
    await sendTransactionalEmailDirect(
      {
        to: sessionRow.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
        inlineImages: logoAttachment ? [logoAttachment] : []
      },
      env
    );
  } catch {
    await env.DB.prepare(`UPDATE google_otp_challenges SET revoked_at = ? WHERE id = ?`).bind(Date.now(), challengeId).run();
    return new Response(null, {
      status: 302,
      headers: { Location: '/index.html?error=otp_email_unavailable', 'Cache-Control': 'no-store' }
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/index.html?otp=required',
      'Set-Cookie': buildChallengeCookie(challengeId, isHttps, 300),
      'Cache-Control': 'no-store'
    }
  });
}

export async function handleGoogleOtpRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const isHttps = url.protocol === 'https:';
  const cookies = parseCookieMap(request.headers.get('Cookie') || '');
  const challengeId = decodeURIComponent(cookies.get(CHALLENGE_COOKIE_NAME) || '');
  const now = Date.now();

  if (path === '/api/auth/google-otp/status' && method === 'GET') {
    if (!challengeId) return jsonResponse({ ok: false, pending: false }, 401);
    const row = await env.DB
      .prepare(
        `SELECT masked_email, expires_at, resend_after, attempts
         FROM google_otp_challenges
         WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`
      )
      .bind(challengeId, now)
      .first();
    if (!row) return jsonResponse({ ok: false, pending: false }, 401);
    return jsonResponse({
      ok: true,
      pending: true,
      maskedEmail: row.masked_email,
      expiresAt: Number(row.expires_at),
      resendAfter: Number(row.resend_after),
      attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - Number(row.attempts || 0))
    });
  }

  if (path === '/api/auth/google-otp/resend' && method === 'POST') {
    if (!challengeId) return jsonResponse({ ok: false, code: 'NO_CHALLENGE', message: 'No active Google sign-in challenge.' }, 401);
    const row = await env.DB
      .prepare(
        `SELECT c.id, c.user_id, c.resend_after, u.email, u.name
         FROM google_otp_challenges c
         JOIN user u ON u.id = c.user_id
         WHERE c.id = ? AND c.used_at IS NULL AND c.revoked_at IS NULL`
      )
      .bind(challengeId)
      .first();
    if (!row) return jsonResponse({ ok: false, code: 'INVALID_CHALLENGE', message: 'OTP session expired. Please sign in with Google again.' }, 400);
    if (Number(row.resend_after) > now) {
      const waitSec = Math.ceil((Number(row.resend_after) - now) / 1000);
      return jsonResponse({ ok: false, code: 'RESEND_COOLDOWN', message: `Please wait ${waitSec}s before requesting another code.` }, 429);
    }

    const newChallengeId = crypto.randomUUID();
    const otp = generateSixDigitOtp();
    const otpHash = await computeOtpHash(env.BETTER_AUTH_SECRET, newChallengeId, otp);
    const maskedEmail = maskEmail(row.email);

    await env.DB.batch([
      env.DB.prepare(`UPDATE google_otp_challenges SET revoked_at = ? WHERE id = ?`).bind(now, row.id),
      env.DB.prepare(
        `INSERT INTO google_otp_challenges (id, user_id, masked_email, otp_hash, attempts, expires_at, resend_after, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
      ).bind(newChallengeId, row.user_id, maskedEmail, otpHash, now + OTP_TTL_MS, now + OTP_RESEND_COOLDOWN_MS, now)
    ]);

    try {
      const logoAttachment = await loadInlineLogoAttachment(env);
      const emailContent = buildOtpEmailContent({ name: row.name, otp, isResend: true, hasLogoImage: Boolean(logoAttachment) });
      await sendTransactionalEmailDirect(
        {
          to: row.email,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
          inlineImages: logoAttachment ? [logoAttachment] : []
        },
        env
      );
    } catch {
      await env.DB.prepare(`UPDATE google_otp_challenges SET revoked_at = ? WHERE id = ?`).bind(Date.now(), newChallengeId).run();
      return jsonResponse({
        ok: false,
        code: 'OTP_EMAIL_UNAVAILABLE',
        message: 'OTP email delivery is unavailable because no email sender is configured on the Worker.'
      }, 503);
    }

    return jsonResponse(
      { ok: true, maskedEmail, resendAfter: now + OTP_RESEND_COOLDOWN_MS },
      200,
      { 'Set-Cookie': buildChallengeCookie(newChallengeId, isHttps, 300) }
    );
  }

  if (path === '/api/auth/google-otp/verify' && method === 'POST') {
    if (!challengeId) return jsonResponse({ ok: false, code: 'NO_CHALLENGE', message: 'No active Google sign-in challenge.' }, 401);
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      return jsonResponse({ ok: false, code: 'INVALID_FORMAT', message: 'Enter the 6-digit verification code.' }, 400);
    }

    const row = await env.DB
      .prepare(
        `SELECT id, user_id, otp_hash, attempts, expires_at
         FROM google_otp_challenges
         WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`
      )
      .bind(challengeId)
      .first();

    if (!row || Number(row.expires_at) <= now) {
      return jsonResponse({ ok: false, code: 'OTP_EXPIRED', message: 'Verification code expired. Please sign in with Google again.' }, 400);
    }
    if (Number(row.attempts) >= MAX_OTP_ATTEMPTS) {
      return jsonResponse({ ok: false, code: 'OTP_LOCKED', message: 'Too many failed attempts. Please sign in with Google again.' }, 429);
    }

    const expectedHash = await computeOtpHash(env.BETTER_AUTH_SECRET, row.id, code);
    if (!timingSafeEqualHex(expectedHash, row.otp_hash)) {
      const nextAttempts = Number(row.attempts) + 1;
      await env.DB.prepare(`UPDATE google_otp_challenges SET attempts = ? WHERE id = ?`).bind(nextAttempts, row.id).run();
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - nextAttempts);
      return jsonResponse({
        ok: false,
        code: remaining === 0 ? 'OTP_LOCKED' : 'INVALID_OTP',
        message: remaining === 0
          ? 'Too many failed attempts. Please sign in with Google again.'
          : `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      }, remaining === 0 ? 429 : 400);
    }

    const consumeRes = await env.DB
      .prepare(
        `UPDATE google_otp_challenges
         SET used_at = ?
         WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`
      )
      .bind(now, row.id, now)
      .run();

    if (!consumeRes?.meta?.changes) {
      return jsonResponse({ ok: false, code: 'OTP_ALREADY_USED', message: 'This code is no longer valid.' }, 400);
    }

    // Now—and only now—create the real Better Auth session and signed cookie
    const auth = createAuth(env, url.origin);
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createSession(row.user_id, undefined, undefined, undefined);
    const sessionToken = created?.token || created?.session?.token;
    if (!sessionToken) {
      return jsonResponse({ ok: false, code: 'SESSION_CREATE_FAILED', message: 'Could not create session.' }, 500);
    }

    const cookieMeta = ctx.authCookies?.sessionToken || {
      name: isHttps ? '__Secure-better-auth.session_token' : 'better-auth.session_token',
      attributes: { httpOnly: true, sameSite: 'lax', path: '/', secure: isHttps }
    };
    const signedCookieVal = await signBetterAuthCookieValue(sessionToken, ctx.secret);
    const maxAge = ctx.sessionConfig?.expiresIn || 60 * 60 * 24 * 7;
    const attrs = [
      `${cookieMeta.name}=${signedCookieVal}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${maxAge}`,
      isHttps ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', attrs);
    headers.append('Set-Cookie', buildChallengeCookie('', isHttps, 0));

    return new Response(JSON.stringify({ ok: true, redirectTo: '/app.html' }), { status: 200, headers });
  }

  return jsonResponse({ ok: false, code: 'NOT_FOUND' }, 404);
}
