-- YatraSathi Cloudflare D1 Migration 0004: Google OAuth Email OTP Challenges
-- Target: Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS google_otp_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  masked_email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  resend_after INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_google_otp_user ON google_otp_challenges (user_id, used_at, revoked_at);
