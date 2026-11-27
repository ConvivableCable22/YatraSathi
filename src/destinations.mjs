/**
 * YatraSathi — Curated Indian States, Destinations & Landmarks Catalog
 * Used by the Worker for state/destination validation, verified coordinates, and itinerary generation.
 * Note: Estimated costs and coordinates are reference data only (never live prices or availability).
 */

export const STATE_CATALOG = {
  rajasthan: {
    label: 'Rajasthan',
    destinations: {
      jaipur: {
        label: 'Jaipur',
        places: [
          { id: 'raj-jai-1', title: 'Heritage Haveli Check-in (Bani Park)', timeLabel: '09:30 AM', durationLabel: '45 mins', location: 'Bani Park, Jaipur', estimatedCostPaise: 0, notes: 'Base check-in & morning chai.', lat: 26.9260, lng: 75.7920 },
          { id: 'raj-jai-2', title: 'City Palace & Jantar Mantar', timeLabel: '10:45 AM', durationLabel: '150 mins', location: 'Old City, Jaipur', estimatedCostPaise: 120000, notes: 'Estimated entry reference; verify hours locally.', lat: 26.9258, lng: 75.8237 },
          { id: 'raj-jai-3', title: 'Hawa Mahal & Bapu Bazaar', timeLabel: '02:00 PM', durationLabel: '105 mins', location: 'Sireh Deori, Jaipur', estimatedCostPaise: 45000, notes: 'Iconic facade & local craft lanes.', lat: 26.9239, lng: 75.8267 },
          { id: 'raj-jai-4', title: 'Amer Fort & Panna Meena Stepwell', timeLabel: '09:00 AM', durationLabel: '150 mins', location: 'Amer, Jaipur', estimatedCostPaise: 80000, notes: 'Hilltop fort & historic stepwell.', lat: 26.9855, lng: 75.8513 },
          { id: 'raj-jai-5', title: 'Nahargarh Fort Sunset', timeLabel: '04:30 PM', durationLabel: '120 mins', location: 'Aravalli Hills, Jaipur', estimatedCostPaise: 35000, notes: 'Panoramic twilight city views.', lat: 26.9373, lng: 75.8155 }
        ]
      },
      jodhpur: {
        label: 'Jodhpur',
        places: [
          { id: 'raj-jod-1', title: 'Mehrangarh Fort & Museum', timeLabel: '09:30 AM', durationLabel: '150 mins', location: 'Pachetia Hill, Jodhpur', estimatedCostPaise: 60000, notes: 'Citadel overlooking the Blue City.', lat: 26.2980, lng: 73.0185 },
          { id: 'raj-jod-2', title: 'Jaswant Thada', timeLabel: '12:30 PM', durationLabel: '60 mins', location: 'Near Mehrangarh, Jodhpur', estimatedCostPaise: 15000, notes: 'Marble cenotaph & garden.', lat: 26.3042, lng: 73.0252 },
          { id: 'raj-jod-3', title: 'Clock Tower & Sardar Market', timeLabel: '04:00 PM', durationLabel: '90 mins', location: 'Old City, Jodhpur', estimatedCostPaise: 30000, notes: 'Spice stalls & local snacks.', lat: 26.2949, lng: 73.0243 },
          { id: 'raj-jod-4', title: 'Toorji Ka Jhalra Stepwell', timeLabel: '06:00 PM', durationLabel: '60 mins', location: 'Makrana Mohalla, Jodhpur', estimatedCostPaise: 0, notes: 'Restored 18th-century stepwell.', lat: 26.2962, lng: 73.0235 }
        ]
      },
      jaisalmer: {
        label: 'Jaisalmer',
        places: [
          { id: 'raj-jsm-1', title: 'Jaisalmer Fort (Sonar Quila)', timeLabel: '09:30 AM', durationLabel: '150 mins', location: 'Fort Road, Jaisalmer', estimatedCostPaise: 50000, notes: 'Living sandstone fort & Jain temples.', lat: 26.9124, lng: 70.9126 },
          { id: 'raj-jsm-2', title: 'Patwon Ki Haveli', timeLabel: '12:30 PM', durationLabel: '75 mins', location: 'Near Fort, Jaisalmer', estimatedCostPaise: 25000, notes: 'Carved merchant mansions.', lat: 26.9163, lng: 70.9146 },
          { id: 'raj-jsm-3', title: 'Gadisar Lake Walk', timeLabel: '03:30 PM', durationLabel: '60 mins', location: 'Gadisar, Jaisalmer', estimatedCostPaise: 10000, notes: 'Historic rainwater reservoir & shrines.', lat: 26.9073, lng: 70.9234 },
          { id: 'raj-jsm-4', title: 'Sam Sand Dunes Sunset', timeLabel: '05:00 PM', durationLabel: '120 mins', location: 'Sam, Jaisalmer', estimatedCostPaise: 100000, notes: 'Desert sunset viewpoint; confirm local transport.', lat: 26.8333, lng: 70.5167 }
        ]
      },
      udaipur: {
        label: 'Udaipur',
        places: [
          { id: 'raj-udr-1', title: 'City Palace Udaipur', timeLabel: '09:30 AM', durationLabel: '150 mins', location: 'Old City, Udaipur', estimatedCostPaise: 70000, notes: 'Lakeside palace complex & courtyards.', lat: 24.5764, lng: 73.6835 },
          { id: 'raj-udr-2', title: 'Lake Pichola Shoreline & Boat Jetty', timeLabel: '03:30 PM', durationLabel: '90 mins', location: 'Pichola, Udaipur', estimatedCostPaise: 50000, notes: 'Afternoon lake views.', lat: 24.5720, lng: 73.6790 },
          { id: 'raj-udr-3', title: 'Bagore Ki Haveli', timeLabel: '06:00 PM', durationLabel: '75 mins', location: 'Gangaur Ghat, Udaipur', estimatedCostPaise: 25000, notes: 'Ghatside heritage haveli.', lat: 24.5797, lng: 73.6815 },
          { id: 'raj-udr-4', title: 'Sajjangarh Monsoon Palace', timeLabel: '04:30 PM', durationLabel: '90 mins', location: 'Bansdara Hill, Udaipur', estimatedCostPaise: 30000, notes: 'Hilltop sunset over Aravalli lakes.', lat: 24.5936, lng: 73.6395 }
        ]
      }
    }
  },
  kerala: {
    label: 'Kerala',
    destinations: {
      munnar: {
        label: 'Munnar',
        places: [
          { id: 'ker-mun-1', title: 'Munnar Tea Museum', timeLabel: '09:30 AM', durationLabel: '90 mins', location: 'Nallathanni, Munnar', estimatedCostPaise: 30000, notes: 'Heritage tea processing tour.', lat: 10.0977, lng: 77.0531 },
          { id: 'ker-mun-2', title: 'Mattupetty Dam & Echo Point', timeLabel: '11:30 AM', durationLabel: '120 mins', location: 'Mattupetty, Munnar', estimatedCostPaise: 20000, notes: 'Lakeside hills & valley.', lat: 10.1066, lng: 77.1235 },
          { id: 'ker-mun-3', title: 'Top Station Mist Viewpoint', timeLabel: '02:30 PM', durationLabel: '90 mins', location: 'Munnar Border', estimatedCostPaise: 15000, notes: 'Western Ghats ridge views.', lat: 10.1259, lng: 77.2454 },
          { id: 'ker-mun-4', title: 'Spice Garden Trail', timeLabel: '04:45 PM', durationLabel: '75 mins', location: 'Chithirapuram, Munnar', estimatedCostPaise: 40000, notes: 'Cardamom & pepper walk.', lat: 10.0566, lng: 77.0419 }
        ]
      },
      alleppey: {
        label: 'Alleppey',
        places: [
          { id: 'ker-all-1', title: 'Vembanad Backwater Jetty', timeLabel: '10:00 AM', durationLabel: '180 mins', location: 'Finishing Point, Alleppey', estimatedCostPaise: 120000, notes: 'Backwater canal cruise reference.', lat: 9.5007, lng: 76.3490 },
          { id: 'ker-all-2', title: 'Alleppey Canal Village Walk', timeLabel: '03:30 PM', durationLabel: '90 mins', location: 'Kuttanad, Alleppey', estimatedCostPaise: 20000, notes: 'Paddy fields & coir lanes.', lat: 9.4500, lng: 76.4000 },
          { id: 'ker-all-3', title: 'Marari Beach Sunset', timeLabel: '05:15 PM', durationLabel: '75 mins', location: 'Mararikulam, Alleppey', estimatedCostPaise: 0, notes: 'Quiet coastal stretch.', lat: 9.6007, lng: 76.2983 }
        ]
      },
      kochi: {
        label: 'Kochi',
        places: [
          { id: 'ker-koc-1', title: 'Fort Kochi Chinese Fishing Nets', timeLabel: '09:30 AM', durationLabel: '90 mins', location: 'Fort Kochi', estimatedCostPaise: 0, notes: 'Historic waterfront promenade.', lat: 9.9685, lng: 76.2422 },
          { id: 'ker-koc-2', title: 'Mattancherry Palace & Jew Town', timeLabel: '11:30 AM', durationLabel: '120 mins', location: 'Mattancherry, Kochi', estimatedCostPaise: 20000, notes: 'Murals, spice lanes & antiques.', lat: 9.9578, lng: 76.2593 },
          { id: 'ker-koc-3', title: 'Marine Drive Evening Walk', timeLabel: '05:00 PM', durationLabel: '60 mins', location: 'Ernakulam, Kochi', estimatedCostPaise: 0, notes: 'Harbour walkway.', lat: 9.9776, lng: 76.2768 }
        ]
      },
      thekkady: {
        label: 'Thekkady',
        places: [
          { id: 'ker-the-1', title: 'Periyar Lake Reserve Edge', timeLabel: '08:30 AM', durationLabel: '150 mins', location: 'Thekkady', estimatedCostPaise: 50000, notes: 'Forest sanctuary buffer zone; check entry permits.', lat: 9.6031, lng: 77.1615 },
          { id: 'ker-the-2', title: 'Kumily Spice Market', timeLabel: '03:00 PM', durationLabel: '75 mins', location: 'Kumily, Thekkady', estimatedCostPaise: 30000, notes: 'Local spice cooperatives.', lat: 9.6097, lng: 77.1665 }
        ]
      }
    }
  },
  goa: {
    label: 'Goa',
    destinations: {
      panaji: {
        label: 'Panaji & Old Goa',
        places: [
          { id: 'goa-pan-1', title: 'Fontainhas Latin Quarter Walk', timeLabel: '09:30 AM', durationLabel: '90 mins', location: 'Panaji', estimatedCostPaise: 0, notes: 'Heritage lanes & bakeries.', lat: 15.4959, lng: 73.8299 },
          { id: 'goa-pan-2', title: 'Basilica of Bom Jesus', timeLabel: '11:30 AM', durationLabel: '75 mins', location: 'Old Goa', estimatedCostPaise: 0, notes: 'UNESCO heritage church complex.', lat: 15.5009, lng: 73.9116 },
          { id: 'goa-pan-3', title: 'Miramar Beach Promenade', timeLabel: '05:00 PM', durationLabel: '60 mins', location: 'Panaji', estimatedCostPaise: 0, notes: 'Mandovi river mouth sunset.', lat: 15.4820, lng: 73.8065 }
        ]
      },
      'north-goa': {
        label: 'North Goa',
        places: [
          { id: 'goa-ngo-1', title: 'Fort Aguada', timeLabel: '09:30 AM', durationLabel: '90 mins', location: 'Candolim, North Goa', estimatedCostPaise: 10000, notes: '17th-century sea fort & lighthouse.', lat: 15.4920, lng: 73.7737 },
          { id: 'goa-ngo-2', title: 'Chapora Fort Sunset', timeLabel: '04:45 PM', durationLabel: '90 mins', location: 'Vagator, North Goa', estimatedCostPaise: 0, notes: 'Coastal headland views.', lat: 15.6062, lng: 73.7366 }
        ]
      },
      'south-goa': {
        label: 'South Goa',
        places: [
          { id: 'goa-sgo-1', title: 'Cabo de Rama Fort', timeLabel: '10:00 AM', durationLabel: '90 mins', location: 'Canacona, South Goa', estimatedCostPaise: 0, notes: 'Cliffside fort overlooking Arabian Sea.', lat: 15.0879, lng: 73.9219 },
          { id: 'goa-sgo-2', title: 'Palolem Beach Cove', timeLabel: '04:00 PM', durationLabel: '120 mins', location: 'Palolem, South Goa', estimatedCostPaise: 30000, notes: 'Crescent bay shoreline.', lat: 15.0100, lng: 74.0232 }
        ]
      }
    }
  },
  'uttar-pradesh': {
    label: 'Uttar Pradesh',
    destinations: {
      varanasi: {
        label: 'Varanasi',
        places: [
          { id: 'up-var-1', title: 'Assi Ghat Morning Walk', timeLabel: '06:30 AM', durationLabel: '75 mins', location: 'Assi Ghat, Varanasi', estimatedCostPaise: 0, notes: 'Sunrise riverfront.', lat: 25.2896, lng: 83.0067 },
          { id: 'up-var-2', title: 'Sarnath Stupa & Museum', timeLabel: '10:30 AM', durationLabel: '150 mins', location: 'Sarnath, Varanasi', estimatedCostPaise: 25000, notes: 'Dhamek Stupa & archaeological museum.', lat: 25.3811, lng: 83.0214 },
          { id: 'up-var-3', title: 'Dashashwamedh Ghat Evening Aarti', timeLabel: '05:30 PM', durationLabel: '90 mins', location: 'Dashashwamedh Ghat, Varanasi', estimatedCostPaise: 0, notes: 'Arrive early for ghat seating.', lat: 25.3069, lng: 83.0104 }
        ]
      },
      agra: {
        label: 'Agra',
        places: [
          { id: 'up-agr-1', title: 'Taj Mahal Sunrise Gate', timeLabel: '06:30 AM', durationLabel: '150 mins', location: 'Tajganj, Agra', estimatedCostPaise: 50000, notes: 'Closed on Fridays; verify official ticket portal.', lat: 27.1751, lng: 78.0421 },
          { id: 'up-agr-2', title: 'Agra Fort', timeLabel: '10:30 AM', durationLabel: '120 mins', location: 'Rakabganj, Agra', estimatedCostPaise: 35000, notes: 'Red sandstone Mughal citadel.', lat: 27.1795, lng: 78.0211 },
          { id: 'up-agr-3', title: 'Mehtab Bagh Riverfront', timeLabel: '05:00 PM', durationLabel: '60 mins', location: 'Yamuna Bank, Agra', estimatedCostPaise: 15000, notes: 'Across-the-river sunset view.', lat: 27.1801, lng: 78.0422 }
        ]
      },
      lucknow: {
        label: 'Lucknow',
        places: [
          { id: 'up-lko-1', title: 'Bara Imambara & Bhool Bhulaiya', timeLabel: '09:30 AM', durationLabel: '120 mins', location: 'Machchli Bhavan, Lucknow', estimatedCostPaise: 25000, notes: 'Historic Awadhi architecture.', lat: 26.8691, lng: 80.9126 },
          { id: 'up-lko-2', title: 'Rumi Darwaza & Hazratganj', timeLabel: '04:00 PM', durationLabel: '90 mins', location: 'Central Lucknow', estimatedCostPaise: 30000, notes: 'Heritage gate & evening market.', lat: 26.8712, lng: 80.9122 }
        ]
      }
    }
  },
  ladakh: {
    label: 'Ladakh',
    destinations: {
      leh: {
        label: 'Leh',
        places: [
          { id: 'lad-leh-1', title: 'Leh Acclimatization & Old Town Walk', timeLabel: '10:00 AM', durationLabel: '90 mins', location: 'Leh', estimatedCostPaise: 0, notes: 'Light walk on Day 1 for high-altitude acclimatization.', lat: 34.1650, lng: 77.5840 },
          { id: 'lad-leh-2', title: 'Leh Palace & Shanti Stupa', timeLabel: '04:00 PM', durationLabel: '120 mins', location: 'Leh', estimatedCostPaise: 25000, notes: 'Panoramic valley views.', lat: 34.1743, lng: 77.5750 }
        ]
      },
      nubra: {
        label: 'Nubra Valley',
        places: [
          { id: 'lad-nub-1', title: 'Khardung La Pass Crossing', timeLabel: '08:30 AM', durationLabel: '90 mins', location: 'Khardung La', estimatedCostPaise: 0, notes: 'High mountain pass; check weather & permit status.', lat: 34.2787, lng: 77.6047 },
          { id: 'lad-nub-2', title: 'Diskit Monastery & Hunder Dunes', timeLabel: '03:00 PM', durationLabel: '120 mins', location: 'Nubra Valley', estimatedCostPaise: 30000, notes: 'Shyok river valley.', lat: 34.5446, lng: 77.5567 }
        ]
      },
      pangong: {
        label: 'Pangong Tso',
        places: [
          { id: 'lad-pan-1', title: 'Chang La Pass & Pangong Shoreline', timeLabel: '09:00 AM', durationLabel: '180 mins', location: 'Pangong Tso', estimatedCostPaise: 40000, notes: 'Check Inner Line Permit & road advisories before travel.', lat: 33.7595, lng: 78.6674 }
        ]
      }
    }
  }
};

export function validateStateAndDestinations(stateKey, selectedPlaceIds) {
  const stateDef = STATE_CATALOG[stateKey];
  if (!stateDef) {
    return { ok: false, code: 'INVALID_STATE', message: 'Please select a supported Indian state or union territory.' };
  }
  const cleanIds = Array.isArray(selectedPlaceIds)
    ? [...new Set(selectedPlaceIds.map(id => String(id || '').trim()).filter(Boolean))]
    : [];
  if (cleanIds.length === 0) {
    return { ok: false, code: 'DESTINATIONS_REQUIRED', message: `Select at least one destination in ${stateDef.label}.` };
  }
  for (const destId of cleanIds) {
    if (!stateDef.destinations[destId]) {
      return {
        ok: false,
        code: 'DESTINATION_STATE_MISMATCH',
        message: `Selected destination "${destId}" does not belong to ${stateDef.label}.`
      };
    }
  }
  return { ok: true, stateDef, destinationIds: cleanIds };
}

export function getAllowedPlacesForSelection(stateKey, destinationIds) {
  const validation = validateStateAndDestinations(stateKey, destinationIds);
  if (!validation.ok) return [];
  const list = [];
  for (const destId of validation.destinationIds) {
    const dest = validation.stateDef.destinations[destId];
    for (const p of dest.places) {
      list.push({
        placeId: p.id,
        destinationId: destId,
        destinationLabel: dest.label,
        title: p.title,
        timeLabel: p.timeLabel,
        durationLabel: p.durationLabel,
        location: p.location,
        estimatedCostPaise: p.estimatedCostPaise,
        notes: p.notes,
        lat: p.lat,
        lng: p.lng
      });
    }
  }
  return list;
}

export function findVerifiedPlaceById(stateKey, destinationIds, placeId) {
  const allowed = getAllowedPlacesForSelection(stateKey, destinationIds);
  return allowed.find(p => p.placeId === String(placeId || '').trim()) || null;
}

export function generateFlexibleItinerary(stateKey, destinationIds, durationDays) {
  const validation = validateStateAndDestinations(stateKey, destinationIds);
  if (!validation.ok) return [];
  const days = Math.max(1, Math.min(30, Math.round(Number(durationDays) || 3)));
  const { stateDef } = validation;
  const destList = validation.destinationIds.map(id => ({ id, ...stateDef.destinations[id] }));

  const baseDaysPerDest = Math.floor(days / destList.length);
  const extraDays = days % destList.length;
  const dayAssignments = [];
  destList.forEach((dest, idx) => {
    const count = baseDaysPerDest + (idx < extraDays ? 1 : 0);
    for (let d = 0; d < count; d++) {
      dayAssignments.push({ dest, localDayIndex: d });
    }
  });

  if (dayAssignments.length === 0) {
    for (let d = 0; d < days; d++) {
      dayAssignments.push({ dest: destList[d % destList.length], localDayIndex: 0 });
    }
  }

  const usedPerDest = new Map();
  const items = [];

  for (let dayIdx = 0; dayIdx < days; dayIdx++) {
    const dayKey = `day-${dayIdx + 1}`;
    const assigned = dayAssignments[dayIdx] || { dest: destList[dayIdx % destList.length], localDayIndex: 0 };
    const dest = assigned.dest;
    const offset = usedPerDest.get(dest.id) || 0;
    const slice = dest.places.slice(offset, offset + 2);
    usedPerDest.set(dest.id, offset + slice.length);

    if (slice.length > 0) {
      slice.forEach(place => {
        items.push({
          placeId: place.id,
          dayKey,
          timeLabel: place.timeLabel,
          durationLabel: place.durationLabel,
          title: place.title,
          location: place.location,
          notes: place.notes,
          estimatedCostPaise: place.estimatedCostPaise,
          lat: place.lat,
          lng: place.lng
        });
      });
    } else {
      items.push({
        placeId: null,
        dayKey,
        timeLabel: '10:00 AM',
        durationLabel: 'Flexible',
        title: `Open Exploration Day — ${dest.label}`,
        location: `${dest.label}, ${stateDef.label}`,
        notes: 'No additional curated stops for this day. Add custom places or keep as a rest day.',
        estimatedCostPaise: 0,
        lat: null,
        lng: null
      });
    }
  }

  return items;
}
