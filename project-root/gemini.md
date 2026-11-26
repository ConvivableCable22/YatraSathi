# YatraSathi — Antigravity Project Guide

## Product context

**Name:** YatraSathi  
**Tagline:** *Raaste naye, saath apna*  
**Product:** A travel-planning SaaS for trips within India.

YatraSathi helps people who struggle to plan trips bring destination discovery, day-by-day itineraries, maps and routes, booking records, and expense tracking into one trip workspace. It should serve solo travelers, couples, families, and groups. Its tone is warm, clear, and encouraging. Destination-inspired accents (for example, coastal colors for Goa or Kerala and desert tones for Rajasthan) add personality while preserving readability.

The product organizes travel plans. Booking records are personal notes; YatraSathi does not make, confirm, pay for, change, or cancel external reservations.

## Product principles

- Make a useful trip plan possible with only a few required details; let users fill in the rest later.
- Keep itinerary, map, booking records, budget, expenses, collaborators, and progress together under each trip.
- Support personal and shared planning. Trips are private by default; the trip owner manages invitations and access.
- Make saved trip essentials available offline. Clearly show sync status and handle conflicting edits safely.
- Combine curated destination information, community contributions, and external data where permitted. Identify sources and freshness when practical.
- Label estimates clearly and distinguish planned costs from recorded expenses.
- Use INR (₹) for trip budgets and expenses.
- Use XP, badges, and celebrations gently. Do not punish users for changing plans or leaving tasks incomplete.
- Keep the experience accessible, mobile-friendly, and understandable to people with varied travel-planning experience.
- **Website visual direction:** Use a contemporary Gen Z style—bold editorial typography, expressive destination photography, vibrant but intentional colors, playful stickers or micro-interactions, and confident conversational copy. Keep layouts polished and easy to scan, prioritize mobile, preserve accessibility and trust, and avoid clutter, forced slang, or trend effects that compete with trip planning.

## Main product capabilities

1. Accounts, profiles, and travel preferences.
2. Dashboard with trips, planning progress, saved destinations, and useful next actions.
3. Indian destination search, browsing, filters, destination details, recommendations, and saved places.
4. Trip creation and editing: name, destination or route, dates, traveler count, budget, and preferences.
5. Day-by-day itinerary editing: add, remove, rearrange, and annotate activities; show estimated costs when available.
6. Maps and route/distance information where data is available, with estimates labeled as such.
7. Personal booking records for transport, stays, activities, and other reservations.
8. Expense tracking by amount, category, date, and optional note; attribute entries to their author on shared trips.
9. Shared trip collaboration with an owner and collaborators; no public sharing by default.
10. Offline access to saved itinerary, notes, booking records, and expense summaries, with clear synchronization status.
11. Destination themes and lightweight planning milestones, XP, and badges.

Keep the first experience cohesive and simple. Advanced group settlement, multi-stop optimization, and extensive offline editing can wait unless a specific request prioritizes them.

## Website boundary

The public SaaS website and the signed-in trip-planning product are separate experiences. Do not build or modify either unless the user explicitly asks for implementation. If asked to build the website, use the existing project stack and patterns, and include a clear product explanation, features, destination inspiration, sign-up/sign-in entry points, and accurate booking-record disclosures. Do not invent live data, pricing, integrations, or product capabilities.

## How to work efficiently in this project

- Start by checking the repository structure, existing instructions, and the files directly related to the request. Do not assume a framework or generate boilerplate before confirming the stack.
- Identify the requested outcome and the smallest set of files needed. For small, localized changes, make the change directly; use a brief plan for changes spanning components or data flows.
- Follow established naming, styling, accessibility, dependency, and architecture conventions. Avoid unrelated refactors and unnecessary dependencies.
- Reuse existing components and data models where suitable. Keep trip data ownership, collaborator permissions, INR amounts, estimate-vs-actual distinctions, and offline/sync states explicit when relevant.
- For UI work, consider narrow/mobile layouts, loading and empty states, errors, keyboard use, screen readers, and color contrast across destination themes.
- Do not add or run tests, builds, formatters, or other verification commands unless the user asks for checks. If asked to verify, choose focused checks for the changed area and report the observed results accurately.
- Before finishing, summarize what changed, which files were touched, and any checks actually performed. State clearly when something was not verified.
- Ask a concise question only when a missing product decision blocks safe or useful progress. Otherwise, choose a sensible default and state it.

## Data and trust requirements

- Treat trip, booking, profile, and expense data as private user data.
- Do not expose a trip unless its owner explicitly shares it.
- Clearly mark destination facts, community content, external data, and estimates according to their source when practical.
- Do not imply that routes, costs, opening information, ratings, or availability are guaranteed or current unless the data source supports that claim.
- Preserve clear ownership and attribution for edits and expense entries in collaborative trips.

## Current project state

This guide records the product direction. It does not mean the application or marketing website has been implemented. Inspect the workspace and any newer project instructions before making changes; user requests and current repository evidence take precedence over assumptions in this guide.
