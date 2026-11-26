# YatraSathi Testing and Verification Plan

## Principles

- Test behavior and user-visible outcomes, not implementation trivia.
- Prioritize privacy, trip ownership, money calculations, collaboration, offline sync, and booking-record disclosures.
- Keep tests deterministic; mock external maps/content/auth services at boundaries.
- Do not claim a check passed unless it was run and its result observed.

## Test layers

### Unit tests

- INR formatting and paise conversion.
- Budget totals, expense categories, and remaining-budget calculations.
- Date-range and itinerary-day rules.
- Validation schemas and role/permission predicates.
- Destination theme token selection and contrast-token constraints.
- Offline mutation conflict/idempotency logic where implemented.

### Integration tests

- Authenticated trip CRUD and membership checks.
- Itinerary day/item create, edit, ordering, and deletion behavior.
- Expense and booking-record persistence and authorization.
- Invitation creation, acceptance, expiry, revocation, and member removal.
- Data source attribution and destination-report flow.
- Worker/D1 authorization checks tested for owner, collaborator, unrelated authenticated user, and anonymous user.

### End-to-end tests

1. Sign up/sign in and create a trip from a destination.
2. Add itinerary items, rearrange them, and review a map/list.
3. Set a budget, record expenses, and verify totals.
4. Add a booking record and verify the non-reservation disclosure.
5. Invite a collaborator and verify access; remove them and verify access is revoked.
6. Save a trip offline, view essentials without connectivity, reconnect, and verify supported sync behavior.
7. Browse and save a destination, then start a trip from it.

### Accessibility and responsive checks

- Keyboard-only navigation and visible focus.
- Screen-reader names and form errors.
- WCAG 2.2 AA color contrast in base and destination themes.
- Reduced motion preference.
- Narrow mobile widths, tablet, and desktop layouts.
- Touch target size and no horizontal overflow on core flows.

### Security checks

- Cross-user trip access denied at API and database layers.
- Role escalation and owner spoofing rejected.
- Input validation, rate limiting, safe error responses, and invite-token protections.
- No secrets, booking references, or private notes exposed in logs or client payloads unnecessarily.

## Test data

- Use synthetic accounts, destinations, and booking references only.
- Include trips with no dates, different day counts, zero/empty expenses, over-budget spending, collaborators, and pending offline changes.
- Never copy real user trip or booking data into test environments.

## Release verification

Before a release, run the repository's focused tests, type checks, lint/build checks, end-to-end critical flows, and relevant security/accessibility checks according to project instructions. Record exact commands and results. If a check is unavailable or skipped, state that clearly; do not substitute a claim of success.
