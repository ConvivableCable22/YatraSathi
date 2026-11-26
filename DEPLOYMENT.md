# YatraSathi — Production Deployment & Operations Guide (Cloudflare Workers + D1)

YatraSathi runs on **Cloudflare Workers Static Assets**, **Cloudflare Workers**, **Cloudflare D1**, **Cloudflare Queues**, and **Better Auth** (plain HTML, CSS, and Vanilla JS frontend with zero frontend build step).

## 1. Hosting & Runtime Architecture
- **Frontend:** Served via Cloudflare Workers Static Assets (`wrangler.jsonc` `assets.directory = "."`, `run_worker_first = ["/api/*"]`).
- **API & Auth:** Handled by `src/worker.mjs` with Better Auth (`src/auth.mjs`) using its native Cloudflare D1 integration (`database: env.DB`).
- **Database:** Cloudflare D1 (`migrations/0001_email_delivery.sql`) with built-in Time Travel point-in-time recovery.
- **Transactional Email:** Two-provider outbox + Queue pipeline (`EMAIL_QUEUE`, `EMAIL_DLQ`, and Cron sweeper `*/5 * * * *`).

## 2. Secrets & Setup
See [CLOUDFLARE_EMAIL_SETUP.md](CLOUDFLARE_EMAIL_SETUP.md) for D1 provisioning, Queue creation, `wrangler secret put` commands (`BETTER_AUTH_SECRET`, `EMAIL_HMAC_SECRET`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`), and deployment.
