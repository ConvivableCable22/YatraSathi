-- YatraSathi Cloudflare D1 Migration 0006: Private Trip Reviews & Photo Notes
-- Preserves all tables from 0001-0005 without rewriting applied migrations.
-- Target: Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS trip_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  body TEXT NOT NULL,
  photo_data_url TEXT,
  photo_mime TEXT,
  photo_bytes INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility = 'private'),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_reviews_user
  ON trip_reviews (user_id, created_at DESC);
