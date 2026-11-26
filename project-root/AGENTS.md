# Agent Instructions for YatraSathi

## Read first

Before making changes, inspect the current repository and read:

1. `gemini.md` for product context and efficient-work guidance.
2. `prd.md` for requirements and acceptance criteria.
3. The relevant focused document: `user-flow.md`, `design-system.md`, `tech-stack.md`, `database-schema.md`, `api-spec.md`, `security.md`, `testing.md`, `implementation-plan.md`, or `tasks.md`.
4. Any existing local instructions and code conventions in the affected area.

## Authority and conflict handling

- The latest explicit user instruction takes precedence.
- Existing working code and repository conventions (Cloudflare Workers + D1 + Better Auth + Queues) take precedence over any older planning notes unless a migration is requested.
- `prd.md` is the product baseline; focused documents add implementation detail. If documents conflict, do not silently invent a resolution—follow current user direction and update the affected docs when asked.
- This documentation describes the intended product. Do not assume a feature, provider, pricing model, or website has already been implemented.

## Product invariants

- YatraSathi plans trips within India for solo travelers, couples, families, and groups.
- Trips are private by default. Enforce access on the server and data layer, not only in the UI.
- Use INR (₹); never calculate money with binary floating point.
- Keep estimated costs separate from actual user-entered expenses.
- A booking record is a personal note, not an external reservation or confirmation.
- Clearly represent data sources, estimates, offline state, and synchronization state.
- Destination themes must preserve contrast, readable text, and consistent navigation.
- The website can use contemporary Gen Z visual expression while remaining polished, accessible, and trustworthy; avoid forced slang and clutter.

## Efficient implementation workflow

1. Restate the requested outcome and identify the smallest affected area.
2. Inspect relevant files and callers before editing; do not assume the stack.
3. For localized changes, proceed directly. For cross-cutting or risky changes, outline a compact plan and identify dependencies.
4. Preserve existing architecture and patterns. Avoid unrelated refactors, new dependencies, or generated boilerplate without a clear need.
5. Implement the end-to-end behavior, including loading, empty, error, mobile, and accessibility states relevant to the change.
6. Keep authorization and validation server-side. Never trust client-provided ownership, roles, or prices.
7. Update focused documentation and `tasks.md` when requested or when implementation materially changes product behavior.
8. Follow `gemini.md` for verification expectations. Do not add or run tests/builds/formatters unless the user requests checks. If checks are requested, run focused checks and report observed output accurately.
9. Finish with a concise summary of files changed, behavior, checks actually performed, and unresolved decisions.

## Security and data handling

- Do not commit secrets, tokens, production data, or real booking references.
- Treat profiles, precise trip dates/locations, booking references, and notes as sensitive personal data.
- Check membership on every trip-scoped server operation and revoke access promptly.
- Use parameterized queries and validated inputs; return generic client errors without stack traces.
- Minimize personal data in logs, analytics, and external provider requests.
- Review `security.md` before changing authentication, collaboration, offline storage, or data retention.

## UI and content

- Follow `design-system.md`; use semantic tokens instead of scattered hard-coded colors.
- Make mobile layouts a first-class path, not a post-build adaptation.
- Provide keyboard focus, semantic labels, sufficient contrast, reduced-motion support, and text alternatives.
- Avoid fabricated live prices, ratings, route times, availability, testimonials, or provider integrations.
- Mark community content and estimates clearly; preserve the booking-record disclosure.

## Scope discipline

- Do not build the marketing website or application merely because these documents exist; implementation requires an explicit user request.
- Do not add payments, external booking, group settlement, public trip sharing, or international coverage unless the user expands scope.
- If an external provider or major technical decision is unresolved, use a narrow adapter or placeholder interface where practical and document the decision rather than inventing credentials or making unsupported claims.
