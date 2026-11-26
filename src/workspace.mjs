/**
 * YatraSathi — Authenticated Workspace API Handlers (Cloudflare Workers + D1)
 *
 * Security invariants:
 * - Every route requires a verified Better Auth session user.
 * - All trip-scoped reads/writes verify ownership or trip_members membership in D1.
 * - All money values are stored and returned as integer paise.
 * - Client-supplied user IDs, roles, and aggregate totals are ignored.
 */

const VALID_TRIP_STATUSES = new Set(['planning', 'upcoming', 'active', 'completed', 'archived']);
const VALID_EXPENSE_CATEGORIES = new Set(['transport', 'stay', 'food', 'activities', 'other']);
const VALID_BOOKING_CATEGORIES = new Set(['transport', 'stay', 'activity', 'other']);
const VALID_PACING = new Set(['relaxed', 'active', 'slow']);
const VALID_BUDGET_PREF = new Set(['budget', 'balanced', 'comfort']);

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function unauthenticatedResponse() {
  return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: 'Authentication required.' }, 401);
}

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function getTripMembership(db, tripId, userId) {
  return db
    .prepare(
      `SELECT t.id, t.owner_id,
              CASE WHEN t.owner_id = ? THEN 'owner' ELSE tm.role END AS role
       FROM trips t
       LEFT JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = ?
       WHERE t.id = ? AND (t.owner_id = ? OR tm.user_id = ?)`
    )
    .bind(userId, userId, tripId, userId, userId)
    .first();
}

async function recordActivity(db, userId, tripId, actionType, summary, now = Date.now()) {
  const id = `act-${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT INTO activity_events (id, user_id, trip_id, action_type, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, tripId || null, actionType, String(summary).slice(0, 200), now)
    .run();
}

async function handleBootstrap(sessionUser, env) {
  const userId = sessionUser.id;
  const db = env.DB;

  const profileRow = await db
    .prepare(
      `SELECT display_name, phone, pacing, budget_pref, interests_json, updated_at
       FROM user_profiles WHERE user_id = ?`
    )
    .bind(userId)
    .first();

  const savedRows = await db
    .prepare(`SELECT destination_id FROM saved_destinations WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all();

  const tripRows = await db
    .prepare(
      `SELECT t.*,
              CASE WHEN t.owner_id = ? THEN 'Owner' ELSE 'Collaborator' END AS role,
              COALESCE((SELECT SUM(e.amount_paise) FROM expenses e WHERE e.trip_id = t.id), 0) AS spent_paise,
              COALESCE((SELECT SUM(i.estimated_cost_paise) FROM itinerary_items i WHERE i.trip_id = t.id), 0) AS estimated_paise,
              COALESCE((SELECT COUNT(*) FROM booking_notes b WHERE b.trip_id = t.id), 0) AS bookings_count
       FROM trips t
       LEFT JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = ?
       WHERE t.owner_id = ? OR tm.user_id = ?
       ORDER BY t.updated_at DESC`
    )
    .bind(userId, userId, userId, userId)
    .all();

  const tripIds = (tripRows.results || []).map(r => r.id);
  let itineraryItems = [];
  let expenses = [];
  let bookingNotes = [];

  if (tripIds.length > 0) {
    const placeholders = tripIds.map(() => '?').join(', ');

    const itRes = await db
      .prepare(
        `SELECT id, trip_id, day_key, time_label, duration_label, title, location, notes, estimated_cost_paise, sort_order, created_at
         FROM itinerary_items
         WHERE trip_id IN (${placeholders})
         ORDER BY sort_order ASC, created_at ASC`
      )
      .bind(...tripIds)
      .all();
    itineraryItems = (itRes.results || []).map(r => ({
      id: r.id,
      tripId: r.trip_id,
      dayKey: r.day_key,
      timeLabel: r.time_label,
      durationLabel: r.duration_label,
      title: r.title,
      location: r.location,
      notes: r.notes,
      estimatedCostPaise: Number(r.estimated_cost_paise) || 0,
      sortOrder: Number(r.sort_order) || 0
    }));

    const expRes = await db
      .prepare(
        `SELECT id, trip_id, category, amount_paise, spent_on, note, author_name, created_by, created_at
         FROM expenses
         WHERE trip_id IN (${placeholders})
         ORDER BY spent_on DESC, created_at DESC`
      )
      .bind(...tripIds)
      .all();
    expenses = (expRes.results || []).map(r => ({
      id: r.id,
      tripId: r.trip_id,
      category: r.category,
      amountPaise: Number(r.amount_paise) || 0,
      date: r.spent_on,
      note: r.note,
      author: r.author_name || 'Traveler'
    }));

    const bookRes = await db
      .prepare(
        `SELECT id, trip_id, category, provider, reference_code, notes, amount_paise, is_simulated, created_at
         FROM booking_notes
         WHERE trip_id IN (${placeholders})
         ORDER BY created_at DESC`
      )
      .bind(...tripIds)
      .all();
    bookingNotes = (bookRes.results || []).map(r => ({
      id: r.id,
      tripId: r.trip_id,
      category: r.category,
      provider: r.provider,
      reference: r.reference_code,
      notes: r.notes,
      amountPaise: Number(r.amount_paise) || 0,
      isSimulated: Boolean(r.is_simulated),
      createdAt: Number(r.created_at) || 0
    }));
  }

  const activityRes = await db
    .prepare(
      `SELECT id, trip_id, action_type, summary, created_at
       FROM activity_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 12`
    )
    .bind(userId)
    .all();

  const trips = (tripRows.results || []).map(r => ({
    id: r.id,
    name: r.name,
    destination: r.destination,
    startDate: r.start_date || '',
    endDate: r.end_date || '',
    travelers: Number(r.travelers) || 1,
    budget: Math.round((Number(r.budget_paise) || 0) / 100),
    budgetPaise: Number(r.budget_paise) || 0,
    spent: Math.round((Number(r.spent_paise) || 0) / 100),
    spentPaise: Number(r.spent_paise) || 0,
    estimated: Math.round((Number(r.estimated_paise) || 0) / 100),
    estimatedPaise: Number(r.estimated_paise) || 0,
    theme: r.theme || 'rajasthan',
    status: r.status || 'upcoming',
    selectedRouteId: r.selected_route_id || null,
    selectedPlaces: safeJsonParse(r.selected_places_json, []),
    bookingsCount: Number(r.bookings_count) || 0,
    role: r.role || 'Owner'
  }));

  return jsonResponse({
    ok: true,
    user: {
      id: userId,
      name: (profileRow && profileRow.display_name) || sessionUser.name || '',
      email: sessionUser.email || '',
      emailVerified: Boolean(sessionUser.emailVerified)
    },
    profile: {
      displayName: (profileRow && profileRow.display_name) || sessionUser.name || '',
      phone: (profileRow && profileRow.phone) || '',
      pacing: (profileRow && profileRow.pacing) || 'relaxed',
      budgetPref: (profileRow && profileRow.budget_pref) || 'balanced',
      interests: safeJsonParse(profileRow && profileRow.interests_json, ['heritage', 'food'])
    },
    savedDestinations: (savedRows.results || []).map(r => r.destination_id),
    trips,
    itineraryItems,
    expenses,
    bookingNotes,
    recentActivity: (activityRes.results || []).map(r => ({
      id: r.id,
      tripId: r.trip_id,
      actionType: r.action_type,
      text: r.summary,
      createdAt: Number(r.created_at)
    }))
  });
}

export async function handleWorkspaceRequest(request, env, sessionUser) {
  if (!sessionUser || !sessionUser.id) {
    return unauthenticatedResponse();
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;
  const userId = sessionUser.id;
  const now = Date.now();

  if (path === '/api/workspace/bootstrap' && method === 'GET') {
    return handleBootstrap(sessionUser, env);
  }

  if (path === '/api/workspace/profile' && method === 'PUT') {
    const body = await request.json().catch(() => ({}));
    const displayName = String(body.displayName || '').trim().slice(0, 80);
    if (!displayName) {
      return jsonResponse({ ok: false, code: 'INVALID_PROFILE', message: 'Display name is required.' }, 400);
    }
    const phone = String(body.phone || '').trim().slice(0, 32);
    const pacing = VALID_PACING.has(body.pacing) ? body.pacing : 'relaxed';
    const budgetPref = VALID_BUDGET_PREF.has(body.budgetPref) ? body.budgetPref : 'balanced';
    const interests = Array.isArray(body.interests)
      ? body.interests.map(i => String(i).trim()).filter(Boolean).slice(0, 10)
      : ['heritage', 'food'];

    await db.batch([
      db.prepare(`UPDATE user SET name = ?, updatedAt = ? WHERE id = ?`).bind(displayName, now, userId),
      db
        .prepare(
          `INSERT INTO user_profiles (user_id, display_name, phone, pacing, budget_pref, interests_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             display_name = excluded.display_name,
             phone = excluded.phone,
             pacing = excluded.pacing,
             budget_pref = excluded.budget_pref,
             interests_json = excluded.interests_json,
             updated_at = excluded.updated_at`
        )
        .bind(userId, displayName, phone, pacing, budgetPref, JSON.stringify(interests), now)
    ]);

    return jsonResponse({ ok: true, profile: { displayName, phone, pacing, budgetPref, interests } });
  }

  if (path === '/api/workspace/saved-destinations/toggle' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const destinationId = String(body.destinationId || '').trim().slice(0, 64);
    if (!destinationId) {
      return jsonResponse({ ok: false, code: 'INVALID_DESTINATION', message: 'Destination ID is required.' }, 400);
    }

    const existing = await db
      .prepare(`SELECT 1 FROM saved_destinations WHERE user_id = ? AND destination_id = ?`)
      .bind(userId, destinationId)
      .first();

    let saved = false;
    if (existing) {
      await db
        .prepare(`DELETE FROM saved_destinations WHERE user_id = ? AND destination_id = ?`)
        .bind(userId, destinationId)
        .run();
    } else {
      await db
        .prepare(`INSERT INTO saved_destinations (user_id, destination_id, created_at) VALUES (?, ?, ?)`)
        .bind(userId, destinationId, now)
        .run();
      saved = true;
    }

    const rows = await db
      .prepare(`SELECT destination_id FROM saved_destinations WHERE user_id = ? ORDER BY created_at DESC`)
      .bind(userId)
      .all();

    return jsonResponse({
      ok: true,
      saved,
      savedDestinations: (rows.results || []).map(r => r.destination_id)
    });
  }

  if (path === '/api/workspace/trips' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 120);
    const destination = String(body.destination || '').trim().slice(0, 120);
    if (!name || !destination) {
      return jsonResponse({ ok: false, code: 'INVALID_TRIP', message: 'Trip name and destination are required.' }, 400);
    }

    const startDate = body.startDate ? String(body.startDate).slice(0, 10) : null;
    const endDate = body.endDate ? String(body.endDate).slice(0, 10) : null;
    if (startDate && endDate && endDate < startDate) {
      return jsonResponse({ ok: false, code: 'INVALID_DATES', message: 'End date cannot precede start date.' }, 400);
    }

    const travelers = Math.max(1, Math.min(50, Math.round(Number(body.travelers) || 2)));
    const budgetPaise = Math.max(0, Math.round(Number(body.budgetPaise ?? (Number(body.budget || 0) * 100)) || 0));
    const theme = String(body.theme || 'rajasthan').slice(0, 32);
    const tripId = `trip-${crypto.randomUUID()}`;

    await db.batch([
      db
        .prepare(
          `INSERT INTO trips (id, owner_id, name, destination, start_date, end_date, travelers, budget_paise, currency, theme, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, 'upcoming', ?, ?)`
        )
        .bind(tripId, userId, name, destination, startDate, endDate, travelers, budgetPaise, theme, now, now),
      db
        .prepare(`INSERT INTO trip_members (trip_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`)
        .bind(tripId, userId, now)
    ]);

    await recordActivity(db, userId, tripId, 'trip_created', `Created trip "${name}"`, now);

    return jsonResponse({
      ok: true,
      trip: {
        id: tripId,
        name,
        destination,
        startDate: startDate || '',
        endDate: endDate || '',
        travelers,
        budget: Math.round(budgetPaise / 100),
        budgetPaise,
        spent: 0,
        spentPaise: 0,
        estimated: 0,
        estimatedPaise: 0,
        theme,
        status: 'upcoming',
        selectedRouteId: null,
        selectedPlaces: [],
        bookingsCount: 0,
        role: 'Owner'
      }
    }, 201);
  }

  const tripMatch = path.match(/^\/api\/workspace\/trips\/([^/]+)$/);
  if (tripMatch && method === 'PATCH') {
    const tripId = decodeURIComponent(tripMatch[1]);
    const membership = await getTripMembership(db, tripId, userId);
    if (!membership) {
      return jsonResponse({ ok: false, code: 'FORBIDDEN', message: 'Trip not found or access denied.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const existing = await db.prepare(`SELECT * FROM trips WHERE id = ?`).bind(tripId).first();
    if (!existing) {
      return jsonResponse({ ok: false, code: 'NOT_FOUND', message: 'Trip not found.' }, 404);
    }

    const name = body.name !== undefined ? String(body.name).trim().slice(0, 120) : existing.name;
    const destination = body.destination !== undefined ? String(body.destination).trim().slice(0, 120) : existing.destination;
    const startDate = body.startDate !== undefined ? (String(body.startDate).slice(0, 10) || null) : existing.start_date;
    const endDate = body.endDate !== undefined ? (String(body.endDate).slice(0, 10) || null) : existing.end_date;
    if (!name || !destination) {
      return jsonResponse({ ok: false, code: 'INVALID_TRIP', message: 'Trip name and destination cannot be empty.' }, 400);
    }
    if (startDate && endDate && endDate < startDate) {
      return jsonResponse({ ok: false, code: 'INVALID_DATES', message: 'End date cannot precede start date.' }, 400);
    }

    const travelers = body.travelers !== undefined
      ? Math.max(1, Math.min(50, Math.round(Number(body.travelers) || 1)))
      : existing.travelers;
    const budgetPaise = body.budgetPaise !== undefined
      ? Math.max(0, Math.round(Number(body.budgetPaise) || 0))
      : (body.budget !== undefined ? Math.max(0, Math.round(Number(body.budget) * 100)) : existing.budget_paise);
    const theme = body.theme !== undefined ? String(body.theme).slice(0, 32) : existing.theme;
    const status = body.status !== undefined && VALID_TRIP_STATUSES.has(body.status) ? body.status : existing.status;
    const selectedRouteId = body.selectedRouteId !== undefined
      ? (body.selectedRouteId ? String(body.selectedRouteId).slice(0, 64) : null)
      : existing.selected_route_id;
    const selectedPlacesJson = Array.isArray(body.selectedPlaces)
      ? JSON.stringify(body.selectedPlaces.map(p => String(p).slice(0, 64)).slice(0, 50))
      : existing.selected_places_json;

    await db
      .prepare(
        `UPDATE trips
         SET name = ?, destination = ?, start_date = ?, end_date = ?, travelers = ?, budget_paise = ?,
             theme = ?, status = ?, selected_route_id = ?, selected_places_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(name, destination, startDate, endDate, travelers, budgetPaise, theme, status, selectedRouteId, selectedPlacesJson, now, tripId)
      .run();

    await recordActivity(db, userId, tripId, 'trip_updated', `Updated trip "${name}"`, now);

    return jsonResponse({ ok: true });
  }

  const itCreateMatch = path.match(/^\/api\/workspace\/trips\/([^/]+)\/itinerary$/);
  if (itCreateMatch && method === 'POST') {
    const tripId = decodeURIComponent(itCreateMatch[1]);
    const membership = await getTripMembership(db, tripId, userId);
    if (!membership) {
      return jsonResponse({ ok: false, code: 'FORBIDDEN', message: 'Trip not found or access denied.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const title = String(body.title || '').trim().slice(0, 140);
    if (!title) {
      return jsonResponse({ ok: false, code: 'INVALID_ITEM', message: 'Activity title is required.' }, 400);
    }
    const dayKey = String(body.dayKey || 'day-1').slice(0, 32);
    const timeLabel = String(body.timeLabel || '10:00 AM').slice(0, 32);
    const durationLabel = String(body.durationLabel || '60 mins').slice(0, 32);
    const location = String(body.location || '').trim().slice(0, 140);
    const notes = String(body.notes || '').trim().slice(0, 400);
    const estimatedCostPaise = Math.max(0, Math.round(Number(body.estimatedCostPaise ?? (Number(body.estimatedCost || 0) * 100)) || 0));
    const itemId = `it-${crypto.randomUUID()}`;

    await db
      .prepare(
        `INSERT INTO itinerary_items (id, trip_id, day_key, time_label, duration_label, title, location, notes, estimated_cost_paise, sort_order, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .bind(itemId, tripId, dayKey, timeLabel, durationLabel, title, location, notes, estimatedCostPaise, userId, now)
      .run();

    await recordActivity(db, userId, tripId, 'itinerary_added', `Added "${title}" to itinerary`, now);

    return jsonResponse({
      ok: true,
      item: { id: itemId, tripId, dayKey, timeLabel, durationLabel, title, location, notes, estimatedCostPaise }
    }, 201);
  }

  const itDeleteMatch = path.match(/^\/api\/workspace\/trips\/([^/]+)\/itinerary\/([^/]+)$/);
  if (itDeleteMatch && method === 'DELETE') {
    const tripId = decodeURIComponent(itDeleteMatch[1]);
    const itemId = decodeURIComponent(itDeleteMatch[2]);
    const membership = await getTripMembership(db, tripId, userId);
    if (!membership) {
      return jsonResponse({ ok: false, code: 'FORBIDDEN', message: 'Trip not found or access denied.' }, 403);
    }

    await db.prepare(`DELETE FROM itinerary_items WHERE id = ? AND trip_id = ?`).bind(itemId, tripId).run();
    return jsonResponse({ ok: true });
  }

  const expCreateMatch = path.match(/^\/api\/workspace\/trips\/([^/]+)\/expenses$/);
  if (expCreateMatch && method === 'POST') {
    const tripId = decodeURIComponent(expCreateMatch[1]);
    const membership = await getTripMembership(db, tripId, userId);
    if (!membership) {
      return jsonResponse({ ok: false, code: 'FORBIDDEN', message: 'Trip not found or access denied.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const category = VALID_EXPENSE_CATEGORIES.has(body.category) ? body.category : 'other';
    const amountPaise = Math.round(Number(body.amountPaise) || 0);
    const note = String(body.note || '').trim().slice(0, 200);
    const spentOn = String(body.date || new Date(now).toISOString().split('T')[0]).slice(0, 10);
    if (amountPaise <= 0 || !note) {
      return jsonResponse({ ok: false, code: 'INVALID_EXPENSE', message: 'Positive amount and description are required.' }, 400);
    }

    const expId = `exp-${crypto.randomUUID()}`;
    const authorName = String(sessionUser.name || sessionUser.email || 'Traveler').slice(0, 80);

    await db
      .prepare(
        `INSERT INTO expenses (id, trip_id, created_by, author_name, category, amount_paise, currency, spent_on, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?)`
      )
      .bind(expId, tripId, userId, authorName, category, amountPaise, spentOn, note, now, now)
      .run();

    await recordActivity(db, userId, tripId, 'expense_logged', `Logged ₹${Math.round(amountPaise / 100).toLocaleString('en-IN')} (${note})`, now);

    return jsonResponse({
      ok: true,
      expense: { id: expId, tripId, category, amountPaise, date: spentOn, note, author: authorName }
    }, 201);
  }

  const expItemMatch = path.match(/^\/api\/workspace\/trips\/([^/]+)\/expenses\/([^/]+)$/);
  if (expItemMatch) {
    const tripId = decodeURIComponent(expItemMatch[1]);
    const expId = decodeURIComponent(expItemMatch[2]);
    const membership = await getTripMembership(db, tripId, userId);
    if (!membership) {
      return jsonResponse({ ok: false, code: 'FORBIDDEN', message: 'Trip not found or access denied.' }, 403);
    }

    if (method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const category = VALID_EXPENSE_CATEGORIES.has(body.category) ? body.category : 'other';
      const amountPaise = Math.round(Number(body.amountPaise) || 0);
      const note = String(body.note || '').trim().slice(0, 200);
      const spentOn = String(body.date || new Date(now).toISOString().split('T')[0]).slice(0, 10);
      if (amountPaise <= 0 || !note) {
        return jsonResponse({ ok: false, code: 'INVALID_EXPENSE', message: 'Positive amount and description are required.' }, 400);
      }

      await db
        .prepare(
          `UPDATE expenses SET category = ?, amount_paise = ?, spent_on = ?, note = ?, updated_at = ?
           WHERE id = ? AND trip_id = ?`
        )
        .bind(category, amountPaise, spentOn, note, now, expId, tripId)
        .run();

      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE') {
      await db.prepare(`DELETE FROM expenses WHERE id = ? AND trip_id = ?`).bind(expId, tripId).run();
      return jsonResponse({ ok: true });
    }
  }

  const bookCreateMatch = path.match(/^\/api\/workspace\/trips\/([^/]+)\/booking-notes$/);
  if (bookCreateMatch && method === 'POST') {
    const tripId = decodeURIComponent(bookCreateMatch[1]);
    const membership = await getTripMembership(db, tripId, userId);
    if (!membership) {
      return jsonResponse({ ok: false, code: 'FORBIDDEN', message: 'Trip not found or access denied.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const category = VALID_BOOKING_CATEGORIES.has(body.category) ? body.category : 'other';
    const provider = String(body.provider || '').trim().slice(0, 140);
    if (!provider) {
      return jsonResponse({ ok: false, code: 'INVALID_BOOKING_NOTE', message: 'Provider or title is required.' }, 400);
    }
    const reference = String(body.reference || '').trim().slice(0, 64);
    const notes = String(body.notes || '').trim().slice(0, 300);
    const amountPaise = Math.max(0, Math.round(Number(body.amountPaise ?? (Number(body.amount || 0) * 100)) || 0));
    const isSimulated = body.isSimulated ? 1 : 0;
    const noteId = `bnote-${crypto.randomUUID()}`;

    await db
      .prepare(
        `INSERT INTO booking_notes (id, trip_id, user_id, category, provider, reference_code, notes, amount_paise, is_simulated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(noteId, tripId, userId, category, provider, reference, notes, amountPaise, isSimulated, now)
      .run();

    await recordActivity(db, userId, tripId, 'booking_note_saved', `Saved booking note "${provider}"`, now);

    return jsonResponse({
      ok: true,
      bookingNote: {
        id: noteId,
        tripId,
        category,
        provider,
        reference,
        notes,
        amountPaise,
        isSimulated: Boolean(isSimulated),
        createdAt: now
      }
    }, 201);
  }

  const bookDelMatch = path.match(/^\/api\/workspace\/trips\/([^/]+)\/booking-notes\/([^/]+)$/);
  if (bookDelMatch && method === 'DELETE') {
    const tripId = decodeURIComponent(bookDelMatch[1]);
    const noteId = decodeURIComponent(bookDelMatch[2]);
    const membership = await getTripMembership(db, tripId, userId);
    if (!membership) {
      return jsonResponse({ ok: false, code: 'FORBIDDEN', message: 'Trip not found or access denied.' }, 403);
    }

    await db.prepare(`DELETE FROM booking_notes WHERE id = ? AND trip_id = ?`).bind(noteId, tripId).run();
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, code: 'NOT_FOUND', message: 'Workspace endpoint not found.' }, 404);
}
