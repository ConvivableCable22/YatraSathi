-- YatraSathi Cloudflare D1 Migration 0007: Verified Place Coordinates on Itinerary Items
-- Preserves all tables from 0001-0006 without rewriting applied migrations.
-- Target: Cloudflare D1 (SQLite)

ALTER TABLE itinerary_items ADD COLUMN place_id TEXT;
ALTER TABLE itinerary_items ADD COLUMN lat REAL;
ALTER TABLE itinerary_items ADD COLUMN lng REAL;
