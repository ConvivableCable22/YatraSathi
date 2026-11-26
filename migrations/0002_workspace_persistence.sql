-- YatraSathi Cloudflare D1 Migration 0002: Authenticated Workspace Persistence
-- Preserves all existing Better Auth & email_delivery tables from 0001_email_delivery.sql.
-- Target: Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  pacing TEXT NOT NULL DEFAULT 'relaxed' CHECK (pacing IN ('relaxed', 'active', 'slow')),
  budget_pref TEXT NOT NULL DEFAULT 'balanced' CHECK (budget_pref IN ('budget', 'balanced', 'comfort')),
  interests_json TEXT NOT NULL DEFAULT '["heritage","food"]',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_destinations (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  destination_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, destination_id)
);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  travelers INTEGER NOT NULL DEFAULT 2 CHECK (travelers >= 1),
  budget_paise INTEGER NOT NULL DEFAULT 0 CHECK (budget_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  theme TEXT NOT NULL DEFAULT 'rajasthan',
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('planning', 'upcoming', 'active', 'completed', 'archived')),
  selected_route_id TEXT,
  selected_places_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS trip_members (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'collaborator')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members (user_id);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL DEFAULT 'day-1',
  time_label TEXT NOT NULL DEFAULT '10:00 AM',
  duration_label TEXT NOT NULL DEFAULT '60 mins',
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  estimated_cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_paise >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_itinerary_trip_day ON itinerary_items (trip_id, day_key, sort_order);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('transport', 'stay', 'food', 'activities', 'other')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  spent_on TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_trip_date ON expenses (trip_id, spent_on DESC);

CREATE TABLE IF NOT EXISTS booking_notes (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('transport', 'stay', 'activity', 'other')),
  provider TEXT NOT NULL,
  reference_code TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (amount_paise >= 0),
  is_simulated INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_booking_notes_trip ON booking_notes (trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  trip_id TEXT,
  action_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_events (user_id, created_at DESC);
