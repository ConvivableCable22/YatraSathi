# YatraSathi Project Overview

## At a glance

- **Name:** YatraSathi
- **Tagline:** *Raaste naye, saath apna*
- **Category:** India-focused travel-planning SaaS
- **Audience:** Anyone who finds planning a trip difficult: solo travelers, couples, families, and groups
- **Product surfaces:** Public marketing website and signed-in trip-planning application

## Purpose

YatraSathi brings destination inspiration, trip plans, day-by-day itineraries, maps, personal booking records, and expense tracking into one place. It helps travelers turn scattered ideas into a practical plan they can revisit and share.

## Product promise

Discover places across India, organize a trip around your needs, and keep plans and costs together—whether you plan alone or with companions.

## Core capabilities

1. Accounts, profile, and travel preferences.
2. Dashboard for trips, next steps, saved places, and progress.
3. Indian destination discovery, recommendations, ratings, and saved destinations.
4. Trip creation with destination, dates, travelers, budget in ₹, and preferences.
5. Day-by-day itinerary editing and estimated costs.
6. Maps and route information when available.
7. Personal records of external bookings; these are not reservations made by YatraSathi.
8. Expense tracking and budget review.
9. Private shared planning with owner and collaborators.
10. Offline access to saved trip essentials and visible sync state.
11. Destination-inspired themes and lightweight XP/badges.

## Product principles

- Reduce planning friction; let users fill details in over time.
- Keep trip tools together and plans easy to change.
- Keep trips private by default and explain collaboration access.
- Separate estimates from actual user-recorded expenses.
- Attribute and contextualize curated, community, and external information.
- Make the experience mobile-friendly, accessible, and useful with weak connectivity.
- Use playful progress without pressure or punishment.

## Important boundary

YatraSathi organizes travel information. It does not book, confirm, pay for, alter, or cancel reservations with external providers. Route details, opening information, availability, and costs may be estimates or change over time.

## Source documents

- `prd.md` — product requirements and acceptance criteria.
- `user-flow.md` — major user journeys and navigation model.
- `design-system.md` — brand and interface guidance.
- `tech-stack.md` — confirmed frontend + Cloudflare Workers / D1 / Better Auth / Queues architecture.
- `database-schema.md` — Cloudflare D1 (SQLite) schema, migrations, and planned trip tables.
- `api-spec.md` — Cloudflare Worker HTTP, queue, and scheduled endpoints.
- `security.md` — privacy and security requirements.
- `testing.md` — verification approach.
- `implementation-plan.md` and `tasks.md` — phased delivery plan and checklist.
- `gemini.md` and `AGENTS.md` — agent context and working instructions.

## Project state

These documents describe the intended product. They do not indicate that an application, backend, or marketing website already exists. Inspect the current repository before implementation and treat existing code and newer user direction as authoritative.
