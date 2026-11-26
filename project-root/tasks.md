# YatraSathi Delivery Tasks

Use this as a living checklist. Confirm the existing repository and stack before checking off implementation work. Keep tasks small enough to review and verify.

## Product and architecture

- [x] Inspect repository structure and existing instructions.
- [x] Confirm architecture: HTML/CSS/JS with Cloudflare Workers + Static Assets, D1 (SQLite), Better Auth (`1.7.28`), and Cloudflare Queues.
- [x] Confirm Cloudflare D1 database target (`migrations/0001_email_delivery.sql`) and Better Auth (`src/auth.mjs`).
- [ ] Confirm map, route, and destination content sources and terms.
- [ ] Confirm launch language and data retention/deletion policy.
- [x] Define initial offline release as read-only access to saved trip essentials; defer offline editing and conflict resolution.

## Foundation and design

- [ ] Establish responsive public and signed-in app shells.
- [ ] Implement semantic design tokens and destination theme mechanism.
- [ ] Build accessible navigation, buttons, forms, cards, dialogs, and feedback states.
- [ ] Add loading, empty, error, offline, and pending-sync patterns.
- [ ] Review Gen Z visual direction for readability and restraint.

## Identity and trips

- [x] Implement sign up, sign in, sign out, and recovery.
- [x] Implement profile and optional travel preferences.
- [x] Implement private-by-default trip creation, editing, archive/delete.
- [x] Implement dashboard and trip overview.
- [x] Verify owner and non-member access behavior (implemented for bookings & workspace `/api/workspace/*` routes).

## Discovery and itinerary

- [x] Implement destination search, browse, and supported filters.
- [x] Implement destination details, source/freshness labels, and save/unsave.
- [ ] Define content moderation/reporting workflow.
- [x] Implement itinerary days and item create/edit/delete/reorder.
- [x] Implement recommendations and destination-to-trip flow.
- [ ] Integrate maps through provider adapter; add list fallback (list fallback & illustrative SVG preview implemented; live external map/routing provider blocked until selected).

## Budget and trip records

- [x] Implement INR-safe trip budget storage and formatting.
- [x] Implement expense categories and CRUD.
- [x] Show recorded totals and remaining budget separately from estimates.
- [x] Implement booking record CRUD and clear non-reservation disclosure.
- [x] Verify authorship attribution for shared entries.

## Collaboration and offline

- [ ] Implement owner/collaborator membership model.
- [ ] Implement invite, accept, and revoke flows via Cloudflare Worker endpoints + D1 with SHA-256 token hashing.
- [ ] Verify revoked members lose access immediately.
- [ ] Implement explicit offline trip save and essential-data viewing (read-only).
- [ ] Show offline status badge, last-synced timestamp, and provide local cache purge.
- [ ] Defer offline editing and conflict resolution to a future phase.

## Rewards and public website

- [ ] Implement planning milestones, XP, and badges with dismissible feedback.
- [ ] Build home, how-it-works, features, destinations, about/trust, and sign-in entry points.
- [ ] Add pricing only after model and limits are confirmed.
- [ ] Check public claims against actually available product capabilities.

## Release readiness

- [ ] Complete critical user journey checks.
- [ ] Complete accessibility and responsive review.
- [ ] Complete privacy and security review.
- [ ] Verify estimates, data attribution, and booking disclosures.
- [ ] Confirm backups, monitoring, deletion, and incident response.
- [ ] Document known limitations and release notes.
