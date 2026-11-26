# YatraSathi Cloudflare D1 (SQLite) Database Schema

## Status and Conventions

YatraSathi uses **Cloudflare D1 (SQLite)**, bound as `env.DB` in `wrangler.jsonc`, with ordered SQL migrations in `migrations/`.

- **SQLite Types:** Primary keys and identifiers are `TEXT` (UUIDs / Better Auth IDs), timestamps are `INTEGER` (Unix epoch milliseconds), booleans are `INTEGER` (`0` or `1`), and money is stored as integer paise (`INTEGER`, never `REAL`/floating point).
- **Parameterized Queries:** All Worker queries MUST use `env.DB.prepare(...).bind(...)` and `env.DB.batch([...])` for atomic multi-statement updates.
- **No Database RLS:** SQLite/D1 does not support PostgreSQL Row Level Security. All ownership and access checks MUST be enforced in Worker handlers (`src/worker.mjs`, `src/email/dispatcher.mjs`) using the verified Better Auth session user.
- **Migration Workflow:** Add new versioned SQL files to `migrations/` (e.g., `0002_*.sql`) and apply via:
  - Local dev: `npx wrangler d1 migrations apply yatrasathi-db --local`
  - Remote prod: `npx wrangler d1 migrations apply yatrasathi-db --remote`

---

## Implemented Schema (`migrations/0001_email_delivery.sql`)

### 1. Better Auth Core Tables

Managed by Better Auth (`src/auth.mjs`) with `database: env.DB`:

- **`user`**: `id TEXT PRIMARY KEY`, `name TEXT NOT NULL`, `email TEXT NOT NULL UNIQUE`, `emailVerified INTEGER NOT NULL DEFAULT 0`, `image TEXT`, `createdAt INTEGER NOT NULL`, `updatedAt INTEGER NOT NULL`
- **`session`**: `id TEXT PRIMARY KEY`, `expiresAt INTEGER NOT NULL`, `token TEXT NOT NULL UNIQUE`, `createdAt INTEGER NOT NULL`, `updatedAt INTEGER NOT NULL`, `ipAddress TEXT`, `userAgent TEXT`, `userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE`
  - Index: `idx_session_userId ON session (userId)`
- **`account`**: `id TEXT PRIMARY KEY`, `accountId TEXT NOT NULL`, `providerId TEXT NOT NULL`, `userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE`, `accessToken TEXT`, `refreshToken TEXT`, `idToken TEXT`, `accessTokenExpiresAt INTEGER`, `refreshTokenExpiresAt INTEGER`, `scope TEXT`, `password TEXT`, `createdAt INTEGER NOT NULL`, `updatedAt INTEGER NOT NULL`
  - Index: `idx_account_userId ON account (userId)`
- **`verification`**: `id TEXT PRIMARY KEY`, `identifier TEXT NOT NULL`, `value TEXT NOT NULL`, `expiresAt INTEGER NOT NULL`, `createdAt INTEGER`, `updatedAt INTEGER`

### 2. `bookings` (Owner-Scoped Booking Records & Receipt Status)

- `id TEXT PRIMARY KEY`
- `user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE`
- `trip_id TEXT NOT NULL`
- `service_title TEXT NOT NULL`
- `amount_paise INTEGER NOT NULL`
- `receipt_code TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'simulated_confirmed'`
- `created_at INTEGER NOT NULL`
- Index: `idx_bookings_user_id ON bookings (user_id)`

*(Booking records represent personal travel notes or simulated demo receipts; YatraSathi does not make or confirm external reservations.)*

### 3. Transactional Email Cooldowns, Outbox & Password Resets

- **`email_cooldowns`**: `scope_key TEXT PRIMARY KEY`, `last_sent_at INTEGER NOT NULL`, `window_count INTEGER NOT NULL DEFAULT 1`, `window_started_at INTEGER NOT NULL`
- **`email_logs`**:
  - `id TEXT PRIMARY KEY`, `idempotency_key TEXT NOT NULL UNIQUE`, `template_type TEXT NOT NULL CHECK (template_type IN ('password_reset', 'booking_receipt'))`
  - `user_id TEXT`, `booking_id TEXT`, `masked_recipient TEXT NOT NULL`, `email_hmac TEXT NOT NULL`, `ip_hash TEXT`, `temp_email_ref TEXT`
  - `status TEXT NOT NULL CHECK (status IN ('outbox_pending','publishing','queued','processing_pre_dispatch','dispatching_provider','accepted_by_provider','suppressed_unknown','suppressed_cooldown','failed_retryable','failed_non_retryable','failed_config','failed_reauth_required','unavailable_quota_exhausted','ambiguous_timeout','failed_outbox_exhausted','failed_exhausted'))`
  - Lease & retry columns: `publish_lease_token TEXT`, `publish_lease_expires_at INTEGER`, `publish_attempts INTEGER NOT NULL DEFAULT 0`, `next_publish_at INTEGER NOT NULL DEFAULT 0`, `lease_token TEXT`, `lease_expires_at INTEGER`, `provider_used TEXT`, `provider_message_id TEXT`, `error_code TEXT`, `attempts INTEGER NOT NULL DEFAULT 0`, `created_at INTEGER NOT NULL`, `updated_at INTEGER NOT NULL`
  - Indexes: `idx_email_logs_outbox`, `idx_email_logs_leases`, `idx_email_logs_booking`
- **`password_resets`**:
  - `id TEXT PRIMARY KEY`, `user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE`, `token_hash TEXT NOT NULL UNIQUE`, `email_log_id TEXT NOT NULL`, `expires_at INTEGER NOT NULL`, `used_at INTEGER`, `revoked_at INTEGER`, `created_at INTEGER NOT NULL`
  - Index: `idx_password_resets_user ON password_resets (user_id, used_at, revoked_at)`

---

## Implemented Schema (`migrations/0002_workspace_persistence.sql`)

Preserves all `0001_email_delivery.sql` tables and adds authenticated workspace persistence:

- **`user_profiles`**: `user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE`, `display_name TEXT`, `phone TEXT`, `pacing TEXT CHECK (pacing IN ('relaxed','active','slow'))`, `budget_pref TEXT CHECK (budget_pref IN ('budget','balanced','comfort'))`, `interests_json TEXT`, `updated_at INTEGER`
- **`saved_destinations`**: `user_id TEXT REFERENCES user(id) ON DELETE CASCADE`, `destination_id TEXT`, `created_at INTEGER`, `PRIMARY KEY (user_id, destination_id)`
- **`trips`**: `id TEXT PRIMARY KEY`, `owner_id TEXT REFERENCES user(id) ON DELETE CASCADE`, `name TEXT`, `destination TEXT`, `start_date TEXT`, `end_date TEXT`, `travelers INTEGER CHECK (travelers >= 1)`, `budget_paise INTEGER CHECK (budget_paise >= 0)`, `currency TEXT CHECK (currency = 'INR')`, `theme TEXT`, `status TEXT CHECK (status IN ('planning','upcoming','active','completed','archived'))`, `selected_route_id TEXT`, `selected_places_json TEXT`, `created_at INTEGER`, `updated_at INTEGER` (`idx_trips_owner`)
- **`trip_members`**: `trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE`, `user_id TEXT REFERENCES user(id) ON DELETE CASCADE`, `role TEXT CHECK (role IN ('owner','collaborator'))`, `joined_at INTEGER`, `PRIMARY KEY (trip_id, user_id)` (`idx_trip_members_user`)
- **`itinerary_items`**: `id TEXT PRIMARY KEY`, `trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE`, `day_key TEXT`, `time_label TEXT`, `duration_label TEXT`, `title TEXT`, `location TEXT`, `notes TEXT`, `estimated_cost_paise INTEGER CHECK (estimated_cost_paise >= 0)`, `sort_order INTEGER`, `created_by TEXT REFERENCES user(id) ON DELETE CASCADE`, `created_at INTEGER` (`idx_itinerary_trip_day`)
- **`expenses`**: `id TEXT PRIMARY KEY`, `trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE`, `created_by TEXT REFERENCES user(id) ON DELETE CASCADE`, `author_name TEXT`, `category TEXT CHECK (category IN ('transport','stay','food','activities','other'))`, `amount_paise INTEGER CHECK (amount_paise > 0)`, `currency TEXT CHECK (currency = 'INR')`, `spent_on TEXT`, `note TEXT`, `created_at INTEGER`, `updated_at INTEGER` (`idx_expenses_trip_date`)
- **`booking_notes`**: `id TEXT PRIMARY KEY`, `trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE`, `user_id TEXT REFERENCES user(id) ON DELETE CASCADE`, `category TEXT CHECK (category IN ('transport','stay','activity','other'))`, `provider TEXT`, `reference_code TEXT`, `notes TEXT`, `amount_paise INTEGER CHECK (amount_paise >= 0)`, `is_simulated INTEGER`, `created_at INTEGER` (`idx_booking_notes_trip`)
- **`activity_events`**: `id TEXT PRIMARY KEY`, `user_id TEXT REFERENCES user(id) ON DELETE CASCADE`, `trip_id TEXT`, `action_type TEXT`, `summary TEXT`, `created_at INTEGER` (`idx_activity_user`)

---

## Planned / Not-Yet-Migrated Tables

- **`trip_invites`** (`token_hash TEXT UNIQUE`, `status`, `expires_at INTEGER`, `accepted_at INTEGER`) — collaborator invite generation/acceptance endpoints are not yet implemented.
- **`destinations` / `destination_items`** — destination discovery catalog currently uses curated seed data in `app.html` / `js/planner.js` until a live destination content source is configured.
