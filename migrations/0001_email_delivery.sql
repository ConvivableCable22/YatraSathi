-- YatraSathi Cloudflare D1 Migration: Better Auth + Transactional Email & Password Reset Outbox
-- Target: Cloudflare D1 (SQLite)

-- 1. Better Auth Core Tables (SQLite / Kysely D1)
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_userId ON session (userId);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_userId ON account (userId);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);

-- 2. Application Bookings (Owner-Scoped Receipt Status & Retry)
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL,
  service_title TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  receipt_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'simulated_confirmed',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);

-- 3. Email Cooldowns, Outbox & Logs
CREATE TABLE IF NOT EXISTS email_cooldowns (
  scope_key TEXT PRIMARY KEY,
  last_sent_at INTEGER NOT NULL,
  window_count INTEGER NOT NULL DEFAULT 1,
  window_started_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  template_type TEXT NOT NULL CHECK (template_type IN ('password_reset', 'booking_receipt')),
  user_id TEXT,
  booking_id TEXT,
  masked_recipient TEXT NOT NULL,
  email_hmac TEXT NOT NULL,
  ip_hash TEXT,
  temp_email_ref TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'outbox_pending',
    'publishing',
    'queued',
    'processing_pre_dispatch',
    'dispatching_provider',
    'accepted_by_provider',
    'suppressed_unknown',
    'suppressed_cooldown',
    'failed_retryable',
    'failed_non_retryable',
    'failed_config',
    'failed_reauth_required',
    'unavailable_quota_exhausted',
    'ambiguous_timeout',
    'failed_outbox_exhausted',
    'failed_exhausted'
  )),
  publish_lease_token TEXT,
  publish_lease_expires_at INTEGER,
  publish_attempts INTEGER NOT NULL DEFAULT 0,
  next_publish_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_expires_at INTEGER,
  provider_used TEXT,
  provider_message_id TEXT,
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_logs_outbox
  ON email_logs (status, next_publish_at, publish_lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_email_logs_leases
  ON email_logs (status, lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_email_logs_booking
  ON email_logs (booking_id, updated_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  email_log_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user
  ON password_resets (user_id, used_at, revoked_at);
