-- YatraSathi Cloudflare D1 Migration 0005: Account Data Isolation (User Achievements)
-- Preserves all tables from 0001-0004 without rewriting applied migrations.
-- Target: Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user
  ON user_achievements (user_id, unlocked_at DESC);
