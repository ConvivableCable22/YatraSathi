/**
 * YatraSathi — Curated Indian States, Destinations & Landmarks Catalog
 * Used by the Worker for state/destination validation and flexible day-by-day itinerary generation.
 * Note: Estimated costs are reference estimates only (never live prices or availability).
 */

export const STATE_CATALOG = {
  rajasthan: {
    label: 'Rajasthan',
    destinations: {
      jaipur: {
        label: 'Jaipur',
        places: [
          { title: 'Heritage Haveli Check-in (Bani Park)', timeLabel: '09:30 AM', durationLabel: '45 mins', location: 'Bani Park, Jaipur', estimatedCostPaise: 0, notes: 'Base check-in & morning chai.' },
          { title: 'City Palace & Jantar Mantar', timeLabel: '10:45 AM', durationLabel: '150 mins', location: 'Old City, Jaipur', estimatedCostPaise: 120000, notes: 'Estimated entry reference; verify hours locally.' },
          { title: 'Hawa Mahal & Bapu Bazaar', timeLabel: '02:00 PM', durationLabel: '105 mins', location: 'Sireh Deori, Jaipur', estimatedCostPaise: 45000, notes: 'Iconic facade & local craft lanes.' },
          { title: 'Amer Fort & Panna Meena Stepwell', timeLabel: '09:00 AM', durationLabel: '150 mins', location: 'Amer, Jaipur', estimatedCostPaise: 80000, notes: 'Hilltop fort & historic stepwell.' },
          { title: 'Nahargarh Fort Sunset', timeLabel: '04:30 PM', durationLabel: '120 mins', location: 'Aravalli Hills, Jaipur', estimatedCostPaise: 35000, notes: 'Panoramic twilight city views.' }
        ]
      },
      jodhpur: {
        label: 'Jodhpur',
        places: [
          { title: 'Mehrangarh Fort & Museum', timeLabel: '09:30 AM', durationLabel: '150 mins', location: 'Pachetia Hill, Jodhpur', estimatedCostPaise: 60000, notes: 'Citadel overlooking the Blue City.' },
          { title: 'Jaswant Thada', timeLabel: '12:30 PM', durationLabel: '60 mins', location: 'Near Mehrangarh, Jodhpur', estimatedCostPaise: 15000, notes: 'Marble cenotaph & garden.' },
          { title: 'Clock Tower & Sardar Market', timeLabel: '04:00 PM', durationLabel: '90 mins', location: 'Old City, Jodhpur', estimatedCostPaise: 30000, notes: 'Spice stalls & local snacks.' },
          { title: 'Toorji Ka Jhalra Stepwell', timeLabel: '06:00 PM', durationLabel: '60 mins', location: 'Makrana Mohalla, Jodhpur', estimatedCostPaise: 0, notes: 'Restored 18th-century stepwell.' }
        ]
      },
      jaisalmer: {
        label: 'Jaisalmer',
        places: [
          { title: 'Jaisalmer Fort (Sonar Quila)', timeLabel: '09:30 AM', durationLabel: '150 mins', location: 'Fort Road, Jaisalmer', estimatedCostPaise: 50000, notes: 'Living sandstone fort & Jain temples.' },
          { title: 'Patwon Ki Haveli', timeLabel: '12:30 PM', durationLabel: '75 mins', location: 'Near Fort, Jaisalmer', estimatedCostPaise: 25000, notes: 'Carved merchant mansions.' },
          { title: 'Gadisar Lake Walk', timeLabel: '03:30 PM', durationLabel: '60 mins', location: 'Gadisar, Jaisalmer', estimatedCostPaise: 10000, notes: 'Historic rainwater reservoir & shrines.' },
          { title: 'Sam Sand Dunes Sunset', timeLabel: '05:00 PM', durationLabel: '120 mins', location: 'Sam, Jaisalmer', estimatedCostPaise: 100000, notes: 'Desert sunset viewpoint; confirm local transport.' }
        ]
      },
      udaipur: {
        label: 'Udaipur',
        places: [
          { title: 'City Palace Udaipur', timeLabel: '09:30 AM', durationLabel: '150 mins', location: 'Old City, Udaipur', estimatedCostPaise: 70000, notes: 'Lakeside palace complex & courtyards.' },
          { title: 'Lake Pichola Shoreline & Boat Jetty', timeLabel: '03:30 PM', durationLabel: '90 mins', location: 'Pichola, Udaipur', estimatedCostPaise: 50000, notes: 'Afternoon lake views.' },
          { title: 'Bagore Ki Haveli', timeLabel: '06:00 PM', durationLabel: '75 mins', location: 'Gangaur Ghat, Udaipur', estimatedCostPaise: 25000, notes: 'Ghatside heritage haveli.' },
          { title: 'Sajjangarh Monsoon Palace', timeLabel: '04:30 PM', durationLabel: '90 mins', location: 'Bansdara Hill, Udaipur', estimatedCostPaise: 30000, notes: 'Hilltop sunset over Aravalli lakes.' }
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
          { title: 'Munnar Tea Museum', timeLabel: '09:30 AM', durationLabel: '90 mins', location: 'Nallathanni, Munnar', estimatedCostPaise: 30000, notes: 'Heritage tea processing tour.' },
          { title: 'Mattupetty Dam & Echo Point', timeLabel: '11:30 AM', durationLabel: '120 mins', location: 'Mattupetty, Munnar', estimatedCostPaise: 20000, notes: 'Lakeside hills & valley.' },
          { title: 'Top Station Mist Viewpoint', timeLabel: '02:30 PM', durationLabel: '90 mins', location: 'Munnar Border', estimatedCostPaise: 15000, notes: 'Western Ghats ridge views.' },
          { title: 'Spice Garden Trail', timeLabel: '04:45 PM', durationLabel: '75 mins', location: 'Chithirapuram, Munnar', estimatedCostPaise: 40000, notes: 'Cardamom & pepper walk.' }
        ]
      },
      alleppey: {
        label: 'Alleppey',
        places: [
          { title: 'Vembanad Backwater Jetty', timeLabel: '10:00 AM', durationLabel: '180 mins', location: 'Finishing Point, Alleppey', estimatedCostPaise: 120000, notes: 'Backwater canal cruise reference.' },
          { title: 'Alleppey Canal Village Walk', timeLabel: '03:30 PM', durationLabel: '90 mins', location: 'Kuttanad, Alleppey', estimatedCostPaise: 20000, notes: 'Paddy fields & coir lanes.' },
          { title: 'Marari Beach Sunset', timeLabel: '05:15 PM', durationLabel: '75 mins', location: 'Mararikulam, Alleppey', estimatedCostPaise: 0, notes: 'Quiet coastal stretch.' }
        ]
      },
      kochi: {
        label: 'Kochi',
        places: [
          { title: 'Fort Kochi Chinese Fishing Nets', timeLabel: '09:30 AM', durationLabel: '90 mins', location: 'Fort Kochi', estimatedCostPaise: 0, notes: 'Historic waterfront promenade.' },
          { title: 'Mattancherry Palace & Jew Town', timeLabel: '11:30 AM', durationLabel: '120 mins', location: 'Mattancherry, Kochi', estimatedCostPaise: 20000, notes: 'Murals, spice lanes & antiques.' },
          { title: 'Marine Drive Evening Walk', timeLabel: '05:00 PM', durationLabel: '60 mins', location: 'Ernakulam, Kochi', estimatedCostPaise: 0, notes: 'Harbour walkway.' }
        ]
      },
      thekkady: {
        label: 'Thekkady',
        places: [
          { title: 'Periyar Lake Reserve Edge', timeLabel: '08:30 AM', durationLabel: '150 mins', location: 'Thekkady', estimatedCostPaise: 50000, notes: 'Forest sanctuary buffer zone; check entry permits.' },
          { title: 'Kumily Spice Market', timeLabel: '03:00 PM', durationLabel: '75 mins', location: 'Kumily, Thekkady', estimatedCostPaise: 30000, notes: 'Local spice cooperatives.' }
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
          { title: 'Fontainhas Latin Quarter Walk', timeLabel: '09:30 AM', durationLabel: '90 mins', location: 'Panaji', estimatedCostPaise: 0, notes: 'Heritage lanes & bakeries.' },
          { title: 'Basilica of Bom Jesus', timeLabel: '11:30 AM', durationLabel: '75 mins', location: 'Old Goa', estimatedCostPaise: 0, notes: 'UNESCO heritage church complex.' },
          { title: 'Miramar Beach Promenade', timeLabel: '05:00 PM', durationLabel: '60 mins', location: 'Panaji', estimatedCostPaise: 0, notes: 'Mandovi river mouth sunset.' }
        ]
      },
      'north-goa': {
        label: 'North Goa',
        places: [
          { title: 'Fort Aguada', timeLabel: '09:30 AM', durationLabel: '90 mins', location: 'Candolim, North Goa', estimatedCostPaise: 10000, notes: '17th-century sea fort & lighthouse.' },
          { title: 'Chapora Fort Sunset', timeLabel: '04:45 PM', durationLabel: '90 mins', location: 'Vagator, North Goa', estimatedCostPaise: 0, notes: 'Coastal headland views.' }
        ]
      },
      'south-goa': {
        label: 'South Goa',
        places: [
          { title: 'Cabo de Rama Fort', timeLabel: '10:00 AM', durationLabel: '90 mins', location: 'Canacona, South Goa', estimatedCostPaise: 0, notes: 'Cliffside fort overlooking Arabian Sea.' },
          { title: 'Palolem Beach Cove', timeLabel: '04:00 PM', durationLabel: '120 mins', location: 'Palolem, South Goa', estimatedCostPaise: 30000, notes: 'Crescent bay shoreline.' }
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
          { title: 'Assi Ghat Morning Walk', timeLabel: '06:30 AM', durationLabel: '75 mins', location: 'Assi Ghat, Varanasi', estimatedCostPaise: 0, notes: 'Sunrise riverfront.' },
          { title: 'Sarnath Stupa & Museum', timeLabel: '10:30 AM', durationLabel: '150 mins', location: 'Sarnath, Varanasi', estimatedCostPaise: 25000, notes: 'Dhamek Stupa & archaeological museum.' },
          { title: 'Dashashwamedh Ghat Evening Aarti', timeLabel: '05:30 PM', durationLabel: '90 mins', location: 'Dashashwamedh Ghat, Varanasi', estimatedCostPaise: 0, notes: 'Arrive early for ghat seating.' }
        ]
      },
      agra: {
        label: 'Agra',
        places: [
          { title: 'Taj Mahal Sunrise Gate', timeLabel: '06:30 AM', durationLabel: '150 mins', location: 'Tajganj, Agra', estimatedCostPaise: 50000, notes: 'Closed on Fridays; verify official ticket portal.' },
          { title: 'Agra Fort', timeLabel: '10:30 AM', durationLabel: '120 mins', location: 'Rakabganj, Agra', estimatedCostPaise: 35000, notes: 'Red sandstone Mughal citadel.' },
          { title: 'Mehtab Bagh Riverfront', timeLabel: '05:00 PM', durationLabel: '60 mins', location: 'Yamuna Bank, Agra', estimatedCostPaise: 15000, notes: 'Across-the-river sunset view.' }
        ]
      },
      lucknow: {
        label: 'Lucknow',
        places: [
          { title: 'Bara Imambara & Bhool Bhulaiya', timeLabel: '09:30 AM', durationLabel: '120 mins', location: 'Machchli Bhavan, Lucknow', estimatedCostPaise: 25000, notes: 'Historic Awadhi architecture.' },
          { title: 'Rumi Darwaza & Hazratganj', timeLabel: '04:00 PM', durationLabel: '90 mins', location: 'Central Lucknow', estimatedCostPaise: 30000, notes: 'Heritage gate & evening market.' }
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
          { title: 'Leh Acclimatization & Old Town Walk', timeLabel: '10:00 AM', durationLabel: '90 mins', location: 'Leh', estimatedCostPaise: 0, notes: 'Light walk on Day 1 for high-altitude acclimatization.' },
          { title: 'Leh Palace & Shanti Stupa', timeLabel: '04:00 PM', durationLabel: '120 mins', location: 'Leh', estimatedCostPaise: 25000, notes: 'Panoramic valley views.' }
        ]
      },
      nubra: {
        label: 'Nubra Valley',
        places: [
          { title: 'Khardung La Pass Crossing', timeLabel: '08:30 AM', durationLabel: '90 mins', location: 'Khardung La', estimatedCostPaise: 0, notes: 'High mountain pass; check weather & permit status.' },
          { title: 'Diskit Monastery & Hunder Dunes', timeLabel: '03:00 PM', durationLabel: '120 mins', location: 'Nubra Valley', estimatedCostPaise: 30000, notes: 'Shyok river valley.' }
        ]
      },
      pangong: {
        label: 'Pangong Tso',
        places: [
          { title: 'Chang La Pass & Pangong Shoreline', timeLabel: '09:00 AM', durationLabel: '180 mins', location: 'Pangong Tso', estimatedCostPaise: 40000, notes: 'Check Inner Line Permit & road advisories before travel.' }
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

export function generateFlexibleItinerary(stateKey, destinationIds, durationDays) {
  const validation = validateStateAndDestinations(stateKey, destinationIds);
  if (!validation.ok) return [];
  const days = Math.max(1, Math.min(30, Math.round(Number(durationDays) || 3)));
  const { stateDef } = validation;
  const destList = validation.destinationIds.map(id => ({ id, ...stateDef.destinations[id] }));

  // Allocate days sequentially across selected destinations (e.g., 5 days across 2 cities => 3 + 2)
  const baseDaysPerDest = Math.floor(days / destList.length);
  const extraDays = days % destList.length;
  const dayAssignments = [];
  destList.forEach((dest, idx) => {
    const count = baseDaysPerDest + (idx < extraDays ? 1 : 0);
    for (let d = 0; d < count; d++) {
      dayAssignments.push({ dest, localDayIndex: d });
    }
  });

  // If durationDays < destList.length, still cover all selected destinations on Day 1..days
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
          dayKey,
          timeLabel: place.timeLabel,
          durationLabel: place.durationLabel,
          title: place.title,
          location: place.location,
          notes: place.notes,
          estimatedCostPaise: place.estimatedCostPaise
        });
      });
    } else {
      items.push({
        dayKey,
        timeLabel: '10:00 AM',
        durationLabel: 'Flexible',
        title: `Open Exploration Day — ${dest.label}`,
        location: `${dest.label}, ${stateDef.label}`,
        notes: 'No additional curated stops for this day. Add custom places or keep as a rest day.',
        estimatedCostPaise: 0
      });
    }
  }

  return items;
}
