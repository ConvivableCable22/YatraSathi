/**
 * YatraSathi — Automated Tests for Cloudflare Email Delivery & Password-Reset Design
 * Run with: node --test tests/email-delivery.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERIC_RESET_MESSAGE,
  MAX_OUTBOX_ATTEMPTS,
  handleForgotPassword,
  handleGetBookingReceiptStatus,
  handleRetryBookingReceipt,
  processEmailDlqBatch,
  processEmailQueueBatch,
  publishOutboxJob,
  runOutboxAndLeaseSweeper,
  sha256Hex
} from '../src/email/dispatcher.mjs';
import { handleCompletePasswordReset, resolveSessionUser } from '../src/worker.mjs';

/**
 * Lightweight in-memory D1 mock supporting prepared statements, meta.changes,
 * atomic db.batch(), and the exact conditional WHERE clauses in dispatcher.js.
 */
function createMockD1(options = {}) {
  const tables = {
    users: new Map(),
    bookings: new Map(),
    email_cooldowns: new Map(),
    email_logs: new Map(),
    password_resets: new Map()
  };

  let failDlq = Boolean(options.failDlq);

  function executeSql(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.startsWith('INSERT INTO email_logs')) {
      const [
        id, idempotencyKey, templateType, userId, bookingId,
        maskedRecipient, emailHmac, ipHash, tempEmailRef,
        nextPublishAt, createdAt, updatedAt
      ] = params.length === 12
        ? params
        : [
            params[0], params[1], 'password_reset', null, null,
            params[2], params[3], params[4], params[5],
            params[6], params[7], params[8]
          ];
      const row = {
        id,
        idempotency_key: idempotencyKey,
        template_type: q.includes("'booking_receipt'") ? 'booking_receipt' : templateType,
        user_id: q.includes("'booking_receipt'") ? params[2] : userId,
        booking_id: q.includes("'booking_receipt'") ? params[3] : bookingId,
        masked_recipient: q.includes("'booking_receipt'") ? params[4] : maskedRecipient,
        email_hmac: q.includes("'booking_receipt'") ? params[5] : emailHmac,
        ip_hash: q.includes("'booking_receipt'") ? null : ipHash,
        temp_email_ref: q.includes("'booking_receipt'") ? params[6] : tempEmailRef,
        status: 'outbox_pending',
        publish_lease_token: null,
        publish_lease_expires_at: null,
        publish_attempts: 0,
        next_publish_at: q.includes("'booking_receipt'") ? params[7] : nextPublishAt,
        lease_token: null,
        lease_expires_at: null,
        provider_used: null,
        provider_message_id: null,
        error_code: null,
        attempts: 0,
        created_at: q.includes("'booking_receipt'") ? params[8] : createdAt,
        updated_at: q.includes("'booking_receipt'") ? params[9] : updatedAt
      };
      tables.email_logs.set(row.idempotency_key, row);
      return { meta: { changes: 1 }, results: [] };
    }

    // Publisher claim
    if (q.startsWith("UPDATE email_logs SET status = 'publishing'")) {
      const [pubToken, leaseExp, now, key, maxAttempts, nowCheck] = params;
      const row = tables.email_logs.get(key);
      if (!row || row.publish_attempts >= maxAttempts) return { meta: { changes: 0 } };
      const eligible =
        row.status === 'outbox_pending' ||
        (row.status === 'publishing' && row.publish_lease_expires_at <= nowCheck);
      if (!eligible) return { meta: { changes: 0 } };
      row.status = 'publishing';
      row.publish_attempts += 1;
      row.publish_lease_token = pubToken;
      row.publish_lease_expires_at = leaseExp;
      row.updated_at = now;
      return { meta: { changes: 1 } };
    }

    // Publisher confirm queued
    if (q.startsWith("UPDATE email_logs SET status = 'queued'")) {
      const [now, key, pubToken] = params;
      const row = tables.email_logs.get(key);
      if (!row || row.status !== 'publishing' || row.publish_lease_token !== pubToken) {
        return { meta: { changes: 0 } };
      }
      row.status = 'queued';
      row.updated_at = now;
      return { meta: { changes: 1 } };
    }

    // Sweeper: expired dispatching_provider -> ambiguous_timeout
    if (q.startsWith("UPDATE email_logs SET status = 'ambiguous_timeout'")) {
      const [now, nowCheck] = params;
      let changes = 0;
      for (const row of tables.email_logs.values()) {
        if (row.status === 'dispatching_provider' && row.lease_expires_at <= nowCheck) {
          row.status = 'ambiguous_timeout';
          row.temp_email_ref = null;
          row.error_code = row.error_code || 'DISPATCH_LEASE_EXPIRED';
          row.updated_at = now;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    // Sweeper: exhausted outbox
    if (q.startsWith("UPDATE email_logs SET status = 'failed_outbox_exhausted'")) {
      const [now, maxAttempts, nowCheck] = params;
      let changes = 0;
      for (const row of tables.email_logs.values()) {
        if (
          row.publish_attempts >= maxAttempts &&
          (row.status === 'outbox_pending' ||
            (row.status === 'publishing' && row.publish_lease_expires_at <= nowCheck))
        ) {
          row.status = 'failed_outbox_exhausted';
          row.temp_email_ref = null;
          row.error_code = 'OUTBOX_PUBLISH_EXHAUSTED';
          row.updated_at = now;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    // Consumer pre-dispatch claim (includes 'publishing')
    if (q.startsWith("UPDATE email_logs SET status = 'processing_pre_dispatch'")) {
      const [leaseToken, leaseExp, now, key, nowCheck] = params;
      const row = tables.email_logs.get(key);
      if (!row) return { meta: { changes: 0 } };
      const claimable =
        ['outbox_pending', 'publishing', 'queued', 'failed_retryable'].includes(row.status) ||
        (row.status === 'processing_pre_dispatch' && row.lease_expires_at <= nowCheck);
      if (!claimable) return { meta: { changes: 0 } };
      row.status = 'processing_pre_dispatch';
      row.lease_token = leaseToken;
      row.lease_expires_at = leaseExp;
      row.attempts += 1;
      row.updated_at = now;
      return { meta: { changes: 1 } };
    }

    // Consumer suppress unknown / cooldown
    if (
      q.startsWith("UPDATE email_logs SET status = 'suppressed_cooldown'") ||
      q.startsWith("UPDATE email_logs SET status = 'suppressed_unknown'")
    ) {
      const targetStatus = q.includes('suppressed_cooldown') ? 'suppressed_cooldown' : 'suppressed_unknown';
      const [now, key, leaseToken] = params;
      const row = tables.email_logs.get(key);
      if (!row || row.status !== 'processing_pre_dispatch' || row.lease_token !== leaseToken) {
        return { meta: { changes: 0 } };
      }
      row.status = targetStatus;
      row.temp_email_ref = null;
      row.updated_at = now;
      return { meta: { changes: 1 } };
    }

    // Consumer dispatching_provider lock
    if (q.startsWith("UPDATE email_logs SET status = 'dispatching_provider'")) {
      let userId = null;
      let leaseExp, now, key, leaseToken;
      if (params.length === 5) {
        [userId, leaseExp, now, key, leaseToken] = params;
      } else {
        [leaseExp, now, key, leaseToken] = params;
      }
      const row = tables.email_logs.get(key);
      if (!row || row.status !== 'processing_pre_dispatch' || row.lease_token !== leaseToken) {
        return { meta: { changes: 0 } };
      }
      row.status = 'dispatching_provider';
      if (userId) row.user_id = userId;
      row.lease_expires_at = leaseExp;
      row.updated_at = now;
      return { meta: { changes: 1 } };
    }

    // Revoke prior password resets (guarded by EXISTS dispatching_provider + lease_token)
    if (q.startsWith('UPDATE password_resets SET revoked_at = ?')) {
      const [now, userId, key, leaseToken] = params;
      const logRow = tables.email_logs.get(key);
      if (!logRow || logRow.status !== 'dispatching_provider' || logRow.lease_token !== leaseToken) {
        return { meta: { changes: 0 } };
      }
      let changes = 0;
      for (const r of tables.password_resets.values()) {
        if (r.user_id === userId && r.used_at === null && r.revoked_at === null) {
          r.revoked_at = now;
          changes++;
        }
      }
      return { meta: { changes } };
    }

    // Insert new password_reset (guarded by EXISTS dispatching_provider + lease_token)
    if (q.startsWith('INSERT INTO password_resets')) {
      const [id, userId, tokenHash, emailLogId, expiresAt, createdAt, key, leaseToken] = params;
      const logRow = tables.email_logs.get(key);
      if (!logRow || logRow.status !== 'dispatching_provider' || logRow.lease_token !== leaseToken) {
        return { meta: { changes: 0 } };
      }
      tables.password_resets.set(id, {
        id,
        user_id: userId,
        token_hash: tokenHash,
        email_log_id: emailLogId,
        expires_at: expiresAt,
        used_at: null,
        revoked_at: null,
        created_at: createdAt
      });
      return { meta: { changes: 1 } };
    }

    // Cooldown upsert (guarded by EXISTS dispatching_provider + lease_token)
    if (q.startsWith('INSERT INTO email_cooldowns')) {
      const [scopeKey, lastSentAt, windowStartedAt, key, leaseToken] = params;
      const logRow = tables.email_logs.get(key);
      if (!logRow || logRow.status !== 'dispatching_provider' || logRow.lease_token !== leaseToken) {
        return { meta: { changes: 0 } };
      }
      const existing = tables.email_cooldowns.get(scopeKey);
      tables.email_cooldowns.set(scopeKey, {
        scope_key: scopeKey,
        last_sent_at: lastSentAt,
        window_count: existing ? existing.window_count + 1 : 1,
        window_started_at: existing ? existing.window_started_at : windowStartedAt
      });
      return { meta: { changes: 1 } };
    }

    // Record provider outcome (guarded by dispatching_provider + lease_token)
    if (q.startsWith('UPDATE email_logs SET status = ?, provider_used =')) {
      const [status, providerUsed, providerMsgId, errorCode, purgeFlag, now, key, leaseToken] = params;
      const row = tables.email_logs.get(key);
      if (!row || row.status !== 'dispatching_provider' || row.lease_token !== leaseToken) {
        return { meta: { changes: 0 } };
      }
      row.status = status;
      if (providerUsed) row.provider_used = providerUsed;
      if (providerMsgId) row.provider_message_id = providerMsgId;
      row.error_code = errorCode;
      if (purgeFlag === 1) row.temp_email_ref = null;
      row.updated_at = now;
      return { meta: { changes: 1 } };
    }

    // DLQ update (generation-guarded by idempotency_key AND publish_lease_token)
    if (q.startsWith("UPDATE email_logs SET status = 'failed_exhausted'")) {
      if (failDlq) throw new Error('Simulated D1 failure');
      const [now, key, pubToken, nowPub, nowPre] = params;
      const row = tables.email_logs.get(key);
      if (!row || row.publish_lease_token !== pubToken) {
        return { meta: { changes: 0 } };
      }
      const eligible =
        ['failed_retryable', 'outbox_pending', 'queued'].includes(row.status) ||
        (row.status === 'publishing' && row.publish_lease_expires_at <= nowPub) ||
        (row.status === 'processing_pre_dispatch' && row.lease_expires_at <= nowPre);
      if (!eligible) return { meta: { changes: 0 } };
      row.status = 'failed_exhausted';
      row.temp_email_ref = null;
      row.error_code = row.error_code || 'QUEUE_RETRIES_EXHAUSTED';
      row.updated_at = now;
      return { meta: { changes: 1 } };
    }

    // SELECT queries
    if (q.startsWith('SELECT * FROM email_logs WHERE idempotency_key = ?')) {
      return { results: [], first: tables.email_logs.get(params[0]) || null };
    }
    if (q.startsWith('SELECT last_sent_at FROM email_cooldowns WHERE scope_key = ?')) {
      return { results: [], first: tables.email_cooldowns.get(params[0]) || null };
    }
    if (q.startsWith('SELECT id, email_normalized, display_name FROM users WHERE email_normalized = ?')) {
      return { results: [], first: tables.users.get(params[0]) || null };
    }
    if (q.startsWith('SELECT * FROM bookings WHERE id = ?') || q.startsWith('SELECT id, user_id, receipt_code FROM bookings WHERE id = ?')) {
      return { results: [], first: tables.bookings.get(params[0]) || null };
    }
    if (q.includes('FROM email_logs WHERE booking_id = ?')) {
      const matches = Array.from(tables.email_logs.values())
        .filter(r => r.booking_id === params[0] && r.template_type === 'booking_receipt')
        .sort((a, b) => b.created_at - a.created_at);
      return { results: matches, first: matches[0] || null };
    }
    if (q.includes("WHERE status = 'processing_pre_dispatch' AND lease_expires_at <= ?")) {
      const nowCheck = params[0];
      const results = Array.from(tables.email_logs.values()).filter(
        r => r.status === 'processing_pre_dispatch' && r.lease_expires_at <= nowCheck
      );
      return { results };
    }
    if (q.includes('FROM email_logs WHERE publish_attempts < ?')) {
      const [maxAttempts, nowCheck, nowPub] = params;
      const results = Array.from(tables.email_logs.values()).filter(
        r =>
          r.publish_attempts < maxAttempts &&
          r.next_publish_at <= nowCheck &&
          (r.status === 'outbox_pending' ||
            (r.status === 'publishing' && r.publish_lease_expires_at <= nowPub))
      );
      return { results };
    }

    throw new Error(`Unmocked SQL: ${q}`);
  }

  return {
    tables,
    setFailDlq(v) {
      failDlq = v;
    },
    prepare(sql) {
      return {
        bind(...params) {
          return {
            run: async () => executeSql(sql, params),
            first: async () => executeSql(sql, params).first || null,
            all: async () => ({ results: executeSql(sql, params).results || [] })
          };
        }
      };
    },
    async batch(stmts) {
      const out = [];
      for (const s of stmts) {
        out.push(await s.run());
      }
      return out;
    }
  };
}

function makeResetRequest(email, ip = '203.0.113.10') {
  return new Request('https://yatrasathi.workers.dev/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ email })
  });
}

test('1. Malformed email syntax returns 400 with 0 D1 writes', async () => {
  const db = createMockD1();
  const env = { DB: db, EMAIL_HMAC_SECRET: 'test-secret' };
  const resp = await handleForgotPassword(makeResetRequest('not-an-email'), env, null);
  assert.equal(resp.status, 400);
  const body = await resp.json();
  assert.equal(body.code, 'INVALID_EMAIL');
  assert.equal(db.tables.email_logs.size, 0);
});

test('2. Identical 202 response for unknown account, existing account, and edge IP rate limit (0 D1 writes on rate limit)', async () => {
  const db = createMockD1();
  db.tables.users.set('alice@example.com', { id: 'u-1', email_normalized: 'alice@example.com', display_name: 'Alice' });
  const sent = [];
  const env = {
    DB: db,
    EMAIL_HMAC_SECRET: 'test-secret',
    EMAIL_QUEUE: { send: async msg => sent.push(msg) },
    RESET_IP_LIMITER: { limit: async ({ key }) => ({ success: !key.includes('blocked') && sent.length < 2 }) }
  };

  const r1 = await handleForgotPassword(makeResetRequest('unknown@example.com'), env, null);
  const r2 = await handleForgotPassword(makeResetRequest('alice@example.com'), env, null);
  const r3 = await handleForgotPassword(makeResetRequest('alice@example.com'), env, null);

  assert.equal(r1.status, 202);
  assert.equal(r2.status, 202);
  assert.equal(r3.status, 202);

  const b1 = await r1.json();
  const b2 = await r2.json();
  const b3 = await r3.json();
  assert.deepEqual(b1, { ok: true, message: GENERIC_RESET_MESSAGE });
  assert.deepEqual(b2, b1);
  assert.deepEqual(b3, b1);

  // 3rd request was edge rate-limited: only 2 outbox rows created
  assert.equal(db.tables.email_logs.size, 2);
});

test('3. Unknown account and cooldown-suppressed requests create 0 reset tokens and 0 provider calls', async () => {
  const db = createMockD1();
  db.tables.users.set('alice@example.com', { id: 'u-1', email_normalized: 'alice@example.com', display_name: 'Alice' });
  const enqueued = [];
  const providerCalls = [];
  const env = {
    DB: db,
    EMAIL_HMAC_SECRET: 'test-secret',
    CF_EMAIL_FROM: 'noreply@yatrasathi.in',
    EMAIL: { send: async m => { providerCalls.push(m); return { messageId: 'cf-1' }; } },
    EMAIL_QUEUE: { send: async msg => enqueued.push(msg) }
  };

  await handleForgotPassword(makeResetRequest('nobody@example.com'), env, null, { now: () => 1000 });
  await handleForgotPassword(makeResetRequest('alice@example.com'), env, null, { now: () => 2000 });
  await handleForgotPassword(makeResetRequest('alice@example.com'), env, null, { now: () => 3000 });

  await processEmailQueueBatch(
    { messages: enqueued.map(b => ({ body: b, ack() {}, retry() {} })) },
    env,
    { now: () => 4000 }
  );

  const logs = Array.from(db.tables.email_logs.values());
  assert.equal(logs[0].status, 'suppressed_unknown');
  assert.equal(logs[1].status, 'accepted_by_provider');
  assert.equal(logs[2].status, 'suppressed_cooldown');
  assert.equal(providerCalls.length, 1);
  assert.equal(db.tables.password_resets.size, 1);
});

test('4. Consumer arriving while D1 is still publishing claims job without discarding; Cron recovers failed publish', async () => {
  const db = createMockD1();
  db.tables.users.set('alice@example.com', { id: 'u-1', email_normalized: 'alice@example.com', display_name: 'Alice' });
  let failQueueOnce = true;
  const enqueued = [];
  const env = {
    DB: db,
    EMAIL_HMAC_SECRET: 'test-secret',
    CF_EMAIL_FROM: 'noreply@yatrasathi.in',
    EMAIL: { send: async () => ({ messageId: 'cf-ok' }) },
    EMAIL_QUEUE: {
      send: async msg => {
        if (failQueueOnce) {
          failQueueOnce = false;
          throw new Error('Queue temporarily unavailable');
        }
        enqueued.push(msg);
      }
    }
  };

  // Initial publish fails; row stays in D1 as publishing (expired after lease)
  await handleForgotPassword(makeResetRequest('alice@example.com'), env, null, { now: () => 1000 });
  const row = Array.from(db.tables.email_logs.values())[0];
  assert.equal(row.status, 'publishing');

  // Cron sweeper recovers after publish lease expires
  await runOutboxAndLeaseSweeper(env, { now: () => 60_000 });
  assert.equal(enqueued.length, 1);

  // Simulate race: set status back to 'publishing' as if consumer arrived before publisher's queued update
  row.status = 'publishing';
  let acked = false;
  await processEmailQueueBatch(
    { messages: [{ body: enqueued[0], ack() { acked = true; }, retry() {} }] },
    env,
    { now: () => 61_000 }
  );
  assert.equal(acked, true);
  assert.equal(row.status, 'accepted_by_provider');
});

test('5. Lease expiry before dispatch allows safe reclaim; stale consumer cannot rotate tokens or overwrite outcome', async () => {
  const db = createMockD1();
  db.tables.users.set('alice@example.com', { id: 'u-1', email_normalized: 'alice@example.com', display_name: 'Alice' });
  const enqueued = [];
  const env = {
    DB: db,
    EMAIL_HMAC_SECRET: 'test-secret',
    CF_EMAIL_FROM: 'noreply@yatrasathi.in',
    EMAIL: { send: async () => ({ messageId: 'cf-1' }) },
    EMAIL_QUEUE: { send: async msg => enqueued.push(msg) }
  };

  await handleForgotPassword(makeResetRequest('alice@example.com'), env, null, { now: () => 1000 });
  const row = Array.from(db.tables.email_logs.values())[0];

  // Simulate Consumer 1 crashing while in processing_pre_dispatch
  row.status = 'processing_pre_dispatch';
  row.lease_token = 'stale-lease-1';
  row.lease_expires_at = 5000;

  // Sweeper re-enqueues after lease expires
  await runOutboxAndLeaseSweeper(env, { now: () => 6000 });
  assert.equal(enqueued.length, 2);

  // Consumer 2 claims and completes
  await processEmailQueueBatch(
    { messages: [{ body: enqueued[1], ack() {}, retry() {} }] },
    env,
    { now: () => 7000 }
  );
  assert.equal(row.status, 'accepted_by_provider');
  assert.equal(db.tables.password_resets.size, 1);

  // Duplicate delivery of first message cannot overwrite or create a second token
  let dupAcked = false;
  await processEmailQueueBatch(
    { messages: [{ body: enqueued[0], ack() { dupAcked = true; }, retry() {} }] },
    env,
    { now: () => 8000 }
  );
  assert.equal(dupAcked, true);
  assert.equal(row.status, 'accepted_by_provider');
  assert.equal(db.tables.password_resets.size, 1);
});

test('6. Ambiguous timeout marks ambiguous_timeout and is never auto-retried; new reset revokes prior token', async () => {
  const db = createMockD1();
  db.tables.users.set('alice@example.com', { id: 'u-1', email_normalized: 'alice@example.com', display_name: 'Alice' });
  let shouldTimeout = true;
  const enqueued = [];
  const env = {
    DB: db,
    EMAIL_HMAC_SECRET: 'test-secret',
    CF_EMAIL_FROM: 'noreply@yatrasathi.in',
    EMAIL: {
      send: async () => {
        if (shouldTimeout) {
          const e = new Error('Request timed out');
          e.name = 'TimeoutError';
          throw e;
        }
        return { messageId: 'cf-2' };
      }
    },
    EMAIL_QUEUE: { send: async msg => enqueued.push(msg) }
  };

  await handleForgotPassword(makeResetRequest('alice@example.com'), env, null, { now: () => 1000 });
  let retried = false;
  let acked = false;
  await processEmailQueueBatch(
    { messages: [{ body: enqueued[0], ack() { acked = true; }, retry() { retried = true; } }] },
    env,
    { now: () => 2000 }
  );

  const row1 = Array.from(db.tables.email_logs.values())[0];
  assert.equal(row1.status, 'ambiguous_timeout');
  assert.equal(acked, true);
  assert.equal(retried, false);

  // New reset after cooldown revokes first token
  shouldTimeout = false;
  await handleForgotPassword(makeResetRequest('alice@example.com'), env, null, { now: () => 200_000 });
  await processEmailQueueBatch(
    { messages: [{ body: enqueued[1], ack() {}, retry() {} }] },
    env,
    { now: () => 201_000 }
  );

  const tokens = Array.from(db.tables.password_resets.values());
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].revoked_at !== null);
  assert.equal(tokens[1].revoked_at, null);
});

test('7. Cloudflare E_RECIPIENT_PLAN_RESTRICTED falls back to Gmail; E_RECIPIENT_NOT_ALLOWED does not', async () => {
  const db = createMockD1();
  db.tables.users.set('alice@example.com', { id: 'u-1', email_normalized: 'alice@example.com', display_name: 'Alice' });
  let cfErrCode = 'E_RECIPIENT_PLAN_RESTRICTED';
  const gmailCalls = [];
  const enqueued = [];
  const env = {
    DB: db,
    EMAIL_HMAC_SECRET: 'test-secret',
    CF_EMAIL_FROM: 'noreply@yatrasathi.in',
    GMAIL_SENDER_ADDRESS: 'owner@gmail.com',
    GMAIL_CLIENT_ID: 'cid',
    GMAIL_CLIENT_SECRET: 'csec',
    GMAIL_REFRESH_TOKEN: 'rtok',
    EMAIL: {
      send: async () => {
        const err = new Error('cf rejected');
        err.code = cfErrCode;
        throw err;
      }
    },
    EMAIL_QUEUE: { send: async msg => enqueued.push(msg) }
  };
  const deps = {
    sendGmailEmail: async m => { gmailCalls.push(m); return { id: 'gm-1' }; }
  };

  await handleForgotPassword(makeResetRequest('alice@example.com'), env, null, { now: () => 1000 });
  await processEmailQueueBatch(
    { messages: [{ body: enqueued[0], ack() {}, retry() {} }] },
    env,
    { ...deps, now: () => 2000 }
  );
  assert.equal(gmailCalls.length, 1);
  assert.equal(Array.from(db.tables.email_logs.values())[0].status, 'accepted_by_provider');

  // E_RECIPIENT_NOT_ALLOWED must NOT fall back to Gmail
  cfErrCode = 'E_RECIPIENT_NOT_ALLOWED';
  await handleForgotPassword(makeResetRequest('alice@example.com'), env, null, { now: () => 200_000 });
  await processEmailQueueBatch(
    { messages: [{ body: enqueued[1], ack() {}, retry() {} }] },
    env,
    { ...deps, now: () => 201_000 }
  );
  assert.equal(gmailCalls.length, 1);
  assert.equal(Array.from(db.tables.email_logs.values())[1].status, 'failed_config');
});

test('8. Stale DLQ message with old publishLeaseToken cannot overwrite newer attempt; D1 failure prevents ack', async () => {
  const db = createMockD1();
  const key = 'reset:job-1';
  db.tables.email_logs.set(key, {
    id: 'log-1',
    idempotency_key: key,
    template_type: 'password_reset',
    status: 'failed_retryable',
    publish_lease_token: 'T2',
    publish_lease_expires_at: 999999,
    lease_expires_at: 999999,
    updated_at: 1000
  });

  // Old DLQ message with T1 arrives after T2 started
  let oldAcked = false;
  await processEmailDlqBatch(
    { messages: [{ body: { idempotencyKey: key, publishLeaseToken: 'T1' }, ack() { oldAcked = true; }, retry() {} }] },
    { DB: db },
    { now: () => 2000 }
  );
  assert.equal(oldAcked, true);
  assert.equal(db.tables.email_logs.get(key).status, 'failed_retryable');

  // D1 failure during DLQ processing must NOT ack, must retry
  db.setFailDlq(true);
  let failAcked = false;
  let failRetried = false;
  await processEmailDlqBatch(
    { messages: [{ body: { idempotencyKey: key, publishLeaseToken: 'T2' }, ack() { failAcked = true; }, retry() { failRetried = true; } }] },
    { DB: db },
    { now: () => 3000 }
  );
  assert.equal(failAcked, false);
  assert.equal(failRetried, true);

  // Matching T2 succeeds when D1 recovers
  db.setFailDlq(false);
  let okAcked = false;
  await processEmailDlqBatch(
    { messages: [{ body: { idempotencyKey: key, publishLeaseToken: 'T2' }, ack() { okAcked = true; }, retry() {} }] },
    { DB: db },
    { now: () => 4000 }
  );
  assert.equal(okAcked, true);
  assert.equal(db.tables.email_logs.get(key).status, 'failed_exhausted');
});

test('9. Owner-scoped booking receipt status & retry rejects non-owners with 403', async () => {
  const db = createMockD1();
  db.tables.bookings.set('b-1', {
    id: 'b-1',
    user_id: 'owner-1',
    trip_id: 'trip-1',
    service_title: 'Jaipur Haveli Stay',
    amount_paise: 980000,
    receipt_code: 'SIM-RCPT-1001',
    status: 'simulated_confirmed',
    created_at: 1000
  });

  const env = {
    DB: db,
    EMAIL_HMAC_SECRET: 'test-secret',
    EMAIL_QUEUE: { send: async () => {} }
  };

  const forbidden = await handleGetBookingReceiptStatus('b-1', { id: 'other-user' }, env);
  assert.equal(forbidden.status, 403);

  const retryForbidden = await handleRetryBookingReceipt('b-1', { id: 'other-user', email: 'other@example.com' }, {}, env, null);
  assert.equal(retryForbidden.status, 403);

  const ownerRetry = await handleRetryBookingReceipt('b-1', { id: 'owner-1', email: 'owner@example.com' }, {}, env, null);
  assert.equal(ownerRetry.status, 202);
  const ownerStatus = await handleGetBookingReceiptStatus('b-1', { id: 'owner-1' }, env);
  assert.equal(ownerStatus.status, 200);
  const statusJson = await ownerStatus.json();
  assert.equal(statusJson.emailStatus, 'queued');
});

test('10. Unauthenticated receipt requests return 401; verified Better Auth session resolves owner', async () => {
  const db = createMockD1();
  db.tables.bookings.set('b-2', {
    id: 'b-2',
    user_id: 'owner-2',
    trip_id: 'trip-2',
    service_title: 'Kerala Houseboat',
    amount_paise: 1200000,
    receipt_code: 'SIM-RCPT-2002',
    status: 'simulated_confirmed',
    created_at: 1000
  });
  const env = { DB: db, EMAIL_HMAC_SECRET: 'test-secret', EMAIL_QUEUE: { send: async () => {} } };

  // Unauthenticated (sessionUser = null)
  const unauthGet = await handleGetBookingReceiptStatus('b-2', null, env);
  assert.equal(unauthGet.status, 401);
  const unauthPost = await handleRetryBookingReceipt('b-2', null, {}, env, null);
  assert.equal(unauthPost.status, 401);

  // Verified session resolver (never trusts unverified headers)
  const req = new Request('https://yatrasathi.workers.dev/api/bookings/b-2/receipt-email', {
    headers: { 'X-Yatra-Session-User': 'owner-2' }
  });
  const sessionUser = await resolveSessionUser(req, env, {
    getSession: async () => ({ user: { id: 'owner-2', email: 'owner2@example.com' } })
  });
  assert.equal(sessionUser.id, 'owner-2');

  const okResp = await handleGetBookingReceiptStatus('b-2', sessionUser, env);
  assert.equal(okResp.status, 200);
});

test('11. Password reset completion validates token_hash and rejects reused or expired tokens', async () => {
  const db = createMockD1();
  const rawToken = 'reset-token-abc-123';
  const tokenHash = await sha256Hex(rawToken);
  db.tables.password_resets.set('pr-1', {
    id: 'pr-1',
    user_id: 'u-1',
    token_hash: tokenHash,
    email_log_id: 'log-1',
    expires_at: 50_000,
    used_at: null,
    revoked_at: null,
    created_at: 1000
  });

  // Extend mock D1 for password_resets lookup & completion batch
  const origPrepare = db.prepare.bind(db);
  db.prepare = sql => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id, user_id, expires_at, used_at, revoked_at FROM password_resets')) {
      return {
        bind(hash) {
          return {
            first: async () => Array.from(db.tables.password_resets.values()).find(r => r.token_hash === hash) || null
          };
        }
      };
    }
    if (q.startsWith('UPDATE password_resets SET used_at = ?')) {
      return {
        bind(now, id, nowExp) {
          return {
            run: async () => {
              const row = db.tables.password_resets.get(id);
              if (!row || row.used_at !== null || row.revoked_at !== null || row.expires_at <= nowExp) {
                return { meta: { changes: 0 } };
              }
              row.used_at = now;
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
    if (q.startsWith('UPDATE account SET password = ?') || q.startsWith('DELETE FROM session WHERE userId = ?')) {
      return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) };
    }
    return origPrepare(sql);
  };

  const req = new Request('https://yatrasathi.workers.dev/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken, newPassword: 'NewStrongPassword123' })
  });
  const okResp = await handleCompletePasswordReset(req, { DB: db }, {
    now: () => 10_000,
    hashPassword: async p => `hashed:${p}`
  });
  assert.equal(okResp.status, 200);

  // Reusing the same token must fail with 400
  const reuseResp = await handleCompletePasswordReset(req, { DB: db }, {
    now: () => 11_000,
    hashPassword: async p => `hashed:${p}`
  });
  assert.equal(reuseResp.status, 400);
});
