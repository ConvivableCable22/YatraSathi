# YatraSathi — Cloudflare Email Delivery Setup & Operations Guide

This guide covers local development, D1 migrations, Cloudflare Queues, owner-controlled Gmail OAuth secrets, and deployment on the **Cloudflare Free** plan (`$0` target).

---

## 1. Prerequisites (Cannot Be Completed Without Your Credentials)

1. **Cloudflare Account & Wrangler CLI:** Authenticate locally with `npx wrangler login`.
2. **Owner-Controlled Gmail API OAuth Client (Required for Gmail fallback):**
   - In Google Cloud Console, enable the **Gmail API**.
   - Configure the OAuth Consent Screen and publish its status to **In production** (if left in **Testing**, Google expires refresh tokens every **7 days**).
   - Request **only** the sensitive scope `https://www.googleapis.com/auth/gmail.send`.
   - Authorize **only the project owner's `@gmail.com` account** once via OAuth Playground or your own local script to obtain `GMAIL_REFRESH_TOKEN`. Never collect end-user Google passwords or Gmail tokens.
   - Note: `gmail.send` is a **Sensitive** scope (public apps beyond unverified user caps require Google OAuth verification). Consumer `@gmail.com` accounts are capped at **500 messages per rolling 24-hour period**; this is not unlimited and not guaranteed to remain free.
3. **Cloudflare Email Binding (Optional Primary):**
   - Only add an `EMAIL` (`send_email`) binding in `wrangler.jsonc` if your Cloudflare plan and verified sending domain are configured. On Workers Free without a paid sending setup, unverified recipients return `E_RECIPIENT_PLAN_RESTRICTED` and fall back to Gmail API.

---

## 2. Provision D1 & Queues

```bash
# 1. Create D1 database and copy the returned database_id into wrangler.jsonc
npx wrangler d1 create yatrasathi-db

# 2. Apply migrations locally and remotely
npx wrangler d1 migrations apply yatrasathi-db --local
npx wrangler d1 migrations apply yatrasathi-db --remote

# 3. Create main queue and dead-letter queue
npx wrangler queues create yatrasathi-email-queue
npx wrangler queues create yatrasathi-email-dlq
```

---

## 3. Configure Secrets (Never Commit to Git)

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put EMAIL_HMAC_SECRET
npx wrangler secret put GMAIL_CLIENT_ID
npx wrangler secret put GMAIL_CLIENT_SECRET
npx wrangler secret put GMAIL_REFRESH_TOKEN
```

For local `wrangler dev`, copy `.env.example` values into a git-ignored `.dev.vars` file.

---

## 4. Local Development: Static UI Preview vs. Wrangler Workflow

### Option A — Static UI Preview (Without Starting Wrangler)
Use this mode when editing HTML, CSS, or client-side UI starting from `index.html`:
```bash
npm run preview
```
- Open **`http://localhost:3000/`** (serves `index.html`) or **`http://localhost:3000/app.html`** (`app.html` workspace UI).
- *(Opening `index.html` directly via `file://` is not recommended because root-relative routes like `/app` and `/api/*` `fetch()` calls are blocked or fail under browser `file://` restrictions.)*
- **What requires Wrangler (disabled in static preview):** Better Auth signup/sign-in/sessions/sign-out, password reset (`/api/auth/forgot-password`, `/api/auth/reset-password`), D1 outbox/email queues, and owner-scoped booking receipt APIs (`/api/bookings/:id/receipt-email`). Static preview returns `503 STATIC_PREVIEW_NO_API` for `/api/*`.

### Option B — Full Wrangler + D1 + Better Auth Workflow
1. Ensure `.dev.vars` exists (git-ignored) with local-only `BETTER_AUTH_SECRET`, `EMAIL_HMAC_SECRET`, and `APP_BASE_URL="http://127.0.0.1:8787"`.
2. Seed the local Better Auth demo account in local D1 (safe to re-run; reuses the existing user without creating duplicates):
   ```powershell
   $env:DEMO_USER_EMAIL="demo.traveler@yatrasathi.local"
   $env:DEMO_USER_PASSWORD="YatraDemo#2026!K9"
   npm run seed:local-demo
   ```
   - **Local Demo Email:** `demo.traveler@yatrasathi.local`
   - **Local Demo Password:** `YatraDemo#2026!K9`
   - *(Strictly for local development—never seed this account into a remote/live database.)*
3. Start the local Worker + Static Assets + D1 server:
   ```bash
   npm run dev
   ```
4. Open **`http://127.0.0.1:8787/index.html`**, click **Sign In**, and enter the local demo credentials above.

## 5. Deployment

```bash
# Deploy to Cloudflare Workers
npx wrangler deploy
```

---

## 5. Architecture Notes & Limitations

- **Edge IP Rate Limiter (`RESET_IP_LIMITER`):** Cloudflare's Worker Rate Limiting binding is **approximate and location-based** (edge-local). Users sharing an IP (carrier CGNAT, campus/office Wi-Fi) may share limits. It serves strictly as a best-effort abuse control before D1 writes, while still returning the generic `HTTP 202` response.
- **No Exactly-Once Email Delivery:** Neither Cloudflare Email nor Gmail API provides two-phase commit with D1. Crashes during `dispatching_provider` transition to `ambiguous_timeout` and are never auto-retried; `accepted_by_provider` means provider acceptance, not guaranteed inbox delivery.
- **Free-Tier Quotas:** Workers Free (`100k req/day`, `10 ms CPU/req`), D1 Free (`5M reads/day`, `100k writes/day`), Queues Free (`10k ops/day`, 24-hr retention), Cron Triggers Free (`5/account`), Gmail `@gmail.com` (`500 msgs/rolling 24h`).
