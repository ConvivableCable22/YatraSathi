/**
 * YatraSathi — Transactional Email Outbox, Lease-Guarded Queue Consumer & Provider Dispatcher
 *
 * Implements:
 * - Anti-enumeration HTTP 202 password-reset intake with durable D1 outbox
 * - Best-effort edge IP rate limiting before D1 writes
 * - Publisher & consumer lease tokens with atomic D1 state transitions
 * - Atomic 3-statement db.batch() reset-token rotation guarded by lease_token
 * - Cloudflare Email -> Gmail API (gmail.send) fallback with documented error classification
 * - Generation-guarded EMAIL_DLQ consumer (D1 before ack; retry on D1 error)
 * - Owner-scoped booking receipt email status & safe retry
 */

export const GENERIC_RESET_MESSAGE =
  'If an account exists for that email, a password reset email has been processed.';

export const MAX_OUTBOX_ATTEMPTS = 5;
export const PUBLISH_LEASE_MS = 45_000;
export const PRE_DISPATCH_LEASE_MS = 45_000;
export const DISPATCH_LEASE_MS = 60_000;
export const EMAIL_COOLDOWN_MS = 90_000;
export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

const EMAIL_SYNTAX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CF_FALLBACK_CODES = new Set([
  'E_RECIPIENT_PLAN_RESTRICTED',
  'E_RATE_LIMIT_EXCEEDED',
  'E_DAILY_LIMIT_EXCEEDED',
  'E_INTERNAL_SERVER_ERROR',
  'E_EMAIL_SENDING_NOT_READY'
]);

const CF_TRANSIENT_CODES = new Set([
  'E_RATE_LIMIT_EXCEEDED',
  'E_INTERNAL_SERVER_ERROR',
  'E_EMAIL_SENDING_NOT_READY'
]);

const CF_CONFIG_CODES = new Set([
  'E_RECIPIENT_NOT_ALLOWED',
  'E_SENDER_NOT_VERIFIED',
  'E_SENDER_DOMAIN_NOT_AVAILABLE',
  'E_SENDER_DOMAIN_NOT_CONFIGURED'
]);

const CF_NON_RETRYABLE_CODES = new Set([
  'E_VALIDATION_ERROR',
  'E_FIELD_MISSING',
  'E_TOO_MANY_RECIPIENTS',
  'E_TOO_MANY_ATTACHMENTS',
  'E_HEADER_NOT_ALLOWED'
]);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmailSyntax(email) {
  const norm = normalizeEmail(email);
  return norm.length > 0 && norm.length <= 254 && EMAIL_SYNTAX_RE.test(norm);
}

export function maskEmail(email) {
  const norm = normalizeEmail(email);
  const at = norm.indexOf('@');
  if (at <= 0) return '***';
  const local = norm.slice(0, at);
  const domain = norm.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(secret, input) {
  const keyData = new TextEncoder().encode(String(secret || 'dev-hmac-fallback'));
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(input)));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
}

function generateSecureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function logEvent(level, event, fields = {}) {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...fields
  };
  if (level === 'error') console.error(JSON.stringify(payload));
  else if (level === 'warn') console.warn(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
}

function isTimeoutError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  const msg = String(err.message || '').toLowerCase();
  return name === 'AbortError' || name === 'TimeoutError' || msg.includes('timed out') || msg.includes('timeout');
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 1. HTTP Intake: POST /api/auth/forgot-password
 * - Validates syntax only (400 if malformed).
 * - Checks best-effort edge IP rate limiter before any D1 write (still returns 202).
 * - Synchronously inserts an account-agnostic D1 outbox row before returning 202.
 * - Schedules initial queue publish in ctx.waitUntil(); Cron sweeper recovers if canceled.
 */
export async function handleForgotPassword(request, env, ctx, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, code: 'INVALID_EMAIL' });
  }

  const rawEmail = body && body.email;
  if (!isValidEmailSyntax(rawEmail)) {
    return jsonResponse(400, { ok: false, code: 'INVALID_EMAIL' });
  }

  const normalizedEmail = normalizeEmail(rawEmail);
  const clientIp = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipHash = await hmacSha256Hex(env.EMAIL_HMAC_SECRET, `ip:${clientIp}`);

  // Best-effort edge IP rate limiter (approximate, location-based; shared IPs may share limits)
  if (env.RESET_IP_LIMITER && typeof env.RESET_IP_LIMITER.limit === 'function') {
    try {
      const rl = await env.RESET_IP_LIMITER.limit({ key: ipHash });
      if (rl && rl.success === false) {
        logEvent('warn', 'reset_edge_rate_limited', { ipHash });
        return jsonResponse(202, { ok: true, message: GENERIC_RESET_MESSAGE });
      }
    } catch (err) {
      logEvent('warn', 'reset_edge_limiter_error', { code: err && err.message ? err.message : 'unknown' });
    }
  }

  const id = crypto.randomUUID();
  const idempotencyKey = `reset:${crypto.randomUUID()}`;
  const emailHmac = await hmacSha256Hex(env.EMAIL_HMAC_SECRET, `email:${normalizedEmail}`);
  const masked = maskEmail(normalizedEmail);

  // Synchronous D1 outbox write BEFORE returning 202; zero account lookup here.
  await env.DB.prepare(
    `INSERT INTO email_logs (
       id, idempotency_key, template_type, user_id, booking_id,
       masked_recipient, email_hmac, ip_hash, temp_email_ref,
       status, publish_attempts, next_publish_at, attempts, created_at, updated_at
     ) VALUES (?, ?, 'password_reset', NULL, NULL, ?, ?, ?, ?, 'outbox_pending', 0, ?, 0, ?, ?)`
  )
    .bind(id, idempotencyKey, masked, emailHmac, ipHash, normalizedEmail, now, now, now)
    .run();

  const publishPromise = publishOutboxJob(idempotencyKey, env, deps).catch(err => {
    logEvent('warn', 'outbox_initial_publish_failed', {
      idempotencyKey,
      error: err && err.message ? err.message : 'publish_failed'
    });
  });

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(publishPromise);
  } else {
    await publishPromise;
  }

  return jsonResponse(202, { ok: true, message: GENERIC_RESET_MESSAGE });
}

/**
 * 2. Outbox Publisher (used by ctx.waitUntil and Cron Sweeper)
 * - Atomically claims outbox_pending (or expired publishing) with publish_lease_token.
 * - Sends { idempotencyKey, publishLeaseToken } to EMAIL_QUEUE.
 * - Conditionally updates publishing -> queued (0-row update is safe if consumer won race).
 */
export async function publishOutboxJob(idempotencyKey, env, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const publishLeaseToken = crypto.randomUUID();
  const leaseExpiresAt = now + PUBLISH_LEASE_MS;

  const claimRes = await env.DB.prepare(
    `UPDATE email_logs
     SET status = 'publishing',
         publish_attempts = publish_attempts + 1,
         publish_lease_token = ?,
         publish_lease_expires_at = ?,
         updated_at = ?
     WHERE idempotency_key = ?
       AND publish_attempts < ?
       AND (
         status = 'outbox_pending'
         OR (status = 'publishing' AND publish_lease_expires_at <= ?)
       )`
  )
    .bind(publishLeaseToken, leaseExpiresAt, now, idempotencyKey, MAX_OUTBOX_ATTEMPTS, now)
    .run();

  if (!claimRes || !claimRes.meta || claimRes.meta.changes === 0) {
    return { claimed: false };
  }

  await env.EMAIL_QUEUE.send({
    idempotencyKey,
    publishLeaseToken
  });

  const confirmNow = deps.now ? deps.now() : Date.now();
  await env.DB.prepare(
    `UPDATE email_logs
     SET status = 'queued',
         updated_at = ?
     WHERE idempotency_key = ?
       AND status = 'publishing'
       AND publish_lease_token = ?`
  )
    .bind(confirmNow, idempotencyKey, publishLeaseToken)
    .run();

  return { claimed: true, publishLeaseToken };
}

/**
 * 3. Cron Sweeper: Recovers unpublished outbox rows & expired leases.
 */
export async function runOutboxAndLeaseSweeper(env, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();

  // A. Mark expired dispatching_provider rows as ambiguous_timeout (never auto-retry)
  await env.DB.prepare(
    `UPDATE email_logs
     SET status = 'ambiguous_timeout',
         temp_email_ref = NULL,
         error_code = COALESCE(error_code, 'DISPATCH_LEASE_EXPIRED'),
         updated_at = ?
     WHERE status = 'dispatching_provider'
       AND lease_expires_at <= ?`
  )
    .bind(now, now)
    .run();

  // B. Mark outbox rows that exhausted MAX_OUTBOX_ATTEMPTS while publishing/pending
  await env.DB.prepare(
    `UPDATE email_logs
     SET status = 'failed_outbox_exhausted',
         temp_email_ref = NULL,
         error_code = 'OUTBOX_PUBLISH_EXHAUSTED',
         updated_at = ?
     WHERE publish_attempts >= ?
       AND (
         status = 'outbox_pending'
         OR (status = 'publishing' AND publish_lease_expires_at <= ?)
       )`
  )
    .bind(now, MAX_OUTBOX_ATTEMPTS, now)
    .run();

  // C. Re-enqueue expired processing_pre_dispatch rows (known not to have started provider call)
  const stalePreRows = await env.DB.prepare(
    `SELECT idempotency_key, publish_lease_token
     FROM email_logs
     WHERE status = 'processing_pre_dispatch'
       AND lease_expires_at <= ?
     LIMIT 25`
  )
    .bind(now)
    .all();

  for (const row of stalePreRows.results || []) {
    try {
      await env.EMAIL_QUEUE.send({
        idempotencyKey: row.idempotency_key,
        publishLeaseToken: row.publish_lease_token
      });
    } catch (err) {
      logEvent('warn', 'sweeper_requeue_pre_dispatch_failed', {
        idempotencyKey: row.idempotency_key,
        error: err && err.message ? err.message : 'requeue_failed'
      });
    }
  }

  // D. Publish due outbox_pending or expired publishing rows
  const dueRows = await env.DB.prepare(
    `SELECT idempotency_key
     FROM email_logs
     WHERE publish_attempts < ?
       AND next_publish_at <= ?
       AND (
         status = 'outbox_pending'
         OR (status = 'publishing' AND publish_lease_expires_at <= ?)
       )
     LIMIT 25`
  )
    .bind(MAX_OUTBOX_ATTEMPTS, now, now)
    .all();

  let republished = 0;
  for (const row of dueRows.results || []) {
    try {
      const res = await publishOutboxJob(row.idempotency_key, env, deps);
      if (res.claimed) republished++;
    } catch (err) {
      logEvent('warn', 'sweeper_publish_failed', {
        idempotencyKey: row.idempotency_key,
        error: err && err.message ? err.message : 'publish_failed'
      });
    }
  }

  return { republished };
}

/**
 * 4. Queue Consumer (EMAIL_QUEUE)
 */
export async function processEmailQueueBatch(batch, env, deps = {}) {
  for (const msg of batch.messages || []) {
    await processSingleEmailMessage(msg, env, deps);
  }
}

async function processSingleEmailMessage(msg, env, deps) {
  const now = deps.now ? deps.now() : Date.now();
  const body = msg && msg.body ? msg.body : {};
  const idempotencyKey = body.idempotencyKey;
  if (!idempotencyKey) {
    msg.ack();
    return;
  }

  const leaseToken = crypto.randomUUID();
  const preLeaseExpires = now + PRE_DISPATCH_LEASE_MS;

  // Claim atomically—includes 'publishing' to prevent racing with publisher's publishing->queued update
  const claimRes = await env.DB.prepare(
    `UPDATE email_logs
     SET status = 'processing_pre_dispatch',
         lease_token = ?,
         lease_expires_at = ?,
         attempts = attempts + 1,
         updated_at = ?
     WHERE idempotency_key = ?
       AND (
         status IN ('outbox_pending', 'publishing', 'queued', 'failed_retryable')
         OR (status = 'processing_pre_dispatch' AND lease_expires_at <= ?)
       )`
  )
    .bind(leaseToken, preLeaseExpires, now, idempotencyKey, now)
    .run();

  if (!claimRes || !claimRes.meta || claimRes.meta.changes === 0) {
    msg.ack();
    return;
  }

  const job = await env.DB.prepare(
    `SELECT * FROM email_logs WHERE idempotency_key = ?`
  )
    .bind(idempotencyKey)
    .first();

  if (!job) {
    msg.ack();
    return;
  }

  if (job.template_type === 'password_reset') {
    await handlePasswordResetJob(msg, job, leaseToken, env, deps);
  } else if (job.template_type === 'booking_receipt') {
    await handleBookingReceiptJob(msg, job, leaseToken, env, deps);
  } else {
    msg.ack();
  }
}

async function handlePasswordResetJob(msg, job, leaseToken, env, deps) {
  const now = deps.now ? deps.now() : Date.now();
  const email = normalizeEmail(job.temp_email_ref || '');

  // Check normalized-email cooldown & user lookup inside consumer (never before HTTP 202)
  const cooldownScope = `reset_email:${job.email_hmac}`;
  const cooldownRow = await env.DB.prepare(
    `SELECT last_sent_at FROM email_cooldowns WHERE scope_key = ?`
  )
    .bind(cooldownScope)
    .first();

  if (cooldownRow && now - cooldownRow.last_sent_at < EMAIL_COOLDOWN_MS) {
    await env.DB.prepare(
      `UPDATE email_logs
       SET status = 'suppressed_cooldown',
           temp_email_ref = NULL,
           updated_at = ?
       WHERE idempotency_key = ?
         AND status = 'processing_pre_dispatch'
         AND lease_token = ?`
    )
      .bind(now, job.idempotency_key, leaseToken)
      .run();
    msg.ack();
    return;
  }

  const user = await env.DB.prepare(
    `SELECT id, email_normalized, display_name FROM users WHERE email_normalized = ?`
  )
    .bind(email)
    .first();

  if (!user) {
    await env.DB.prepare(
      `UPDATE email_logs
       SET status = 'suppressed_unknown',
           temp_email_ref = NULL,
           updated_at = ?
       WHERE idempotency_key = ?
         AND status = 'processing_pre_dispatch'
         AND lease_token = ?`
    )
      .bind(now, job.idempotency_key, leaseToken)
      .run();
    msg.ack();
    return;
  }

  // Atomic 3-statement db.batch(): lock dispatching_provider + revoke prior tokens + insert new token hash
  const rawToken = generateSecureToken();
  const tokenHash = await sha256Hex(rawToken);
  const resetId = crypto.randomUUID();
  const dispatchLeaseExpires = now + DISPATCH_LEASE_MS;
  const tokenExpiresAt = now + RESET_TOKEN_TTL_MS;

  const batchResults = await env.DB.batch([
    env.DB.prepare(
      `UPDATE email_logs
       SET status = 'dispatching_provider',
           user_id = ?,
           lease_expires_at = ?,
           updated_at = ?
       WHERE idempotency_key = ?
         AND status = 'processing_pre_dispatch'
         AND lease_token = ?`
    ).bind(user.id, dispatchLeaseExpires, now, job.idempotency_key, leaseToken),

    env.DB.prepare(
      `UPDATE password_resets
       SET revoked_at = ?
       WHERE user_id = ?
         AND used_at IS NULL
         AND revoked_at IS NULL
         AND EXISTS (
           SELECT 1 FROM email_logs
           WHERE idempotency_key = ?
             AND status = 'dispatching_provider'
             AND lease_token = ?
         )`
    ).bind(now, user.id, job.idempotency_key, leaseToken),

    env.DB.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, email_log_id, expires_at, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM email_logs
         WHERE idempotency_key = ?
           AND status = 'dispatching_provider'
           AND lease_token = ?
       )`
    ).bind(resetId, user.id, tokenHash, job.id, tokenExpiresAt, now, job.idempotency_key, leaseToken),

    env.DB.prepare(
      `INSERT INTO email_cooldowns (scope_key, last_sent_at, window_count, window_started_at)
       SELECT ?, ?, 1, ?
       WHERE EXISTS (
         SELECT 1 FROM email_logs
         WHERE idempotency_key = ?
           AND status = 'dispatching_provider'
           AND lease_token = ?
       )
       ON CONFLICT(scope_key) DO UPDATE SET
         last_sent_at = excluded.last_sent_at,
         window_count = email_cooldowns.window_count + 1`
    ).bind(cooldownScope, now, now, job.idempotency_key, leaseToken)
  ]);

  if (!batchResults[0] || !batchResults[0].meta || batchResults[0].meta.changes === 0) {
    // Lost lease before rotation/dispatch—abort with 0 provider calls
    msg.ack();
    return;
  }

  const baseUrl = (env.APP_BASE_URL || 'https://yatrasathi.workers.dev').replace(/\/+$/, '');
  const resetUrl = `${baseUrl}/index.html?resetToken=${encodeURIComponent(rawToken)}`;
  const subject = 'YatraSathi — Password Reset Request';
  const textBody = [
    `Hello ${user.display_name || 'Traveler'},`,
    '',
    'We received a request to reset your YatraSathi password.',
    `Open this single-use link within 15 minutes: ${resetUrl}`,
    '',
    'If you did not request this, you can safely ignore this email.'
  ].join('\n');

  await dispatchAndRecordOutcome(msg, job.idempotency_key, leaseToken, email, subject, textBody, env, deps);
}

async function handleBookingReceiptJob(msg, job, leaseToken, env, deps) {
  const now = deps.now ? deps.now() : Date.now();
  const email = normalizeEmail(job.temp_email_ref || '');
  const dispatchLeaseExpires = now + DISPATCH_LEASE_MS;

  const lockRes = await env.DB.prepare(
    `UPDATE email_logs
     SET status = 'dispatching_provider',
         lease_expires_at = ?,
         updated_at = ?
     WHERE idempotency_key = ?
       AND status = 'processing_pre_dispatch'
       AND lease_token = ?`
  )
    .bind(dispatchLeaseExpires, now, job.idempotency_key, leaseToken)
    .run();

  if (!lockRes || !lockRes.meta || lockRes.meta.changes === 0) {
    msg.ack();
    return;
  }

  const booking = await env.DB.prepare(
    `SELECT * FROM bookings WHERE id = ?`
  )
    .bind(job.booking_id)
    .first();

  if (!booking) {
    await recordProviderOutcome(job.idempotency_key, leaseToken, {
      status: 'failed_non_retryable',
      errorCode: 'BOOKING_NOT_FOUND',
      purgeRecipient: true
    }, env, deps);
    msg.ack();
    return;
  }

  const amountInr = Math.round(Number(booking.amount_paise || 0) / 100).toLocaleString('en-IN');
  const subject = `YatraSathi — Simulated Booking Receipt (${booking.receipt_code})`;
  const textBody = [
    'YatraSathi Simulated Booking Confirmation Receipt',
    `Receipt Code: ${booking.receipt_code}`,
    `Service: ${booking.service_title}`,
    `Amount (INR): ₹${amountInr}`,
    `Status: ${booking.status}`,
    '',
    'Note: Demo/simulated booking record — no real financial transaction occurred.'
  ].join('\n');

  await dispatchAndRecordOutcome(msg, job.idempotency_key, leaseToken, email, subject, textBody, env, deps);
}

/**
 * 5. Provider Dispatcher (Cloudflare Email -> Gmail API Fallback)
 */
export async function dispatchWithFallback(recipientEmail, subject, textBody, env, deps = {}) {
  const sendCf = deps.sendCloudflareEmail || defaultSendCloudflareEmail;
  const sendGmail = deps.sendGmailEmail || defaultSendGmailEmail;

  const cfEligible = Boolean(env.EMAIL && typeof env.EMAIL.send === 'function' && env.CF_EMAIL_FROM);
  if (cfEligible) {
    try {
      const cfRes = await sendCf({ from: env.CF_EMAIL_FROM, to: recipientEmail, subject, text: textBody }, env);
      return {
        outcome: 'accepted_by_provider',
        providerUsed: 'cloudflare',
        providerMessageId: cfRes && cfRes.messageId ? String(cfRes.messageId) : null,
        errorCode: null
      };
    } catch (err) {
      if (isTimeoutError(err)) {
        return { outcome: 'ambiguous_timeout', providerUsed: 'cloudflare', providerMessageId: null, errorCode: 'CF_TIMEOUT' };
      }
      const code = String(err && err.code ? err.code : 'E_INTERNAL_SERVER_ERROR');
      if (CF_CONFIG_CODES.has(code)) {
        return { outcome: 'failed_config', providerUsed: 'cloudflare', providerMessageId: null, errorCode: code };
      }
      if (CF_NON_RETRYABLE_CODES.has(code)) {
        return { outcome: 'failed_non_retryable', providerUsed: 'cloudflare', providerMessageId: null, errorCode: code };
      }
      if (!CF_FALLBACK_CODES.has(code)) {
        return { outcome: 'failed_retryable', providerUsed: 'cloudflare', providerMessageId: null, errorCode: code };
      }
      logEvent('info', 'cf_email_fallback_to_gmail', { code });
    }
  }

  // Fallback to owner-controlled Gmail API
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN || !env.GMAIL_SENDER_ADDRESS) {
    return {
      outcome: 'failed_config',
      providerUsed: null,
      providerMessageId: null,
      errorCode: 'GMAIL_NOT_CONFIGURED'
    };
  }

  try {
    const gmRes = await sendGmail({ from: env.GMAIL_SENDER_ADDRESS, to: recipientEmail, subject, text: textBody }, env, deps);
    return {
      outcome: 'accepted_by_provider',
      providerUsed: 'gmail',
      providerMessageId: gmRes && gmRes.id ? String(gmRes.id) : null,
      errorCode: null
    };
  } catch (err) {
    if (isTimeoutError(err)) {
      return { outcome: 'ambiguous_timeout', providerUsed: 'gmail', providerMessageId: null, errorCode: 'GMAIL_TIMEOUT' };
    }
    const status = Number(err && err.status ? err.status : 0);
    const code = String(err && err.code ? err.code : 'GMAIL_ERROR');
    if (code === 'invalid_grant' || status === 401 || status === 403) {
      return { outcome: 'failed_reauth_required', providerUsed: 'gmail', providerMessageId: null, errorCode: code };
    }
    if (code === 'QuotaExceeded' || code === 'rateLimitExceeded' && String(err.message || '').toLowerCase().includes('daily')) {
      return { outcome: 'unavailable_quota_exhausted', providerUsed: 'gmail', providerMessageId: null, errorCode: code };
    }
    if (status === 429 || (status >= 500 && status < 600)) {
      return { outcome: 'failed_retryable', providerUsed: 'gmail', providerMessageId: null, errorCode: code };
    }
    if (status >= 400 && status < 500) {
      return { outcome: 'failed_non_retryable', providerUsed: 'gmail', providerMessageId: null, errorCode: code };
    }
    return { outcome: 'failed_retryable', providerUsed: 'gmail', providerMessageId: null, errorCode: code };
  }
}

async function dispatchAndRecordOutcome(msg, idempotencyKey, leaseToken, email, subject, textBody, env, deps) {
  const result = await dispatchWithFallback(email, subject, textBody, env, deps);
  const isTerminalOrAmbiguous = result.outcome !== 'failed_retryable';

  const updated = await recordProviderOutcome(
    idempotencyKey,
    leaseToken,
    {
      status: result.outcome,
      providerUsed: result.providerUsed,
      providerMessageId: result.providerMessageId,
      errorCode: result.errorCode,
      purgeRecipient: isTerminalOrAmbiguous
    },
    env,
    deps
  );

  if (!updated) {
    // Stale consumer whose lease expired—never retry or overwrite
    msg.ack();
    return;
  }

  logEvent(result.outcome === 'accepted_by_provider' ? 'info' : 'warn', 'email_dispatch_outcome', {
    idempotencyKey,
    status: result.outcome,
    providerUsed: result.providerUsed,
    providerMessageId: result.providerMessageId,
    errorCode: result.errorCode
  });

  if (result.outcome === 'failed_retryable') {
    msg.retry({ delaySeconds: 30 });
  } else {
    msg.ack();
  }
}

async function recordProviderOutcome(idempotencyKey, leaseToken, outcome, env, deps) {
  const now = deps.now ? deps.now() : Date.now();
  const res = await env.DB.prepare(
    `UPDATE email_logs
     SET status = ?,
         provider_used = COALESCE(?, provider_used),
         provider_message_id = COALESCE(?, provider_message_id),
         error_code = ?,
         temp_email_ref = CASE WHEN ? = 1 THEN NULL ELSE temp_email_ref END,
         updated_at = ?
     WHERE idempotency_key = ?
       AND status = 'dispatching_provider'
       AND lease_token = ?`
  )
    .bind(
      outcome.status,
      outcome.providerUsed || null,
      outcome.providerMessageId || null,
      outcome.errorCode || null,
      outcome.purgeRecipient ? 1 : 0,
      now,
      idempotencyKey,
      leaseToken
    )
    .run();

  return Boolean(res && res.meta && res.meta.changes > 0);
}

export async function sendTransactionalEmailDirect({ to, subject, text, html, inlineImages }, env, deps = {}) {
  const cfFrom = env.CF_EMAIL_FROM || '';
  const gmailFrom = env.GMAIL_SENDER_ADDRESS || '';

  if (env.EMAIL && cfFrom) {
    try {
      const res = await (deps.sendCloudflareEmail || defaultSendCloudflareEmail)(
        { from: cfFrom, to, subject, text, html, inlineImages },
        env
      );
      return { ok: true, provider: 'cloudflare', result: res };
    } catch (cfErr) {
      if (!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && gmailFrom)) {
        throw cfErr;
      }
    }
  }

  if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && gmailFrom) {
    const formattedFrom = gmailFrom.includes('<') ? gmailFrom : `YatraSathi <${gmailFrom}>`;
    const res = await (deps.sendGmailEmail || defaultSendGmailEmail)(
      { from: formattedFrom, to, subject, text, html, inlineImages },
      env,
      deps
    );
    return { ok: true, provider: 'gmail', result: res };
  }

  const err = new Error('Email delivery provider is not configured (set CF_EMAIL_FROM + EMAIL binding or Gmail OAuth secrets).');
  err.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
  throw err;
}

async function defaultSendCloudflareEmail(message, env) {
  return env.EMAIL.send({
    from: message.from,
    to: message.to,
    subject: message.subject,
    text: message.text
  });
}

async function defaultSendGmailEmail(message, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const tokenParams = new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID,
    client_secret: env.GMAIL_CLIENT_SECRET,
    refresh_token: env.GMAIL_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });

  const tokenResp = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  });
  const tokenData = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || !tokenData.access_token) {
    const err = new Error(tokenData.error_description || tokenData.error || 'OAuth token refresh failed');
    err.status = tokenResp.status;
    err.code = tokenData.error || `HTTP_${tokenResp.status}`;
    throw err;
  }

  const safeSubject = /[^\x20-\x7E]/.test(String(message.subject || ''))
    ? `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(String(message.subject))))}?=`
    : String(message.subject || '');

  let rawMime;
  const hasInline = Boolean(message.html && Array.isArray(message.inlineImages) && message.inlineImages.length > 0);
  if (hasInline) {
    const relBoundary = `ys_rel_${crypto.randomUUID().replace(/-/g, '')}`;
    const altBoundary = `ys_alt_${crypto.randomUUID().replace(/-/g, '')}`;
    const parts = [
      `From: ${message.from}`,
      `To: ${message.to}`,
      `Subject: ${safeSubject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${relBoundary}"`,
      '',
      `--${relBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.text,
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.html,
      '',
      `--${altBoundary}--`
    ];
    for (const img of message.inlineImages) {
      const wrappedB64 = String(img.base64 || '').replace(/(.{76})/g, '$1\r\n');
      parts.push(
        '',
        `--${relBoundary}`,
        `Content-Type: ${img.contentType || 'image/png'}; name="${img.filename || 'logo.png'}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: inline; filename="${img.filename || 'logo.png'}"`,
        `Content-ID: <${img.cid}>`,
        '',
        wrappedB64
      );
    }
    parts.push('', `--${relBoundary}--`);
    rawMime = parts.join('\r\n');
  } else if (message.html) {
    const boundary = `ys_alt_${crypto.randomUUID().replace(/-/g, '')}`;
    rawMime = [
      `From: ${message.from}`,
      `To: ${message.to}`,
      `Subject: ${safeSubject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.html,
      '',
      `--${boundary}--`
    ].join('\r\n');
  } else {
    rawMime = [
      `From: ${message.from}`,
      `To: ${message.to}`,
      `Subject: ${safeSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      message.text
    ].join('\r\n');
  }

  const sendResp = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: toBase64Url(rawMime) })
  });
  const sendData = await sendResp.json().catch(() => ({}));
  if (!sendResp.ok) {
    const apiErr = (sendData && sendData.error) || {};
    const reason = (apiErr.errors && apiErr.errors[0] && apiErr.errors[0].reason) || apiErr.status || `HTTP_${sendResp.status}`;
    const err = new Error(apiErr.message || 'Gmail API send failed');
    err.status = sendResp.status;
    err.code = reason;
    throw err;
  }

  return sendData;
}

/**
 * 6. Dead-Letter Queue Consumer (EMAIL_DLQ)
 * - Generation-guarded by BOTH idempotency_key AND publish_lease_token.
 * - Never overwrites active leases, dispatching_provider, accepted_by_provider,
 *   ambiguous_timeout, suppressed_*, or other terminal states.
 * - Calls msg.ack() ONLY after D1 succeeds; calls msg.retry() if D1 fails.
 */
export async function processEmailDlqBatch(batch, env, deps = {}) {
  for (const msg of batch.messages || []) {
    const now = deps.now ? deps.now() : Date.now();
    const body = msg && msg.body ? msg.body : {};
    const idempotencyKey = body.idempotencyKey;
    const publishLeaseToken = body.publishLeaseToken;

    if (!idempotencyKey || !publishLeaseToken) {
      msg.ack();
      continue;
    }

    try {
      await env.DB.prepare(
        `UPDATE email_logs
         SET status = 'failed_exhausted',
             temp_email_ref = NULL,
             error_code = COALESCE(error_code, 'QUEUE_RETRIES_EXHAUSTED'),
             updated_at = ?
         WHERE idempotency_key = ?
           AND publish_lease_token = ?
           AND (
             status IN ('failed_retryable', 'outbox_pending', 'queued')
             OR (status = 'publishing' AND publish_lease_expires_at <= ?)
             OR (status = 'processing_pre_dispatch' AND lease_expires_at <= ?)
           )`
      )
        .bind(now, idempotencyKey, publishLeaseToken, now, now)
        .run();

      msg.ack();
    } catch (err) {
      logEvent('error', 'dlq_d1_update_failed', {
        idempotencyKey,
        error: err && err.message ? err.message : 'd1_error'
      });
      if (typeof msg.retry === 'function') {
        msg.retry({ delaySeconds: 60 });
      } else {
        throw err;
      }
    }
  }
}

/**
 * 7. Owner-Scoped Booking Receipt Email Status & Safe Retry
 */
export async function handleGetBookingReceiptStatus(bookingId, sessionUser, env) {
  if (!sessionUser || !sessionUser.id) {
    return jsonResponse(401, { ok: false, code: 'UNAUTHORIZED' });
  }

  const booking = await env.DB.prepare(`SELECT id, user_id, receipt_code FROM bookings WHERE id = ?`)
    .bind(bookingId)
    .first();

  if (!booking) {
    return jsonResponse(404, { ok: false, code: 'NOT_FOUND' });
  }
  if (booking.user_id !== sessionUser.id) {
    return jsonResponse(403, { ok: false, code: 'FORBIDDEN' });
  }

  const latest = await env.DB.prepare(
    `SELECT id, status, provider_used, provider_message_id, error_code, updated_at
     FROM email_logs
     WHERE booking_id = ? AND template_type = 'booking_receipt'
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(bookingId)
    .first();

  return jsonResponse(200, {
    ok: true,
    bookingId,
    receiptCode: booking.receipt_code,
    emailStatus: latest ? latest.status : 'not_requested',
    retryAllowed: Boolean(latest && (latest.status === 'failed_retryable' || latest.status === 'failed_exhausted')),
    freshSendAllowed: Boolean(!latest || latest.status === 'ambiguous_timeout'),
    updatedAt: latest ? latest.updated_at : null
  });
}

export async function handleRetryBookingReceipt(bookingId, sessionUser, requestBody, env, ctx, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  if (!sessionUser || !sessionUser.id) {
    return jsonResponse(401, { ok: false, code: 'UNAUTHORIZED' });
  }

  const booking = await env.DB.prepare(`SELECT id, user_id, receipt_code FROM bookings WHERE id = ?`)
    .bind(bookingId)
    .first();

  if (!booking) {
    return jsonResponse(404, { ok: false, code: 'NOT_FOUND' });
  }
  if (booking.user_id !== sessionUser.id) {
    return jsonResponse(403, { ok: false, code: 'FORBIDDEN' });
  }

  const recipientEmail = sessionUser.email || (requestBody && requestBody.email);
  if (!isValidEmailSyntax(recipientEmail)) {
    return jsonResponse(400, { ok: false, code: 'INVALID_EMAIL' });
  }
  const normalizedEmail = normalizeEmail(recipientEmail);

  const latest = await env.DB.prepare(
    `SELECT id, idempotency_key, status FROM email_logs
     WHERE booking_id = ? AND template_type = 'booking_receipt'
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(bookingId)
    .first();

  if (latest && latest.status === 'accepted_by_provider') {
    return jsonResponse(200, {
      ok: true,
      emailStatus: 'accepted_by_provider',
      message: 'Receipt email was already accepted by the mail provider for sending.'
    });
  }

  if (latest && (latest.status === 'unavailable_quota_exhausted' || latest.status === 'failed_reauth_required' || latest.status === 'failed_config')) {
    return jsonResponse(503, {
      ok: false,
      emailStatus: latest.status,
      retryAllowed: false,
      message: latest.status === 'unavailable_quota_exhausted'
        ? 'Daily free email sending capacity has been reached. Receipt email delivery is unavailable until the 24-hour quota resets.'
        : 'Receipt email delivery is currently unavailable due to a sender configuration or authorization issue.'
    });
  }

  if (latest && latest.status === 'ambiguous_timeout' && !(requestBody && requestBody.confirmFreshSend)) {
    return jsonResponse(409, {
      ok: false,
      emailStatus: 'ambiguous_timeout',
      freshSendAllowed: true,
      message: 'We could not confirm whether the previous receipt email was queued. Check your inbox/spam before confirming a fresh send.'
    });
  }

  const idempotencyKey = `receipt:${bookingId}:${crypto.randomUUID()}`;
  const emailHmac = await hmacSha256Hex(env.EMAIL_HMAC_SECRET, `email:${normalizedEmail}`);
  const masked = maskEmail(normalizedEmail);

  await env.DB.prepare(
    `INSERT INTO email_logs (
       id, idempotency_key, template_type, user_id, booking_id,
       masked_recipient, email_hmac, temp_email_ref,
       status, publish_attempts, next_publish_at, attempts, created_at, updated_at
     ) VALUES (?, ?, 'booking_receipt', ?, ?, ?, ?, ?, 'outbox_pending', 0, ?, 0, ?, ?)`
  )
    .bind(crypto.randomUUID(), idempotencyKey, sessionUser.id, bookingId, masked, emailHmac, normalizedEmail, now, now, now)
    .run();

  const pub = publishOutboxJob(idempotencyKey, env, deps).catch(err => {
    logEvent('warn', 'receipt_outbox_publish_failed', {
      idempotencyKey,
      error: err && err.message ? err.message : 'publish_failed'
    });
  });

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(pub);
  } else {
    await pub;
  }

  return jsonResponse(202, {
    ok: true,
    emailStatus: 'outbox_pending',
    message: 'Receipt email queued for sending.'
  });
}
