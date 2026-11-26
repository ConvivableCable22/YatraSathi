# YatraSathi API & Worker Specification

## Architecture Baseline

YatraSathi runs on **Cloudflare Workers** (`src/worker.mjs`) with:
- **Workers Static Assets (`ASSETS`):** Serves `index.html`, `app.html`, `css/*`, and `js/*`. `run_worker_first: ["/api/*"]` ensures all `/api/*` requests execute in the Worker before static asset lookup.
- **Better Auth (`src/auth.mjs`):** Handles session cookies, sign-up, sign-in, sign-out, session lookup, and password updates against Cloudflare D1 (`env.DB`).
- **Transactional Email & Recovery (`src/email/dispatcher.mjs`):** Uses a D1 outbox (`email_logs`), `EMAIL_QUEUE` / `EMAIL_DLQ` queues, `RESET_IP_LIMITER` rate limiter, and a 5-minute Cron sweeper (`*/5 * * * *`).

---

## 1. Implemented Worker HTTP Endpoints (`src/worker.mjs`)

### 1.1 Health Check
- **`GET /api/health`**
  - Returns `200 OK`: `{ "ok": true, "service": "yatrasathi-worker" }`.

### 1.2 Better Auth Endpoints (`/api/auth/*`)
Handled by `auth.handler(request)` from `createAuth(env, url.origin)`:
- `POST /api/auth/sign-up/email` — Create user account (`emailAndPassword.minPasswordLength: 8`).
- `POST /api/auth/sign-in/email` — Authenticate and set Better Auth session cookie.
- `POST /api/auth/sign-out` — Revoke current session cookie.
- `GET /api/auth/get-session` — Return active `{ session, user }` or `null`.
- `POST /api/auth/change-password` — Update password for authenticated session.

### 1.3 Password Reset Endpoints (Custom D1 Outbox + Token Rotation)
- **`POST /api/auth/forgot-password`**
  - Validates email syntax (`400` on malformed syntax with 0 D1 writes).
  - Applies edge IP rate limiting (`env.RESET_IP_LIMITER`) and per-email cooldowns (`email_cooldowns`).
  - Returns an **anti-enumeration `202 Accepted`** response regardless of whether the email exists or is rate-limited, enqueuing valid jobs to `env.EMAIL_QUEUE` via `email_logs` outbox.
- **`POST /api/auth/reset-password`**
  - Accepts `{ token, newPassword }` (`newPassword.length >= 8`).
  - Hashes `token` with SHA-256 and checks `password_resets` (`used_at IS NULL`, `revoked_at IS NULL`, `expires_at > now`).
  - Uses Better Auth's password hasher (`ctx.password.hash`) and executes an atomic 3-statement `env.DB.batch()`: marks `password_resets.used_at`, updates `account.password` (`providerId = 'credential'`), and deletes all active rows in `session` for `user_id`.

### 1.4 Owner-Scoped Booking Receipt Email
- **`GET /api/bookings/:id/receipt-email`**
  - Calls `resolveSessionUser(request, env)` (`401` if unauthenticated).
  - Verifies `bookings.user_id === sessionUser.id` (`403` for non-owners, `404` if missing).
  - Returns latest receipt email delivery status from `email_logs`.
- **`POST /api/bookings/:id/receipt-email`**
  - Same session (`401`) and owner (`403`) checks.
  - Enqueues or retries a `booking_receipt` email job via D1 outbox + `EMAIL_QUEUE`.

## 1.5 Authenticated Workspace Endpoints (`src/workspace.mjs`)
All `/api/workspace/*` routes call `resolveSessionUser(request, env)` (`401` if unauthenticated) and verify `trips.owner_id` or `trip_members` membership (`403` if denied) before any trip-scoped read or write:
- `GET /api/workspace/bootstrap` — Returns `{ user, profile, savedDestinations, trips, itineraryItems, expenses, bookingNotes, recentActivity }` with server-computed integer-paise totals.
- `PUT /api/workspace/profile` — Updates `user.name` and upserts `user_profiles`.
- `POST /api/workspace/saved-destinations/toggle` — Toggles a `destination_id` in `saved_destinations`.
- `POST /api/workspace/trips` — Creates a private trip in `trips` and inserts the `owner` row in `trip_members` atomically.
- `PATCH /api/workspace/trips/:id` — Updates trip details, status (`upcoming`/`archived`), `selectedRouteId`, or `selectedPlaces`.
- `POST /api/workspace/trips/:id/itinerary` & `DELETE /api/workspace/trips/:id/itinerary/:itemId` — Creates or deletes itinerary items.
- `POST /api/workspace/trips/:id/expenses`, `PATCH /api/workspace/trips/:id/expenses/:expenseId`, `DELETE /api/workspace/trips/:id/expenses/:expenseId` — Integer-paise expense CRUD with server-derived `author_name`.
- `POST /api/workspace/trips/:id/booking-notes` & `DELETE /api/workspace/trips/:id/booking-notes/:noteId` — Personal booking reference notes CRUD.

### 1.6 Local Dev CORS Behavior
- When `APP_BASE_URL` starts with `http://127.0.0.1:` or `http://localhost:`, `/api/*` responses allow `Origin` in `{http://127.0.0.1:5500, http://localhost:5500}` with `Access-Control-Allow-Credentials: true`.

---

## 2. Background Queue & Scheduled Handlers

- **`queue(batch, env)`**:
  - `yatrasathi-email-queue` → `processEmailQueueBatch(batch, env)` (lease-guarded pre-dispatch + Cloudflare Email / Gmail API fallback).
  - `yatrasathi-email-dlq` → `processEmailDlqBatch(batch, env)` (generation-guarded failure status persistence before message ack).
- **`scheduled(_event, env)`** (`*/5 * * * *`):
  - Runs `runOutboxAndLeaseSweeper(env)` to recover failed initial queue publishes and expired leases.

---

## 3. Planned / Unimplemented API Surface

- `POST /api/trips/:id/invites`, `POST /api/invites/accept`, `DELETE /api/trips/:id/invites/:inviteId` (storing SHA-256 `token_hash` only) — collaborator invitation delivery and acceptance are deferred until invite email/channel policies are finalized.

---

## 4. Error Handling Conventions

- Unknown `/api/*` routes return `404` `{ "ok": false, "code": "NOT_FOUND" }`.
- Never expose stack traces, SQL errors, or raw tokens in API responses.
- Standard status codes: `400` validation/token error, `401` unauthenticated, `403` forbidden (ownership mismatch), `404` not found, `202` accepted async email job.
