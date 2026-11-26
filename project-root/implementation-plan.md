# YatraSathi Implementation Plan

## Planning assumptions

- The repository may be empty or may gain an existing stack; inspect before implementation.
- `tech-stack.md` is a proposed baseline, not authorization to migrate an existing app.
- Deliver a practical version of the complete planning loop, while sequencing foundational dependencies first.

## Phase 0: Repository and product decisions

- Inspect repository, framework, deployment, existing auth/data setup, and current instructions.
- Confirm existing repository architecture: Vanilla HTML/CSS/JS frontend served via Cloudflare Workers Static Assets (`ASSETS`), with Cloudflare Workers (`src/worker.mjs`), Cloudflare D1 (`env.DB`), Better Auth (`src/auth.mjs`), and Cloudflare Queues (`EMAIL_QUEUE` / `EMAIL_DLQ`) for auth, booking receipts, and password recovery.
- Resolve map/content providers, authentication, deployment region, privacy/retention, and launch language.
- Define initial offline release as read-only access to explicitly saved trip essentials; defer offline editing and conflict resolution to a later phase.

**Exit:** Architecture and provider decisions recorded; no existing work overwritten.

## Phase 1: Foundation and brand

- Establish responsive app shell and shared design tokens.
- Build public marketing shell and signed-in navigation separately.
- Add accessible component foundations and loading/empty/error patterns.
- Configure environments, secret management, logging, and initial deployment pipeline.

**Exit:** App shell works on mobile/desktop; colors, typography, and navigation are consistent.

## Phase 2: Identity and trip workspace

- Implement account/profile flow using chosen auth provider.
- Implement private-by-default trip ownership and membership rules.
- Build dashboard, trip creation, editing, overview, and deletion/archive behavior.
- Add database/API authorization tests.

**Exit:** A user can create and revisit a private trip; another user cannot access it.

## Phase 3: Destinations and itinerary

- Add curated destination model, search/browse, detail, save, and content attribution.
- Add itinerary days/items with editing and ordering.
- Add recommendations from configured sources or clearly identified seed content.
- Add map integration behind a provider adapter and list fallback.

**Exit:** User can discover a destination and build a day-by-day plan.

## Phase 4: Budget, records, and collaboration

- Add trip budgets and expense CRUD with INR-safe calculations (integer `paise`).
- Add personal booking records and clear external-reservation disclosure.
- Add invitations, collaborator access, and revocation via trusted Cloudflare Worker endpoints with SHA-256 token hashing.
- Verify Worker/D1 authorization checks for trip members, owners, and non-members.

**Exit:** User can organize trip costs and collaborate without implying bookings are confirmed.

## Phase 5: Offline essentials and rewards

- Add explicit offline save for essential trip details (read-only snapshot cached in browser storage).
- Add offline status badge, last-synced timestamp, and local cache purge on sign-out.
- Defer offline mutation queues and conflict resolution to post-launch phases.
- Add destination accent themes and lightweight progress rewards.

**Exit:** Saved trip essentials remain viewable offline; cached state is understandable; theme accessibility passes.

## Phase 6: Launch readiness

- Complete responsive, accessibility, privacy, security, and content review.
- Validate marketing claims and pricing disclosures.
- Run critical user journeys and release checks.
- Prepare backup, monitoring, retention, deletion, and incident-response procedures.

**Exit:** Product acceptance criteria in `prd.md` are satisfied or documented as known limitations.

## Dependency order

Identity/access control → trip model/workspace → destination and itinerary → money/records/collaboration → offline/rewards → launch hardening.

## Change control

If repository evidence conflicts with this plan, preserve working code and update the plan to fit. Any provider, schema, or authorization change should include migration/rollback and security impact notes.
