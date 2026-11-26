# YatraSathi Security and Privacy Requirements

## Security Objectives

- Keep profile, trip, itinerary, booking, and expense data private to their owners and authorized trip collaborators.
- Enforce authentication and ownership checks in Cloudflare Worker handlers before reading or writing Cloudflare D1.
- Protect account recovery, email dispatch, and invitation flows from enumeration, replay, and abuse.
- Minimize PII in D1 logs, Worker logs, and external provider payloads.

## Implemented Identity, Session & Recovery Controls

- **Authentication & Sessions (`src/auth.mjs`):**
  - Uses **Better Auth** (`1.7.28`) backed by D1 (`env.DB`) with `emailAndPassword` (`minPasswordLength: 8`), signed by `env.BETTER_AUTH_SECRET`, and `ipAddressHeaders: ['cf-connecting-ip']`.
  - `trustedOrigins` is derived from `env.APP_BASE_URL` (with `127.0.0.1:8787`, `localhost:8787`, `127.0.0.1:5500`, `localhost:5500` added only in local dev).
- **Booking Receipt Authorization (`src/worker.mjs`, `src/email/dispatcher.mjs`):**
  - `/api/bookings/:id/receipt-email` resolves the active session via `resolveSessionUser(request, env)` (`401` if unauthenticated) and verifies `bookings.user_id === sessionUser.id` (`403` for non-owners).
- **Password Reset Security (`src/worker.mjs`, `src/email/dispatcher.mjs`):**
  - `POST /api/auth/forgot-password` enforces `env.RESET_IP_LIMITER` (10 req / 60s per `wrangler.jsonc`), per-email cooldowns (`email_cooldowns`), and always returns `202` for syntactically valid emails to prevent account enumeration.
  - `password_resets` stores only SHA-256 `token_hash` (15-minute TTL), never raw reset tokens.
  - `POST /api/auth/reset-password` atomically marks `used_at`, updates `account.password`, and deletes all `session` rows for the user via `env.DB.batch()`.
- **PII Minimization in Email Logs:**
  - `email_logs` stores `masked_recipient`, `email_hmac` (keyed with `env.EMAIL_HMAC_SECRET`), and `ip_hash` instead of plaintext addresses/IPs in structured logs.

## Data & Application Security Rules

- **No RLS in D1 (SQLite):** Because Cloudflare D1 does not support PostgreSQL Row Level Security, **every** trip-, booking-, or user-scoped Worker endpoint must check `sessionUser.id` and membership explicitly in SQL/handler logic.
- **Parameterized Queries:** Always use `env.DB.prepare(...).bind(...)`. Never interpolate user input into SQL strings.
- **Secrets Management:** Keep `BETTER_AUTH_SECRET`, `EMAIL_HMAC_SECRET`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` in Wrangler secrets (`wrangler secret put`) or git-ignored `.dev.vars`. Never commit secrets or ship them to client JS.
- **Offline Browser Storage:** Cache only read-only non-sensitive trip snapshots (`localStorage`) when explicitly saved offline; clear offline cache on sign-out and never store raw reset/invite tokens or auth secrets in `localStorage`.

## Known Security & Implementation Gaps

1. **Client-Only Trip/Itinerary/Expense Data:** Trips, itineraries, saved destinations, and expenses in `js/planner.js` currently live in browser state / `localStorage` and are **not yet persisted to D1 or protected by Worker CRUD authorization**. Cross-device sync and server-side collaborator access control are not active until those Worker endpoints and D1 tables are implemented.
2. **Collaborator Invitations Not Implemented:** `trip_members` and `trip_invites` do not yet exist in `migrations/` or `src/worker.mjs`.
3. **Production Deployment Placeholders:** `wrangler.jsonc` currently contains placeholder `database_id` (`REPLACE_WITH_D1_DATABASE_ID`) and `APP_BASE_URL`; `CF_EMAIL_FROM` / Gmail OAuth secrets must be configured per environment before production use.
4. **CSP & Security Headers:** Explicit `Content-Security-Policy` and security response headers are not yet added by `src/worker.mjs` for static asset responses.
5. **Account/Data Deletion Endpoint:** Automated self-service account/D1 data purge endpoints are not yet implemented.
