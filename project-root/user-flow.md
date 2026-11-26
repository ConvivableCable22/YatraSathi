# YatraSathi User Flows

## Navigation model

### Public website

Home → How it works / Features / Destinations / About / Pricing → Sign up or Sign in

Pricing is informational until a pricing model is confirmed. Do not claim unavailable features.

### Signed-in application

Dashboard → Discover / Saved destinations / Trips / Profile & settings

Trip workspace → Overview / Itinerary / Map / Bookings / Expenses / People / Progress

On mobile, keep the active trip and primary actions easy to reach; use a compact navigation pattern that preserves clear labels.

## Flow 1: First visit and account creation

1. Visitor lands on the public home page and understands the product promise and booking-record limitation.
2. Visitor selects **Start planning** or **Sign up**.
3. User creates an account or signs in.
4. New user reaches a useful dashboard with **Create a trip** and **Explore destinations** as primary choices.
5. Preference collection is optional and can be completed later.

**States to design:** validation error, account already exists, recovery, loading, success, and empty dashboard.

## Flow 2: Discover a destination

1. User opens Discover.
2. User searches or browses destinations in India.
3. User optionally filters by region, interests, season, trip duration, or budget where supported.
4. User opens a destination detail page and reviews highlights, practical notes, ratings, source/freshness, and suggested places.
5. User saves the destination or selects **Plan a trip here**.

**States to design:** no results, unavailable data, stale/estimated information, and content report action.

## Flow 3: Create a trip

1. User starts from the dashboard or a destination page.
2. User enters a trip name, destination, dates, traveler count, budget in ₹, and optional preferences.
3. Only essential fields are required; incomplete planning details can be added later.
4. User creates the trip.
5. Trip overview shows destination theme and paths to itinerary, map, bookings, expenses, and people.

**States to design:** invalid date range, missing required values, save failure, and successful creation.

## Flow 4: Build an itinerary

1. User opens the trip itinerary.
2. User selects a day and adds an activity/place, manually or from recommendations.
3. User can add time, duration, location, notes, and estimated cost.
4. User rearranges, edits, or removes items.
5. Daily plans and available estimated totals update.
6. User can open the map or location list to review geography.

**States to design:** empty day, unavailable recommendation, offline read-only state (modifications require connectivity), and crowded day hint.

## Flow 5: Track budget and expenses

1. User sets or edits an overall budget in ₹.
2. User adds an expense with amount, category, date, and optional note.
3. Shared-trip entries record the author.
4. Trip view shows recorded total and remaining budget.
5. Estimates remain visually distinct from actual expense entries.

**States to design:** no budget, no expenses, invalid/zero amount, offline read-only view (new expenses require connectivity), and over-budget status without shaming language.

## Flow 6: Save booking details

1. User selects **Add booking record** and chooses transport, stay, activity, or other.
2. User enters provider, dates, reference, amount, and notes as relevant.
3. Before saving, the interface explains this is a personal record and does not confirm or modify the external reservation.
4. User can later view, edit, or delete the record.

## Flow 7: Invite collaborators

1. Trip owner opens People and chooses Invite.
2. Owner shares an invitation using a supported channel.
3. Invitee authenticates and accepts.
4. Collaborator can view/edit shared trip planning details; owner retains invitation and access control.
5. Expense records show who added them.
6. Owner can revoke access; revoked users can no longer access the trip.

**States to design:** invalid/expired invite, already joined, revoked access, and unauthorized access.

## Flow 8: Offline access (Read-only)

1. While online, user chooses **Save trip offline**.
2. App caches an essential trip snapshot (itinerary, notes, booking records, and expense summary) and indicates what is saved along with the last sync timestamp.
3. Offline, user can view itinerary, notes, booking records, and expense summary in read-only mode.
4. If user attempts to add or edit an item, the interface indicates that connectivity is required for updates.
5. User can choose to clear cached offline data at any time, and cached data is purged on sign out.
6. Offline editing, mutation queues, and conflict resolution are deferred to a later release.

## Flow 9: Progress and return

1. User completes meaningful planning milestones.
2. App updates progress and may award XP/badges with a short, dismissible celebration.
3. User returns to dashboard to continue an upcoming trip or review a past one.

Progress is retained if the user changes plans. Users are never required to complete all suggestions.
