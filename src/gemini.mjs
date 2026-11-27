/**
 * YatraSathi — Secure Server-Side Gemini AI Itinerary Generator (Free Tier Only)
 *
 * Security & privacy invariants:
 * - Uses env.GEMINI_API_KEY exclusively on the server (never logged or returned).
 * - Uses free-tier gemini-2.5-flash only (no paid fallback, no billing enabled).
 * - Sends ONLY non-PII trip inputs (state, destination labels, duration, preferences, allowed place IDs).
 * - Never trusts coordinates from Gemini; maps every stop to YatraSathi's verified place catalog.
 */

import {
  findVerifiedPlaceById,
  getAllowedPlacesForSelection,
  validateStateAndDestinations
} from './destinations.mjs';

const GEMINI_FREE_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          day: { type: 'INTEGER' },
          stops: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                placeId: { type: 'STRING' },
                timeLabel: { type: 'STRING' },
                durationLabel: { type: 'STRING' },
                notes: { type: 'STRING' }
              },
              required: ['placeId', 'timeLabel', 'durationLabel', 'notes']
            }
          }
        },
        required: ['day', 'stops']
      }
    }
  },
  required: ['days']
};

export async function generateGeminiItinerary({ stateKey, destinationIds, durationDays, preferences = {} }, env, deps = {}) {
  if (!env || !env.GEMINI_API_KEY) {
    const err = new Error('Gemini AI itinerary generation is not configured on the Worker yet.');
    err.code = 'GEMINI_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  const validation = validateStateAndDestinations(stateKey, destinationIds);
  if (!validation.ok) {
    const err = new Error(validation.message);
    err.code = validation.code;
    err.status = 400;
    throw err;
  }

  const daysCount = Math.max(1, Math.min(14, Math.round(Number(durationDays) || 3)));
  const allowedPlaces = getAllowedPlacesForSelection(stateKey, validation.destinationIds);
  if (allowedPlaces.length === 0) {
    const err = new Error('No curated places are available for the selected destinations.');
    err.code = 'NO_PLACES_AVAILABLE';
    err.status = 400;
    throw err;
  }

  const pacing = ['relaxed', 'active', 'slow'].includes(preferences.pacing) ? preferences.pacing : 'relaxed';
  const budgetPref = ['budget', 'balanced', 'comfort'].includes(preferences.budgetPref) ? preferences.budgetPref : 'balanced';
  const interests = Array.isArray(preferences.interests)
    ? preferences.interests.map(i => String(i).trim().slice(0, 24)).filter(Boolean).slice(0, 5)
    : ['heritage', 'food'];

  // Non-PII prompt only
  const promptPayload = {
    state: validation.stateDef.label,
    destinations: validation.destinationIds.map(id => validation.stateDef.destinations[id].label),
    durationDays: daysCount,
    preferences: { pacing, budgetPref, interests },
    allowedPlaces: allowedPlaces.map(p => ({
      placeId: p.placeId,
      destination: p.destinationLabel,
      title: p.title,
      location: p.location
    }))
  };

  const systemPrompt = [
    'You are a travel itinerary organizer for India.',
    `Create a ${daysCount}-day itinerary covering the selected destinations in ${validation.stateDef.label}.`,
    'RULES:',
    '1. Use ONLY placeId values from allowedPlaces. Never invent places, IDs, or coordinates.',
    '2. Return exactly the requested number of days (day 1 through day N).',
    '3. Do not include live prices, real-time transit times, or availability claims.',
    '4. If there are fewer unique places than needed for all days, leave extra days with an empty stops array rather than repeating or inventing places.'
  ].join('\n');

  const fetchImpl = deps.fetch || fetch;
  const resp = await fetchImpl(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nTrip request:\n${JSON.stringify(promptPayload)}` }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA
      }
    })
  });

  if (resp.status === 429) {
    const err = new Error('Gemini free-tier quota or rate limit reached. Please retry in a minute or plan manually.');
    err.code = 'GEMINI_QUOTA_EXCEEDED';
    err.status = 429;
    throw err;
  }

  const rawJson = await resp.json().catch(() => null);
  if (!resp.ok || !rawJson) {
    const apiStatus = rawJson?.error?.status || '';
    if (apiStatus === 'RESOURCE_EXHAUSTED') {
      const err = new Error('Gemini free-tier quota or rate limit reached. Please retry in a minute or plan manually.');
      err.code = 'GEMINI_QUOTA_EXCEEDED';
      err.status = 429;
      throw err;
    }
    const err = new Error('Gemini itinerary service is temporarily unavailable. Please try again or plan manually.');
    err.code = 'GEMINI_UPSTREAM_ERROR';
    err.status = 502;
    throw err;
  }

  const textPart = rawJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(textPart);
  } catch {
    const err = new Error('Gemini returned an invalid itinerary format. Please try again.');
    err.code = 'GEMINI_INVALID_OUTPUT';
    err.status = 502;
    throw err;
  }

  if (!parsed || !Array.isArray(parsed.days)) {
    const err = new Error('Gemini itinerary output is missing day entries.');
    err.code = 'GEMINI_INVALID_OUTPUT';
    err.status = 502;
    throw err;
  }

  const dayMap = new Map();
  for (const entry of parsed.days) {
    const d = Math.round(Number(entry?.day));
    if (d >= 1 && d <= daysCount && !dayMap.has(d)) {
      dayMap.set(d, Array.isArray(entry.stops) ? entry.stops : []);
    }
  }

  const items = [];
  let unmatchedCount = 0;

  for (let dayNum = 1; dayNum <= daysCount; dayNum++) {
    const dayKey = `day-${dayNum}`;
    const rawStops = dayMap.get(dayNum) || [];
    let addedForDay = 0;

    for (const rawStop of rawStops.slice(0, 5)) {
      const verified = findVerifiedPlaceById(stateKey, validation.destinationIds, rawStop?.placeId);
      if (!verified || !Number.isFinite(verified.lat) || !Number.isFinite(verified.lng)) {
        unmatchedCount++;
        continue;
      }
      items.push({
        placeId: verified.placeId,
        dayKey,
        timeLabel: String(rawStop.timeLabel || verified.timeLabel).trim().slice(0, 32) || verified.timeLabel,
        durationLabel: String(rawStop.durationLabel || verified.durationLabel).trim().slice(0, 32) || verified.durationLabel,
        title: verified.title,
        location: verified.location,
        notes: `AI suggestion (verify locally): ${String(rawStop.notes || verified.notes).trim().slice(0, 280)}`,
        estimatedCostPaise: verified.estimatedCostPaise,
        lat: verified.lat,
        lng: verified.lng
      });
      addedForDay++;
    }

    if (addedForDay === 0) {
      const destLabel = validation.stateDef.destinations[validation.destinationIds[(dayNum - 1) % validation.destinationIds.length]].label;
      items.push({
        placeId: null,
        dayKey,
        timeLabel: '10:00 AM',
        durationLabel: 'Flexible',
        title: `Open Exploration Day — ${destLabel}`,
        location: `${destLabel}, ${validation.stateDef.label}`,
        notes: 'AI suggestion: open day for rest or adding your own custom stops.',
        estimatedCostPaise: 0,
        lat: null,
        lng: null
      });
    }
  }

  return {
    items,
    unmatchedCount,
    model: GEMINI_FREE_MODEL,
    durationDays: daysCount
  };
}

const TWO_OPTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    option1: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        summary: { type: 'STRING' },
        days: RESPONSE_SCHEMA.properties.days
      },
      required: ['title', 'summary', 'days']
    },
    option2: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        summary: { type: 'STRING' },
        days: RESPONSE_SCHEMA.properties.days
      },
      required: ['title', 'summary', 'days']
    }
  },
  required: ['option1', 'option2']
};

export async function generateGeminiJaipurOptions({ selectedPlaceIds, durationDays, preferences = {} }, env, deps = {}) {
  if (!env || !env.GEMINI_API_KEY) {
    const err = new Error('Gemini AI itinerary generation is not configured on the Worker yet.');
    err.code = 'GEMINI_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  const allJaipur = getAllowedPlacesForSelection('rajasthan', ['jaipur']);
  const requestedIds = Array.isArray(selectedPlaceIds)
    ? [...new Set(selectedPlaceIds.map(id => String(id || '').trim()).filter(Boolean))]
    : [];
  const selectedPlaces = allJaipur.filter(p => requestedIds.includes(p.placeId));

  if (selectedPlaces.length === 0 || selectedPlaces.length !== requestedIds.length) {
    const err = new Error('Select one or more supported Jaipur places before generating an itinerary.');
    err.code = 'INVALID_PLACES';
    err.status = 400;
    throw err;
  }

  const selectedMap = new Map(selectedPlaces.map(p => [p.placeId, p]));
  const daysCount = Math.max(1, Math.min(14, Math.round(Number(durationDays) || 3)));
  const pacing = ['relaxed', 'active', 'slow'].includes(preferences.pacing) ? preferences.pacing : 'relaxed';
  const budgetPref = ['budget', 'balanced', 'comfort'].includes(preferences.budgetPref) ? preferences.budgetPref : 'balanced';
  const interests = Array.isArray(preferences.interests)
    ? preferences.interests.map(i => String(i).trim().slice(0, 24)).filter(Boolean).slice(0, 5)
    : ['heritage'];

  const promptPayload = {
    destination: 'Jaipur, Rajasthan',
    durationDays: daysCount,
    preferences: { pacing, budgetPref, interests },
    selectedPlaces: selectedPlaces.map(p => ({
      placeId: p.placeId,
      title: p.title,
      location: p.location
    }))
  };

  const systemPrompt = [
    'You are a travel itinerary organizer for Jaipur, India.',
    `Create TWO distinct ${daysCount}-day itinerary suggestions using ONLY the user's selectedPlaces:`,
    '- option1: Balanced ordering suited to the requested pace and interests.',
    '- option2: A different ordering or pace (for example, early-morning fort focus or compact grouping).',
    'STRICT RULES:',
    '1. Use ONLY placeId values from selectedPlaces. Never add unselected places, invent IDs, or output coordinates.',
    '2. Include days 1 through N in each option. Leave extra days with an empty stops array rather than inventing places.',
    '3. Do not invent live prices, travel times, or opening hours.'
  ].join('\n');

  const fetchImpl = deps.fetch || fetch;
  const resp = await fetchImpl(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nTrip request:\n${JSON.stringify(promptPayload)}` }]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 3072,
        responseMimeType: 'application/json',
        responseSchema: TWO_OPTION_SCHEMA
      }
    })
  });

  if (resp.status === 429) {
    const err = new Error('Gemini free-tier quota or rate limit reached. Please retry in a minute or use Customize Your Own.');
    err.code = 'GEMINI_QUOTA_EXCEEDED';
    err.status = 429;
    throw err;
  }

  const rawJson = await resp.json().catch(() => null);
  if (!resp.ok || !rawJson) {
    const apiStatus = rawJson?.error?.status || '';
    if (apiStatus === 'RESOURCE_EXHAUSTED') {
      const err = new Error('Gemini free-tier quota or rate limit reached. Please retry in a minute or use Customize Your Own.');
      err.code = 'GEMINI_QUOTA_EXCEEDED';
      err.status = 429;
      throw err;
    }
    const err = new Error('Gemini itinerary service is temporarily unavailable. Please retry or use Customize Your Own.');
    err.code = 'GEMINI_UPSTREAM_ERROR';
    err.status = 502;
    throw err;
  }

  const textPart = rawJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let parsed;
  try {
    parsed = JSON.parse(textPart);
  } catch {
    const err = new Error('Gemini returned an invalid itinerary format. Please try again.');
    err.code = 'GEMINI_INVALID_OUTPUT';
    err.status = 502;
    throw err;
  }

  if (!parsed || !parsed.option1 || !parsed.option2) {
    const err = new Error('Gemini itinerary output is missing Option 1 or Option 2.');
    err.code = 'GEMINI_INVALID_OUTPUT';
    err.status = 502;
    throw err;
  }

  let unmatchedCount = 0;

  function validateOption(rawOpt, optId, fallbackTitle) {
    const dayMap = new Map();
    const rawDays = Array.isArray(rawOpt.days) ? rawOpt.days : [];
    for (const entry of rawDays) {
      const d = Math.round(Number(entry?.day));
      if (d >= 1 && d <= daysCount && !dayMap.has(d)) {
        dayMap.set(d, Array.isArray(entry.stops) ? entry.stops : []);
      }
    }

    const items = [];
    for (let dayNum = 1; dayNum <= daysCount; dayNum++) {
      const dayKey = `day-${dayNum}`;
      const rawStops = dayMap.get(dayNum) || [];
      let addedForDay = 0;

      for (const rawStop of rawStops.slice(0, 5)) {
        const verified = selectedMap.get(String(rawStop?.placeId || '').trim());
        if (!verified || !Number.isFinite(verified.lat) || !Number.isFinite(verified.lng)) {
          unmatchedCount++;
          continue;
        }
        items.push({
          placeId: verified.placeId,
          dayKey,
          timeLabel: String(rawStop.timeLabel || verified.timeLabel).trim().slice(0, 32) || verified.timeLabel,
          durationLabel: String(rawStop.durationLabel || verified.durationLabel).trim().slice(0, 32) || verified.durationLabel,
          title: verified.title,
          location: verified.location,
          notes: `AI suggestion (verify locally): ${String(rawStop.notes || verified.notes).trim().slice(0, 260)}`,
          estimatedCostPaise: verified.estimatedCostPaise,
          lat: verified.lat,
          lng: verified.lng
        });
        addedForDay++;
      }

      if (addedForDay === 0) {
        items.push({
          placeId: null,
          dayKey,
          timeLabel: '10:00 AM',
          durationLabel: 'Flexible',
          title: 'Open Exploration Day — Jaipur',
          location: 'Jaipur, Rajasthan',
          notes: 'AI suggestion: open day for rest or adding your own custom stops.',
          estimatedCostPaise: 0,
          lat: null,
          lng: null
        });
      }
    }

    return {
      id: optId,
      title: String(rawOpt.title || fallbackTitle).trim().slice(0, 80) || fallbackTitle,
      summary: String(rawOpt.summary || 'AI-generated Jaipur itinerary suggestion.').trim().slice(0, 200),
      items
    };
  }

  const option1 = validateOption(parsed.option1, 'option1', 'Option 1 — AI Balanced Plan');
  const option2 = validateOption(parsed.option2, 'option2', 'Option 2 — AI Alternative Pace');

  return {
    options: [option1, option2],
    unmatchedCount,
    model: GEMINI_FREE_MODEL,
    durationDays: daysCount
  };
}
