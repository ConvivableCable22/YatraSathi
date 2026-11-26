# YatraSathi Tech Stack

## Confirmed Direction

YatraSathi uses native browser technologies on the front end paired with a **Cloudflare Workers + D1 + Better Auth + Queues** backend:

- **Frontend:** Vanilla **HTML**, **CSS**, and **JavaScript** (`index.html`, `app.html`, `css/`, `js/`). No React, Next.js, TypeScript, Tailwind, or frontend build tooling is used.
- **Compute & Static Hosting:** **Cloudflare Workers** (`src/worker.mjs`) with **Workers Static Assets** (`ASSETS` binding, `run_worker_first: ["/api/*"]` in `wrangler.jsonc`).
- **Database:** **Cloudflare D1** (SQLite), bound as `env.DB` with SQL migrations in `migrations/`.
- **Authentication:** **Better Auth** (`better-auth` `1.7.28` in `src/auth.mjs`), using Better Auth's native D1 binding (`database: env.DB`) and email/password authentication.
- **Async Email & Recovery:** **Cloudflare Queues** (`EMAIL_QUEUE` producer/consumer for `yatrasathi-email-queue`, plus `yatrasathi-email-dlq` dead-letter queue), **Cron Triggers** (`*/5 * * * *`), and **Rate Limiting** (`RESET_IP_LIMITER` binding).

## Repository Structure

```text
index.html                  # Public marketing landing page
app.html                    # Signed-in & prototype trip planner workspace
css/
  styles.css                # Shared design tokens and base styles
  app.css                   # Planner workspace layout and components
js/
  app.js                    # Marketing page interactions
  planner.js                # Client-side planner state, UI, and /api/* calls
src/
  worker.mjs                # Cloudflare Worker entrypoint (fetch, queue, scheduled)
  auth.mjs                  # Better Auth factory for Workers + D1
  email/dispatcher.mjs      # Transactional email outbox, queue & provider dispatcher
migrations/
  0001_email_delivery.sql   # D1 SQLite schema for Better Auth, bookings, email outbox & resets
scripts/
  preview-server.js         # Local static preview server (port 3000)
  seed-local-demo.mjs       # Local D1 demo account & sample booking seeder
  verify-app.js             # Static HTML/navigation/accessibility verification script
tests/
  email-delivery.test.mjs   # Unit tests for auth, reset, outbox, queue, and receipt ownership
  wrangler-auth-runtime.test.mjs
wrangler.jsonc              # Cloudflare Workers, D1, Queues, Cron & Rate Limit config
```

## HTML, CSS, and JavaScript Standards

- **HTML:** Semantic elements, logical heading hierarchy, `<label for>` bindings, meaningful button/link text, and accessible modal/tab attributes.
- **CSS:** CSS custom properties (`:root` tokens in `css/styles.css`), mobile-first responsive grids/flexboxes, visible focus/empty/error/offline states, and `prefers-reduced-motion` support.
- **JavaScript:** Vanilla ES modules on the Worker (`src/*.mjs`) and plain browser scripts (`js/*.js`). Monetary values are represented in integer **paise** (`INTEGER` in D1 and integer math in JS) and formatted with `Intl.NumberFormat('en-IN')` / `toLocaleString('en-IN')`.

## Backend, Data, and Security Services

- **Authorization:** Cloudflare D1 (SQLite) does **not** have Row Level Security (RLS). Every server endpoint MUST authenticate the caller via `resolveSessionUser(request, env)` (Better Auth `auth.api.getSession`) and enforce ownership/membership explicitly in Worker code and parameterized `env.DB.prepare(...).bind(...)` queries.
- **Secrets & Environment Variables:** Secrets (`BETTER_AUTH_SECRET`, `EMAIL_HMAC_SECRET`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`) are stored via `wrangler secret put` (or `.dev.vars` locally), never in browser code or committed files. Non-secret vars (`APP_BASE_URL`, `CF_EMAIL_FROM`, `GMAIL_SENDER_ADDRESS`) live in `wrangler.jsonc`.
- **Current Persistence Boundary:** Better Auth (`user`, `session`, `account`, `verification`), `bookings`, `email_logs`, `email_cooldowns`, and `password_resets` are backed by D1. Trip, itinerary, expense, and destination-save workflows in `js/planner.js` currently operate in client-side state / `localStorage` and do not yet have Worker/D1 CRUD endpoints.

## Browser Storage and Offline Access

- Browser storage (`localStorage` / Cache Storage) is used only for non-sensitive UI preferences, client-side prototype workspace data, and explicitly saved offline trip snapshots in **read-only mode**.
- Do not persist raw reset tokens, invitation tokens, or auth secrets in browser storage.
- Provide an explicit action to purge local cached data and clear offline snapshots on sign-out.

## Unresolved Technical Decisions

- **Production Deployment Config:** Replace placeholder `database_id` (`REPLACE_WITH_D1_DATABASE_ID`) and `APP_BASE_URL` in `wrangler.jsonc` before production `wrangler deploy`.
- **Trip/Itinerary/Expense D1 Persistence:** Worker API endpoints and D1 tables for trips, collaborators, itineraries, and expenses are not yet implemented.
- **External Providers:** Live map tiles/routing, destination content APIs, and production email sender verification (`CF_EMAIL_FROM` / Gmail OAuth) remain to be configured/selected.
