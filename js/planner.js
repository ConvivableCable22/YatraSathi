/**
 * YatraSathi — Signed-in Trip Planning Application
 * Persistent 8-Section Workspace Routing & State Management
 * 
 * Sections:
 * 1. Explore India (explore-india)
 * 2. My Trips (my-trips)
 * 3. Itinerary Builder (itinerary-builder)
 * 4. Maps & Routes (maps-routes)
 * 5. Bookings (bookings)
 * 6. Expenses (expenses)
 * 7. Achievements (achievements)
 * 8. Profile & Settings (profile-settings)
 */

(function () {
  'use strict';

  // --- 1. Initial State ---
  const state = {
    activeSection: 'dashboard',
    activeTripId: 'trip-1',
    isOffline: false,
    isAuthenticated: false,
    userId: null,
    uiMode: 'normal',
    userDisplayName: 'Arnav Sharma',
    dataSourceLabel: 'Prototype Mode',
    savedDestinations: new Set(),
    unlockedBadges: new Set(),
    itineraryItems: [],
    bookingNotes: [],
    reviews: [],
    recentActivity: [
      { text: 'Loaded Rajasthan Heritage Loop workspace', time: 'Just now' }
    ],
    trips: [
      {
        id: 'trip-1',
        name: 'Rajasthan Heritage Loop',
        destination: 'Jaipur & Jodhpur',
        startDate: '2026-11-28',
        endDate: '2026-12-02',
        travelers: 2,
        budget: 45000,
        spent: 18400,
        estimated: 14200,
        theme: 'rajasthan',
        status: 'upcoming',
        bookingsCount: 2,
        role: 'Owner'
      },
      {
        id: 'trip-2',
        name: 'Kerala Mist & Backwaters',
        destination: 'Munnar & Alleppey',
        startDate: '2027-01-14',
        endDate: '2027-01-19',
        travelers: 3,
        budget: 38000,
        spent: 4200,
        estimated: 12500,
        theme: 'kerala',
        status: 'upcoming',
        bookingsCount: 1,
        role: 'Owner'
      }
    ]
  };

  function scopedStoragePrefix(prefix) {
    if (state.isAuthenticated && state.userId) {
      return `yatrasathi_u_${state.userId}_${prefix}`;
    }
    return `yatrasathi_${prefix}`;
  }

  function scopedStorageKey(suffix) {
    return scopedStoragePrefix(suffix);
  }

  function clearLegacyUnscopedStorage() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('yatrasathi_') && !key.startsWith('yatrasathi_u_')) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      // Ignore storage errors
    }
  }

  function clearAllUserStorage() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('yatrasathi_')) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      // Ignore storage errors
    }
  }

  // Development-only API origin when UI runs on Live Server (port 5500); empty string in production & Wrangler
  function getApiBase() {
    const host = window.location.hostname;
    if ((host === '127.0.0.1' || host === 'localhost') && window.location.port === '5500') {
      return `http://${host}:8787`;
    }
    return '';
  }

  async function apiFetch(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const resp = await fetch(getApiBase() + path, Object.assign({ credentials: 'include', headers }, options));
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.message || `Request failed (${resp.status})`);
      err.status = resp.status;
      err.code = data.code || '';
      throw err;
    }
    return data;
  }

  const leafletMapInstances = new WeakMap();
  function escapeHtmlAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const DESTINATION_CENTERS = {
    rajasthan: [26.9258, 75.8237],
    kerala: [10.0977, 77.0531],
    goa: [15.4909, 73.8278],
    varanasi: [25.3176, 82.9739],
    ladakh: [34.1526, 77.5771]
  };

  function getActiveDestinationCenter() {
    const trip = state.trips.find(t => t.id === state.activeTripId) || state.trips[0];
    const theme = (trip && trip.theme) || 'rajasthan';
    return DESTINATION_CENTERS[theme] || DESTINATION_CENTERS.rajasthan;
  }

  function renderLeafletMap({ mapEl, fallbackEl, badgeEl, stops, focusedIndex, onMarkerSelect, totalsEl }) {
    if (!mapEl) return;
    const coordStops = (stops || []).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
    const destCenter = getActiveDestinationCenter();

    if (typeof window.L === 'undefined') {
      if (fallbackEl) {
        fallbackEl.innerHTML = '<strong>Map Library Unavailable</strong><span>Leaflet could not be loaded (offline or blocked). Use the ordered stop list.</span><button type="button" class="btn btn-secondary btn-retry-map" style="margin-top: 6px; min-height: 36px; padding: 6px 14px; font-size: 0.8125rem;">Retry Map</button>';
        fallbackEl.style.display = 'flex';
        const retryBtn = fallbackEl.querySelector('.btn-retry-map');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => renderLeafletMap({ mapEl, fallbackEl, badgeEl, stops, focusedIndex, onMarkerSelect, totalsEl }));
        }
      }
      if (badgeEl) badgeEl.textContent = 'Map Unavailable • Ordered Stop List';
      return;
    }

    // Defer Leaflet initialization until the section is visible with a nonzero box
    if (mapEl.offsetWidth === 0 || mapEl.offsetHeight === 0) {
      return;
    }

    if (fallbackEl) fallbackEl.style.display = 'none';

    const initialCenter = coordStops.length ? [coordStops[0].lat, coordStops[0].lng] : destCenter;
    let entry = leafletMapInstances.get(mapEl);
    if (!entry) {
      const map = window.L.map(mapEl, {
        center: initialCenter,
        zoom: 12,
        zoomControl: true
      });
      const tileLayer = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        maxZoom: 19
      });
      let tileErrors = 0;
      tileLayer.on('tileload', () => {
        tileErrors = 0;
        if (fallbackEl) fallbackEl.style.display = 'none';
      });
      tileLayer.on('tileerror', () => {
        tileErrors++;
        if (tileErrors >= 3 && fallbackEl) {
          fallbackEl.innerHTML = '<strong>Map Tiles Failed to Load</strong><span>OpenStreetMap tiles could not be loaded (check your connection). Your ordered stops remain in the list.</span><button type="button" class="btn btn-secondary btn-retry-tiles" style="margin-top: 6px; min-height: 36px; padding: 6px 14px; font-size: 0.8125rem;">Retry Tiles</button>';
          fallbackEl.style.display = 'flex';
          const retryTilesBtn = fallbackEl.querySelector('.btn-retry-tiles');
          if (retryTilesBtn) {
            retryTilesBtn.addEventListener('click', () => {
              tileErrors = 0;
              fallbackEl.style.display = 'none';
              tileLayer.redraw();
            });
          }
        }
      });
      tileLayer.addTo(map);
      const layerGroup = window.L.layerGroup().addTo(map);
      entry = { map, layerGroup };
      leafletMapInstances.set(mapEl, entry);
    }

    entry.layerGroup.clearLayers();
    const latLngs = coordStops.map(s => [s.lat, s.lng]);

    if (latLngs.length >= 2) {
      window.L.polyline(latLngs, {
        color: '#06706B',
        weight: 4,
        opacity: 0.9,
        dashArray: '8, 6'
      }).addTo(entry.layerGroup);
    }

    coordStops.forEach((stop, idx) => {
      const shortName = escapeHtmlAttr(stop.name.split(' ').slice(0, 2).join(' '));
      const isFocused = idx === focusedIndex;
      const icon = window.L.divIcon({
        className: 'leaflet-numbered-pin',
        html: `<span class="leaflet-pin-pill${isFocused ? ' active' : ''}"><span class="leaflet-pin-num">${idx + 1}</span><span>${shortName}</span></span>`,
        iconSize: null,
        iconAnchor: [14, 14]
      });
      const marker = window.L.marker([stop.lat, stop.lng], { icon, zIndexOffset: isFocused ? 500 : 0 });
      marker.bindPopup(`<strong>${idx + 1}. ${escapeHtmlAttr(stop.name)}</strong><br>${escapeHtmlAttr(stop.notes || stop.location || '')}`);
      marker.on('click', () => {
        if (typeof onMarkerSelect === 'function') onMarkerSelect(idx);
      });
      marker.addTo(entry.layerGroup);
    });

    if (latLngs.length > 1) {
      entry.map.fitBounds(window.L.latLngBounds(latLngs), { padding: [36, 36] });
    } else if (latLngs.length === 1) {
      entry.map.setView(latLngs[0], 13);
    } else {
      entry.map.setView(destCenter, 12);
    }

    setTimeout(() => entry.map.invalidateSize(), 120);

    if (badgeEl) {
      if (!coordStops.length) {
        badgeEl.textContent = 'OpenStreetMap • Destination center (stops lack coordinates)';
      } else {
        badgeEl.textContent = latLngs.length >= 2
          ? 'Straight-line preview • Not road directions or travel times'
          : 'OpenStreetMap • Stop location';
      }
    }
    if (totalsEl) {
      totalsEl.textContent = coordStops.length
        ? `${coordStops.length} mapped stop${coordStops.length === 1 ? '' : 's'} • Straight-line preview`
        : `${(stops || []).length} stop(s) • Coordinates unavailable`;
    }
  }

  // --- 2. Toast Notice Controller ---
  const toastNotice = document.getElementById('toast-notice');
  const toastMessage = document.getElementById('toast-message');
  let toastTimer = null;

  function showToast(msg) {
    if (!toastNotice || !toastMessage) return;
    toastMessage.textContent = msg;
    toastNotice.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNotice.classList.remove('show'), 3800);
  }

  // --- 3. Persistent 8-Section Navigation Routing ---
  const sidebarNavItems = document.querySelectorAll('.sidebar-nav-item');
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn[data-section]');
  const appSections = document.querySelectorAll('.app-section');
  const appSidebar = document.getElementById('app-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
  const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
  const btnBottomMenu = document.getElementById('btn-bottom-menu');

  function openMobileSidebar() {
    if (appSidebar) appSidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    if (mobileSidebarToggle) mobileSidebarToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    if (appSidebar) appSidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    if (mobileSidebarToggle) mobileSidebarToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function switchSection(sectionId) {
    // 1. Update Sidebar Nav Items
    sidebarNavItems.forEach(item => {
      const target = item.getAttribute('data-section');
      if (target === sectionId) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'page');
      } else {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
      }
    });

    // 2. Update Mobile Bottom Nav Buttons
    mobileNavBtns.forEach(btn => {
      const target = btn.getAttribute('data-section');
      if (target === sectionId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 3. Update Active Section Container
    const targetSection = document.getElementById(`section-${sectionId}`);
    appSections.forEach(section => {
      if (section.id === `section-${sectionId}`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    state.activeSection = sectionId;
    if (sectionId === 'achievements' && typeof window.__yatraRenderAchievements === 'function') {
      window.__yatraRenderAchievements();
    } else if (sectionId === 'dashboard' && typeof window.__yatraRenderDashboard === 'function') {
      window.__yatraRenderDashboard();
    } else if (sectionId === 'expenses' && typeof window.__yatraRenderExpenses === 'function') {
      window.__yatraRenderExpenses();
    } else if (sectionId === 'my-trips' && typeof window.__yatraRenderMyTrips === 'function') {
      window.__yatraRenderMyTrips();
    } else if (sectionId === 'itinerary-builder' && typeof window.__yatraRenderItineraryMap === 'function') {
      requestAnimationFrame(() => window.__yatraRenderItineraryMap());
    } else if (sectionId === 'maps-routes' && typeof window.__yatraRenderMapsSection === 'function') {
      requestAnimationFrame(() => window.__yatraRenderMapsSection());
    } else if (sectionId === 'trip-reviews' && typeof window.__yatraRenderReviews === 'function') {
      window.__yatraRenderReviews();
    }

    // 4. Close mobile drawer if open
    closeMobileSidebar();

    // 5. Scroll to top of main workspace
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }

  function initNavigation() {
    // Desktop & Drawer Sidebar clicks
    sidebarNavItems.forEach(item => {
      item.addEventListener('click', function () {
        const sectionId = item.getAttribute('data-section');
        if (sectionId) switchSection(sectionId);
      });
    });

    // Mobile bottom navigation bar clicks
    mobileNavBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        const sectionId = btn.getAttribute('data-section');
        if (sectionId) switchSection(sectionId);
      });
    });

    // Mobile hamburger toggle
    if (mobileSidebarToggle) {
      mobileSidebarToggle.addEventListener('click', function () {
        const isOpen = appSidebar && appSidebar.classList.contains('open');
        if (isOpen) {
          closeMobileSidebar();
        } else {
          openMobileSidebar();
        }
      });
    }

    // Sidebar Close button & Backdrop click
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeMobileSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    // Bottom "Menu" button opens sidebar drawer
    if (btnBottomMenu) {
      btnBottomMenu.addEventListener('click', openMobileSidebar);
    }
  }

  function renderActiveTripItineraryList(tripId) {
    const activitiesContainer = document.getElementById('activities-container');
    if (!activitiesContainer) return;
    const activeItems = (state.itineraryItems || []).filter(it => it.tripId === tripId);
    activitiesContainer.innerHTML = activeItems.length
      ? activeItems.map(it => {
          const dayNum = String(it.dayKey || 'day-1').replace(/^day-/i, '');
          return `
          <article class="activity-card" data-item-id="${it.id}">
            <div class="activity-time-col">
              <span class="badge badge-teal" style="margin-bottom: 4px; font-size: 0.6875rem;">Day ${dayNum}</span>
              <span class="activity-time">${it.timeLabel}</span>
              <span class="activity-duration">${it.durationLabel}</span>
            </div>
            <div class="activity-body">
              <h4 class="activity-title">${it.title}</h4>
              <div class="activity-location"><span>${it.location || 'Local Area'}</span></div>
              ${it.notes ? `<p class="activity-notes">${it.notes}</p>` : ''}
            </div>
            <div class="activity-cost-col">
              <span class="cost-estimate-label">Estimated Cost</span>
              <span class="cost-estimate-val">₹${Math.round((it.estimatedCostPaise || 0) / 100).toLocaleString('en-IN')}</span>
              <button class="btn-delete-item" type="button" title="Delete activity" aria-label="Delete activity">×</button>
            </div>
          </article>
        `;
        }).join('')
      : '<div class="empty-state-card" style="padding: var(--space-lg);"><h3 class="empty-state-title">No itinerary items yet</h3><p class="empty-state-desc">Add an activity or choose a curated stop to build your day plan.</p></div>';
  }

  // --- 4. Active Trip Context Synchronization ---
  function syncActiveTripUI(tripId) {
    const trip = state.trips.find(t => t.id === tripId) || state.trips[0];
    if (!trip) return;
    state.activeTripId = trip.id;

    // Sidebar Active Context Box
    const sidebarTripName = document.getElementById('sidebar-active-trip-name');
    const sidebarTripMeta = document.getElementById('sidebar-active-trip-meta');
    if (sidebarTripName) sidebarTripName.textContent = trip.name;
    if (sidebarTripMeta) sidebarTripMeta.textContent = `${trip.destination} • ${trip.startDate} – ${trip.endDate}`;

    // Section 3: Itinerary Builder Header
    const itineraryName = document.getElementById('itinerary-active-trip-name');
    const itinerarySubtitle = document.getElementById('itinerary-trip-subtitle');
    if (itineraryName) itineraryName.textContent = trip.name;
    if (itinerarySubtitle) itinerarySubtitle.innerHTML = `Planning for <strong>${trip.name}</strong> • ${trip.destination}`;

    // Section 6: Expenses Financial KPI Grid
    const expBudget = document.getElementById('exp-total-budget');
    const expSpent = document.getElementById('exp-total-spent');
    const expRemaining = document.getElementById('exp-remaining');
    if (expBudget) expBudget.textContent = `₹${trip.budget.toLocaleString('en-IN')}`;
    if (expSpent) expSpent.textContent = `₹${trip.spent.toLocaleString('en-IN')}`;
    if (expRemaining) {
      const rem = Math.max(0, trip.budget - trip.spent);
      expRemaining.textContent = `₹${rem.toLocaleString('en-IN')}`;
    }

    renderActiveTripItineraryList(trip.id);

    if (typeof window.__yatraRefreshItineraryPlanner === 'function') {
      window.__yatraRefreshItineraryPlanner(trip);
    }
    if (typeof window.__yatraRenderMapsSection === 'function') {
      window.__yatraRenderMapsSection();
    }
  }

  function initTripCardClicks() {
    const tripCards = document.querySelectorAll('.trip-summary-card');
    tripCards.forEach(card => {
      card.addEventListener('click', function () {
        const tripId = card.getAttribute('data-trip-id');
        syncActiveTripUI(tripId);
        showToast(`Loaded "${card.querySelector('.trip-card-name')?.textContent || 'Trip'}" workspace.`);
        switchSection('itinerary-builder');
      });
    });
  }

  // --- 5. Modal Controllers (Accessibility & Trap) ---
  const modals = document.querySelectorAll('.modal-backdrop');
  let lastFocusedElement = null;

  function openModal(modalEl) {
    if (state.isOffline) {
      showToast('Offline Mode: Modifying or creating records requires internet connectivity.');
      return;
    }
    if (!modalEl) return;
    lastFocusedElement = document.activeElement;
    modalEl.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const focusable = modalEl.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (focusable) setTimeout(() => focusable.focus(), 60);
  }

  function closeAllModals() {
    modals.forEach(m => {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function initModals() {
    // Triggers for Create Trip
    const btnCreateTripMain = document.getElementById('btn-create-trip-main');
    const btnSidebarCreate = document.getElementById('btn-sidebar-create');
    const btnMobileNewTrip = document.getElementById('btn-mobile-new-trip');
    const btnEmptyCreateTrip = document.getElementById('btn-empty-create-trip');
    const modalCreateTrip = document.getElementById('modal-create-trip');

    [btnCreateTripMain, btnSidebarCreate, btnMobileNewTrip, btnEmptyCreateTrip].forEach(btn => {
      if (btn) btn.addEventListener('click', () => {
        const editIdEl = document.getElementById('trip-edit-id');
        const titleEl = document.getElementById('modal-trip-title');
        const submitEl = document.getElementById('btn-submit-trip-form');
        const formEl = document.getElementById('form-create-trip');
        if (formEl) formEl.reset();
        if (editIdEl) editIdEl.value = '';
        if (titleEl) titleEl.textContent = 'Create a New Trip';
        if (submitEl) submitEl.textContent = 'Create Trip Workspace';
        openModal(modalCreateTrip);
      });
    });

    // Triggers for Add Activity
    const actionAddItems = document.querySelectorAll('.btn-action-add-item');
    const modalAddItem = document.getElementById('modal-add-item');
    actionAddItems.forEach(btn => {
      btn.addEventListener('click', () => openModal(modalAddItem));
    });

    // Triggers for Add Booking
    const actionAddBookings = document.querySelectorAll('.btn-action-add-booking');
    const modalAddBooking = document.getElementById('modal-add-booking');
    actionAddBookings.forEach(btn => {
      btn.addEventListener('click', () => openModal(modalAddBooking));
    });

    // Triggers for Record Expense
    const actionAddExpenses = document.querySelectorAll('.btn-action-add-expense');
    const modalAddExpense = document.getElementById('modal-add-expense');
    actionAddExpenses.forEach(btn => {
      btn.addEventListener('click', () => {
        const dateInput = document.getElementById('expense-input-date');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        openModal(modalAddExpense);
      });
    });

    // Close buttons on all modals
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    // Click outside backdrop to close
    modals.forEach(modal => {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeAllModals();
      });
    });

    // Escape key & Tab focus-trap inside open workspace modals
    document.addEventListener('keydown', function (e) {
      const openModalEl = document.querySelector('.modal-backdrop.open');
      if (!openModalEl) return;
      if (e.key === 'Escape') {
        closeAllModals();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = Array.from(
          openModalEl.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
        ).filter(function (el) {
          return el.offsetParent !== null;
        });
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  // --- 6. Live Interactive CRUD & Section Features ---
  function initInteractiveFeatures() {

    // --- FEATURE A: Explore India Search & Saved Destinations ---
    const searchInput = document.getElementById('discover-search-input');
    const destCards = document.querySelectorAll('#discover-cards-grid .destination-card');
    const tabDiscoverAll = document.getElementById('tab-discover-all');
    const tabDiscoverSaved = document.getElementById('tab-discover-saved');
    const discoverSavedEmpty = document.getElementById('discover-saved-empty');
    const savedDestCountEl = document.getElementById('saved-dest-count');
    const sidebarSavedBadge = document.getElementById('sidebar-saved-dest-badge');

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        const query = searchInput.value.toLowerCase().trim();
        destCards.forEach(card => {
          const text = card.textContent.toLowerCase();
          const matches = !query || text.includes(query);
          if (tabDiscoverSaved && tabDiscoverSaved.classList.contains('active')) {
            const destId = card.getAttribute('data-dest-id');
            card.style.display = matches && state.savedDestinations.has(destId) ? 'flex' : 'none';
          } else {
            card.style.display = matches ? 'flex' : 'none';
          }
        });
      });
    }

    if (tabDiscoverAll && tabDiscoverSaved) {
      tabDiscoverAll.addEventListener('click', function () {
        tabDiscoverAll.classList.add('active');
        tabDiscoverSaved.classList.remove('active');
        if (discoverSavedEmpty) discoverSavedEmpty.style.display = 'none';
        destCards.forEach(c => c.style.display = 'flex');
      });

      tabDiscoverSaved.addEventListener('click', function () {
        tabDiscoverSaved.classList.add('active');
        tabDiscoverAll.classList.remove('active');
        if (state.savedDestinations.size === 0) {
          if (discoverSavedEmpty) discoverSavedEmpty.style.display = 'block';
          destCards.forEach(c => c.style.display = 'none');
        } else {
          if (discoverSavedEmpty) discoverSavedEmpty.style.display = 'none';
          destCards.forEach(c => {
            const destId = c.getAttribute('data-dest-id');
            c.style.display = state.savedDestinations.has(destId) ? 'flex' : 'none';
          });
        }
      });
    }

    // Save Destination Toggle Buttons
    document.querySelectorAll('.btn-save-dest').forEach(btn => {
      btn.addEventListener('click', async function () {
        const destId = btn.getAttribute('data-dest-id') || btn.closest('.destination-card')?.getAttribute('data-dest-id');
        if (!destId) return;

        if (state.isAuthenticated) {
          if (state.isOffline) {
            showToast('Offline Mode: Updating saved destinations requires internet connectivity.');
            return;
          }
          try {
            const res = await apiFetch('/api/workspace/saved-destinations/toggle', {
              method: 'POST',
              body: JSON.stringify({ destinationId: destId })
            });
            state.savedDestinations = new Set(res.savedDestinations || []);
            btn.textContent = res.saved ? '✔ Saved' : 'Save Destination';
            showToast(res.saved ? 'Saved destination to your D1 profile!' : 'Removed destination from your bookmarks.');
          } catch (err) {
            showToast(err.message || 'Could not update saved destination.');
            return;
          }
        } else {
          const isSaved = state.savedDestinations.has(destId);
          if (isSaved) {
            state.savedDestinations.delete(destId);
            btn.textContent = 'Save Destination';
            showToast('Removed destination from your bookmarks.');
          } else {
            state.savedDestinations.add(destId);
            btn.textContent = '✔ Saved';
            showToast('Saved destination to your profile!');
          }
        }

        if (savedDestCountEl) savedDestCountEl.textContent = state.savedDestinations.size;
        if (sidebarSavedBadge) {
          sidebarSavedBadge.textContent = state.savedDestinations.size > 0
            ? `${state.savedDestinations.size} Saved`
            : '5 Curated';
        }
      });
    });

    // "Plan Trip Here" buttons from cards
    document.querySelectorAll('.btn-plan-from-dest').forEach(btn => {
      btn.addEventListener('click', function () {
        const dest = btn.getAttribute('data-dest');
        const modalCreate = document.getElementById('modal-create-trip');
        openModal(modalCreate);
        const destInput = document.getElementById('new-trip-destination');
        const nameInput = document.getElementById('new-trip-name');
        if (destInput) destInput.value = dest;
        if (nameInput) nameInput.value = `${dest.split(' ')[0]} Exploration`;
      });
    });

    // --- FEATURE B: Flexible State / Multi-Destination / Duration Trip Form ---
    const FLEX_STATE_CATALOG = {
      rajasthan: {
        label: 'Rajasthan',
        destinations: {
          jaipur: { label: 'Jaipur', placesCount: 5 },
          jodhpur: { label: 'Jodhpur', placesCount: 4 },
          jaisalmer: { label: 'Jaisalmer', placesCount: 4 },
          udaipur: { label: 'Udaipur', placesCount: 4 }
        }
      },
      kerala: {
        label: 'Kerala',
        destinations: {
          munnar: { label: 'Munnar', placesCount: 4 },
          alleppey: { label: 'Alleppey', placesCount: 3 },
          kochi: { label: 'Kochi', placesCount: 3 },
          thekkady: { label: 'Thekkady', placesCount: 2 }
        }
      },
      goa: {
        label: 'Goa',
        destinations: {
          panaji: { label: 'Panaji & Old Goa', placesCount: 3 },
          'north-goa': { label: 'North Goa', placesCount: 2 },
          'south-goa': { label: 'South Goa', placesCount: 2 }
        }
      },
      'uttar-pradesh': {
        label: 'Uttar Pradesh',
        destinations: {
          varanasi: { label: 'Varanasi', placesCount: 3 },
          agra: { label: 'Agra', placesCount: 3 },
          lucknow: { label: 'Lucknow', placesCount: 2 }
        }
      },
      ladakh: {
        label: 'Ladakh',
        destinations: {
          leh: { label: 'Leh', placesCount: 2 },
          nubra: { label: 'Nubra Valley', placesCount: 2 },
          pangong: { label: 'Pangong Tso', placesCount: 1 }
        }
      }
    };

    const tripStateSelect = document.getElementById('new-trip-state');
    const tripPlacesGroup = document.getElementById('new-trip-places-group');
    const tripPlacesHint = document.getElementById('new-trip-places-hint');
    const tripDestHidden = document.getElementById('new-trip-destination');
    const tripDurationInput = document.getElementById('new-trip-duration');
    const tripStartInput = document.getElementById('new-trip-start');
    const tripEndInput = document.getElementById('new-trip-end');

    function getSelectedPlaceIds() {
      if (!tripPlacesGroup) return [];
      const stateKey = tripStateSelect ? tripStateSelect.value : 'rajasthan';
      const validMap = (FLEX_STATE_CATALOG[stateKey] && FLEX_STATE_CATALOG[stateKey].destinations) || {};
      return Array.from(tripPlacesGroup.querySelectorAll('.explore-vibe-chip.active'))
        .map(btn => btn.getAttribute('data-place-id'))
        .filter(id => Boolean(validMap[id]));
    }

    function syncDestinationSummary() {
      const stateKey = tripStateSelect ? tripStateSelect.value : 'rajasthan';
      const stateDef = FLEX_STATE_CATALOG[stateKey];
      const selected = getSelectedPlaceIds();
      if (tripDestHidden && stateDef) {
        tripDestHidden.value = selected.map(id => stateDef.destinations[id].label).join(', ');
      }
      if (tripPlacesHint && stateDef) {
        if (!selected.length) {
          tripPlacesHint.textContent = `Select at least one destination in ${stateDef.label}.`;
        } else {
          const totalPlaces = selected.reduce((sum, id) => sum + (stateDef.destinations[id]?.placesCount || 0), 0);
          const days = Math.max(1, parseInt(tripDurationInput?.value || '3', 10) || 3);
          tripPlacesHint.textContent = totalPlaces < days
            ? `${selected.length} destination(s) selected (${totalPlaces} curated stops). Extra days will be marked as Open Exploration days so you can add custom stops.`
            : `${selected.length} destination(s) selected in ${stateDef.label} (${totalPlaces} curated reference stops available).`;
        }
      }
    }

    function renderStateDestinationChips(stateKey, preselectIds = null) {
      if (!tripPlacesGroup) return;
      const stateDef = FLEX_STATE_CATALOG[stateKey] || FLEX_STATE_CATALOG.rajasthan;
      const entries = Object.entries(stateDef.destinations);
      const selectedSet = new Set(Array.isArray(preselectIds) && preselectIds.length ? preselectIds : [entries[0][0]]);
      tripPlacesGroup.innerHTML = entries.map(([id, def]) => {
        const active = selectedSet.has(id);
        return `<button type="button" class="explore-vibe-chip${active ? ' active' : ''}" data-place-id="${id}" aria-pressed="${active ? 'true' : 'false'}">${def.label}</button>`;
      }).join('');
      tripPlacesGroup.querySelectorAll('.explore-vibe-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const next = !btn.classList.contains('active');
          btn.classList.toggle('active', next);
          btn.setAttribute('aria-pressed', next ? 'true' : 'false');
          syncDestinationSummary();
        });
      });
      syncDestinationSummary();
    }

    if (tripStateSelect) {
      renderStateDestinationChips(tripStateSelect.value || 'rajasthan');
      tripStateSelect.addEventListener('change', () => {
        renderStateDestinationChips(tripStateSelect.value);
      });
    }

    function syncEndDateFromDuration() {
      if (!tripStartInput || !tripEndInput || !tripDurationInput || !tripStartInput.value) return;
      const days = Math.max(1, Math.min(30, parseInt(tripDurationInput.value, 10) || 3));
      const d = new Date(tripStartInput.value + 'T00:00:00');
      if (!Number.isNaN(d.getTime())) {
        d.setDate(d.getDate() + (days - 1));
        tripEndInput.value = d.toISOString().split('T')[0];
      }
    }
    if (tripStartInput) tripStartInput.addEventListener('change', syncEndDateFromDuration);
    if (tripDurationInput) tripDurationInput.addEventListener('input', () => { syncEndDateFromDuration(); syncDestinationSummary(); });

    const formCreateTrip = document.getElementById('form-create-trip');
    if (formCreateTrip) {
      formCreateTrip.addEventListener('submit', async function (e) {
        e.preventDefault();
        const editIdEl = document.getElementById('trip-edit-id');
        const editId = editIdEl ? editIdEl.value.trim() : '';
        const name = document.getElementById('new-trip-name').value.trim();
        const stateKey = tripStateSelect ? tripStateSelect.value : 'rajasthan';
        const selectedPlaces = getSelectedPlaceIds();
        const dest = (tripDestHidden && tripDestHidden.value.trim()) || '';
        const durationDays = Math.max(1, Math.min(30, parseInt(tripDurationInput?.value || '3', 10) || 3));
        const budget = parseInt(document.getElementById('new-trip-budget').value, 10) || 35000;
        const travelers = parseInt(document.getElementById('new-trip-travelers').value, 10) || 2;
        const start = (tripStartInput && tripStartInput.value) || '2027-02-10';
        const end = (tripEndInput && tripEndInput.value) || start;
        const generateItinerary = Boolean(document.getElementById('new-trip-generate-itinerary')?.checked);

        if (!name) {
          showToast('Please enter a trip name.');
          return;
        }
        if (!selectedPlaces.length) {
          showToast(`Select at least one destination in ${(FLEX_STATE_CATALOG[stateKey] || {}).label || 'the selected state'}.`);
          return;
        }

        if (editId) {
          const existing = state.trips.find(t => t.id === editId);
          if (existing) {
            if (state.isAuthenticated) {
              try {
                await apiFetch(`/api/workspace/trips/${encodeURIComponent(editId)}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ name, destination: dest, theme: stateKey, selectedPlaces, budgetPaise: budget * 100, travelers, startDate: start, endDate: end })
                });
              } catch (err) {
                showToast(err.message || 'Could not update trip in D1.');
                return;
              }
            }
            existing.name = name || existing.name;
            existing.destination = dest || existing.destination;
            existing.theme = stateKey;
            existing.selectedPlaces = selectedPlaces;
            existing.budget = budget;
            existing.travelers = travelers;
            existing.startDate = start;
            existing.endDate = end;
            if (editIdEl) editIdEl.value = '';
            closeAllModals();
            syncActiveTripUI(existing.id);
            if (typeof window.__yatraRenderMyTrips === 'function') window.__yatraRenderMyTrips();
            if (typeof window.__yatraRenderDashboard === 'function') window.__yatraRenderDashboard();
            showToast(`Updated trip "${existing.name}".`);
            return;
          }
        }

        let newTripObj;
        let createdItems = [];
        if (state.isAuthenticated) {
          try {
            const res = await apiFetch('/api/workspace/trips', {
              method: 'POST',
              body: JSON.stringify({
                name,
                destination: dest,
                startDate: start,
                endDate: end,
                travelers,
                budgetPaise: budget * 100,
                theme: stateKey,
                selectedPlaces,
                durationDays,
                generateItinerary
              })
            });
            newTripObj = res.trip;
            createdItems = Array.isArray(res.itineraryItems) ? res.itineraryItems : [];
          } catch (err) {
            showToast(err.message || 'Could not create trip in D1.');
            return;
          }
        } else {
          newTripObj = {
            id: `trip-${Date.now()}`,
            name: name,
            destination: dest,
            startDate: start,
            endDate: end,
            travelers: travelers,
            budget: budget,
            spent: 0,
            estimated: 0,
            theme: stateKey,
            selectedPlaces,
            role: 'Owner'
          };
        }
        const newId = newTripObj.id;

        state.trips.unshift(newTripObj);
        if (createdItems.length > 0) {
          state.itineraryItems.push(...createdItems);
        }

        // Append card to My Trips container
        const tripsContainer = document.getElementById('trips-container');
        if (tripsContainer) {
          const card = document.createElement('article');
          card.className = 'trip-summary-card';
          card.setAttribute('data-trip-id', newId);
          card.innerHTML = `
            <div class="trip-card-header">
              <div>
                <h3 class="trip-card-name">${name}</h3>
                <div class="trip-card-dest">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  <span>${dest} • ${start} to ${end}</span>
                </div>
              </div>
              <span class="trip-status-chip">Private</span>
            </div>
            <div class="trip-stats-grid">
              <div>
                <div class="stat-item-label">Budget</div>
                <div class="stat-item-val">₹${budget.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div class="stat-item-label">Actual Spent</div>
                <div class="stat-item-val" style="color: var(--color-brand-teal);">₹0</div>
              </div>
              <div>
                <div class="stat-item-label">Travelers</div>
                <div class="stat-item-val">${travelers} People</div>
              </div>
              <div>
                <div class="stat-item-label">Itinerary Items</div>
                <div class="stat-item-val">0 Plotted</div>
              </div>
            </div>
            <div class="trip-card-footer">
              <span style="font-size: 0.8125rem; color: var(--color-text-secondary); font-weight: 600;">Role: Owner</span>
              <button type="button" class="btn btn-secondary btn-open-plan" style="padding: 6px 14px; min-height: 40px; font-size: 0.8125rem;">Open Plan →</button>
            </div>
          `;
          tripsContainer.prepend(card);
          card.addEventListener('click', function () {
            syncActiveTripUI(newId);
            switchSection('itinerary-builder');
          });
        }

        // Update sidebar trips count
        const sidebarTripsCount = document.getElementById('sidebar-trips-count');
        if (sidebarTripsCount) sidebarTripsCount.textContent = state.trips.length;

        closeAllModals();
        syncActiveTripUI(newId);
        showToast(`Private trip "${name}" created! Opened Itinerary Builder.`);
        switchSection('itinerary-builder');
      });
    }

    // --- FEATURE C: Day Selector in Itinerary Builder ---
    const daySelectBtns = document.querySelectorAll('.day-select-btn');
    daySelectBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        daySelectBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const day = btn.getAttribute('data-day');
        const heading = document.getElementById('current-day-heading');
        if (heading) {
          if (day === 'day-1') heading.textContent = 'Day 1: Arrival & Historic Core';
          else if (day === 'day-2') heading.textContent = 'Day 2: Amer Fort & Royal Bazaars';
          else heading.textContent = 'Day 3: Transfer to Jodhpur';
        }
      });
    });

    const btnAddDay = document.getElementById('btn-add-day');
    if (btnAddDay) {
      btnAddDay.addEventListener('click', function () {
        showToast('Day 4 added to your itinerary sequence!');
        btnAddDay.textContent = '+ Add Day 5';
      });
    }

    // --- FEATURE D: Add Activity Form & Delete Activities ---
    const formAddItem = document.getElementById('form-add-item');
    const activitiesContainer = document.getElementById('activities-container');

    if (formAddItem && activitiesContainer) {
      formAddItem.addEventListener('submit', async function (e) {
        e.preventDefault();
        const title = document.getElementById('item-input-title').value;
        const time = document.getElementById('item-input-time').value || '11:00 AM';
        const duration = document.getElementById('item-input-duration').value || '90';
        const address = document.getElementById('item-input-address').value || 'Local Area';
        const estCost = parseInt(document.getElementById('item-input-est-cost').value, 10) || 0;
        const notes = document.getElementById('item-input-notes').value;

        let itemId = `it-${Date.now()}`;
        if (state.isAuthenticated && state.activeTripId) {
          try {
            const activeDayBtn = document.querySelector('.day-select-btn.active');
            const dayKey = (activeDayBtn && activeDayBtn.getAttribute('data-day')) || 'day-1';
            const res = await apiFetch(`/api/workspace/trips/${encodeURIComponent(state.activeTripId)}/itinerary`, {
              method: 'POST',
              body: JSON.stringify({
                dayKey,
                timeLabel: time,
                durationLabel: `${duration} mins`,
                title,
                location: address,
                notes,
                estimatedCostPaise: estCost * 100
              })
            });
            if (res.item && res.item.id) itemId = res.item.id;
          } catch (err) {
            showToast(err.message || 'Could not save itinerary item to D1.');
            return;
          }
        }

        const card = document.createElement('article');
        card.className = 'activity-card';
        card.setAttribute('data-item-id', itemId);
        card.innerHTML = `
          <div class="activity-time-col">
            <span class="activity-time">${time}</span>
            <span class="activity-duration">${duration} mins</span>
          </div>
          <div class="activity-body">
            <h4 class="activity-title">${title}</h4>
            <div class="activity-location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <span>${address}</span>
            </div>
            ${notes ? `<p class="activity-notes">${notes}</p>` : ''}
          </div>
          <div class="activity-cost-col">
            <span class="cost-estimate-label">Estimated Cost</span>
            <span class="cost-estimate-val">₹${estCost.toLocaleString('en-IN')}</span>
            <button class="btn-delete-item" type="button" title="Delete activity" aria-label="Delete activity">×</button>
          </div>
        `;
        activitiesContainer.appendChild(card);
        closeAllModals();
        showToast(`Added "${title}" with Est. ₹${estCost.toLocaleString('en-IN')}`);
      });

      activitiesContainer.addEventListener('click', async function (e) {
        const deleteBtn = e.target.closest('.btn-delete-item');
        if (deleteBtn) {
          if (state.isOffline) {
            showToast('Offline Mode: Deleting items requires network connectivity.');
            return;
          }
          const card = deleteBtn.closest('.activity-card');
          const itemId = card && card.getAttribute('data-item-id');
          if (state.isAuthenticated && state.activeTripId && itemId) {
            try {
              await apiFetch(`/api/workspace/trips/${encodeURIComponent(state.activeTripId)}/itinerary/${encodeURIComponent(itemId)}`, {
                method: 'DELETE'
              });
            } catch (err) {
              showToast(err.message || 'Could not delete item from D1.');
              return;
            }
          }
          if (card) {
            card.remove();
            showToast('Activity removed from itinerary.');
          }
        }
      });
    }

    // --- FEATURE E: Maps & Routes View Toggle ---
    const btnViewBoth = document.getElementById('btn-view-both');
    const btnViewMapOnly = document.getElementById('btn-view-map-only');
    const btnViewListOnly = document.getElementById('btn-view-list-only');
    const mapViewContainer = document.getElementById('map-view-container');
    const mapCanvas = document.querySelector('.map-mockup-canvas');
    const mapList = document.querySelector('.map-list-fallback');

    if (btnViewBoth && btnViewMapOnly && btnViewListOnly && mapViewContainer) {
      function resetMapTabs() {
        btnViewBoth.classList.remove('active');
        btnViewMapOnly.classList.remove('active');
        btnViewListOnly.classList.remove('active');
      }

      btnViewBoth.addEventListener('click', function () {
        resetMapTabs();
        btnViewBoth.classList.add('active');
        mapViewContainer.style.gridTemplateColumns = '1fr 1fr';
        if (mapCanvas) mapCanvas.style.display = 'flex';
        if (mapList) mapList.style.display = 'block';
      });

      btnViewMapOnly.addEventListener('click', function () {
        resetMapTabs();
        btnViewMapOnly.classList.add('active');
        mapViewContainer.style.gridTemplateColumns = '1fr';
        if (mapCanvas) mapCanvas.style.display = 'flex';
        if (mapList) mapList.style.display = 'none';
      });

      btnViewListOnly.addEventListener('click', function () {
        resetMapTabs();
        btnViewListOnly.classList.add('active');
        mapViewContainer.style.gridTemplateColumns = '1fr';
        if (mapCanvas) mapCanvas.style.display = 'none';
        if (mapList) mapList.style.display = 'block';
      });
    }

    // --- FEATURE F: Bookings Vault Add & Delete ---
    const formAddBooking = document.getElementById('form-add-booking');
    const bookingsContainer = document.getElementById('bookings-container');

    if (formAddBooking && bookingsContainer) {
      formAddBooking.addEventListener('submit', async function (e) {
        e.preventDefault();
        const cat = document.getElementById('booking-input-cat').value;
        const provider = document.getElementById('booking-input-provider').value;
        const pnr = document.getElementById('booking-input-pnr').value || 'REF-N/A';
        const amount = parseInt(document.getElementById('booking-input-amount').value, 10) || 0;
        const notes = document.getElementById('booking-input-notes').value;

        let noteId = `bnote-${Date.now()}`;
        if (state.isAuthenticated && state.activeTripId) {
          try {
            const res = await apiFetch(`/api/workspace/trips/${encodeURIComponent(state.activeTripId)}/booking-notes`, {
              method: 'POST',
              body: JSON.stringify({
                category: cat,
                provider,
                reference: pnr,
                notes,
                amountPaise: amount * 100,
                isSimulated: false
              })
            });
            if (res.bookingNote && res.bookingNote.id) noteId = res.bookingNote.id;
          } catch (err) {
            showToast(err.message || 'Could not save booking note to D1.');
            return;
          }
        }

        const card = document.createElement('article');
        card.className = 'booking-card';
        card.setAttribute('data-booking-note-id', noteId);
        card.innerHTML = `
          <div class="booking-card-top">
            <div class="booking-type-badge cat-${cat}">${cat}</div>
            <div class="booking-amount">₹${amount.toLocaleString('en-IN')}</div>
          </div>
          <h4 class="booking-provider">${provider}</h4>
          <div class="booking-pnr">
            <span>Reference / PNR:</span>
            <code>${pnr}</code>
          </div>
          ${notes ? `<p class="booking-notes">${notes}</p>` : ''}
          <div class="booking-card-actions">
            <span style="font-size: 0.75rem; color: var(--color-text-muted);">Added by ${state.userDisplayName || 'Owner'}</span>
            <button class="btn-delete-booking" type="button" title="Delete booking note" aria-label="Delete booking note">Delete</button>
          </div>
        `;
        bookingsContainer.prepend(card);
        closeAllModals();
        showToast(`Saved personal note for ${provider} in Bookings Vault.`);
      });

      bookingsContainer.addEventListener('click', async function (e) {
        const deleteBtn = e.target.closest('.btn-delete-booking');
        if (deleteBtn) {
          if (state.isOffline) {
            showToast('Offline Mode: Deleting records requires network connectivity.');
            return;
          }
          const card = deleteBtn.closest('.booking-card');
          const noteId = card && card.getAttribute('data-booking-note-id');
          if (state.isAuthenticated && state.activeTripId && noteId) {
            try {
              await apiFetch(`/api/workspace/trips/${encodeURIComponent(state.activeTripId)}/booking-notes/${encodeURIComponent(noteId)}`, {
                method: 'DELETE'
              });
            } catch (err) {
              showToast(err.message || 'Could not delete booking note from D1.');
              return;
            }
          }
          if (card) {
            card.remove();
            showToast('Personal booking note removed.');
          }
        }
      });
    }

    // --- FEATURE G: Paise-Safe Expenses (Handled by initExpensesLedger) ---

    // --- FEATURE H: Offline Caching & Cache Purging ---
    const btnSaveOffline = document.getElementById('btn-save-offline');
    const offlineSyncStatus = document.getElementById('offline-sync-status');
    const badgeOfflineReady = document.getElementById('badge-offline-ready');

    if (btnSaveOffline) {
      btnSaveOffline.addEventListener('click', function () {
        const trip = state.trips.find(t => t.id === state.activeTripId) || state.trips[0];
        const snapshot = {
          tripId: state.activeTripId,
          name: trip.name,
          destination: trip.destination,
          savedAt: new Date().toISOString(),
          cachedEssentials: {
            days: 3,
            bookings: 2,
            expenses: 5
          }
        };
        try {
          localStorage.setItem(scopedStorageKey(`offline_${state.activeTripId}`), JSON.stringify(snapshot));
          const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (offlineSyncStatus) {
            offlineSyncStatus.innerHTML = `<strong>Sync Status:</strong> Saved offline at ${time} • Cached read-only snapshot.`;
          }
          if (badgeOfflineReady) badgeOfflineReady.classList.add('unlocked');
          showToast('Trip essentials saved for offline access!');
        } catch (err) {
          showToast('Could not write offline snapshot to browser storage.');
        }
      });
    }

    const btnClearCache = document.getElementById('btn-clear-cache');
    if (btnClearCache) {
      btnClearCache.addEventListener('click', function () {
        let cleared = 0;
        const offlinePrefix = scopedStoragePrefix('offline_');
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith(offlinePrefix)) {
            localStorage.removeItem(key);
            cleared++;
          }
        });
        if (offlineSyncStatus) {
          offlineSyncStatus.textContent = 'Sync Status: Online • Offline cache empty.';
        }
        showToast(cleared > 0 ? `Cleared ${cleared} cached trip snapshot(s).` : 'Offline cache is already clean.');
      });
    }

    // Sign out (clears offline and user-scoped cached data and redirects to index.html)
    const btnSignOut = document.getElementById('btn-sign-out');
    if (btnSignOut) {
      btnSignOut.addEventListener('click', async function () {
        if (confirm('Sign out of YatraSathi? Cached offline snapshots will be cleared for your privacy.')) {
          clearAllUserStorage();
          try {
            await fetch(getApiBase() + '/api/auth/sign-out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: '{}'
            });
          } catch (e) {
            console.warn(e);
          }
          window.location.href = 'index.html';
        }
      });
    }
  }

  // --- 7. State Simulator (Loading, Empty, Offline, Error) ---
  function initSimulator() {
    const stateSelect = document.getElementById('state-simulator-select');
    const offlineBanner = document.getElementById('offline-banner');
    const simulatedErrorBanner = document.getElementById('simulated-error-banner');
    const dashboardEmptyState = document.getElementById('dashboard-empty-state');
    const tripsContainer = document.getElementById('trips-container');

    if (!stateSelect) return;

    stateSelect.addEventListener('change', function () {
      const mode = stateSelect.value;
      state.uiMode = mode;

      if (offlineBanner) offlineBanner.classList.remove('show');
      if (simulatedErrorBanner) simulatedErrorBanner.style.display = 'none';
      if (dashboardEmptyState) dashboardEmptyState.style.display = 'none';
      if (tripsContainer) tripsContainer.style.display = 'grid';
      state.isOffline = false;

      if (mode === 'offline') {
        state.isOffline = true;
        if (offlineBanner) offlineBanner.classList.add('show');
        showToast('Switched to Read-Only Offline mode.');
      } else if (mode === 'empty') {
        if (dashboardEmptyState) dashboardEmptyState.style.display = 'block';
        if (tripsContainer) tripsContainer.style.display = 'none';
        if (typeof window.__yatraRenderDashboard === 'function') window.__yatraRenderDashboard();
        showToast('Simulating empty traveler workspace.');
      } else if (mode === 'error') {
        if (simulatedErrorBanner) simulatedErrorBanner.style.display = 'flex';
        showToast('Simulating network / authorization error.');
      } else if (mode === 'loading') {
        showToast('Simulating skeleton loaders...');
        setTimeout(() => {
          stateSelect.value = 'normal';
          showToast('Loaded!');
        }, 1200);
      } else {
        if (typeof window.__yatraRenderDashboard === 'function') window.__yatraRenderDashboard();
        showToast('Reset to normal interactive state.');
      }
    });

    const btnRetryError = document.getElementById('btn-retry-error');
    if (btnRetryError) {
      btnRetryError.addEventListener('click', function () {
        if (simulatedErrorBanner) simulatedErrorBanner.style.display = 'none';
        if (stateSelect && stateSelect.value === 'error') {
          stateSelect.value = 'normal';
          showToast('Retry successful!');
          return;
        }
        initWorkerSessionBridge();
      });
    }
  }

  // --- 8. Cloudflare Workers + Better Auth Session Bridge ---
  function hydrateAuthenticatedWorkspace(payload) {
    if (!payload || !payload.ok) return;
    state.dataSourceLabel = 'Cloudflare D1';

    if (payload.user) {
      state.userId = payload.user.id || null;
      clearLegacyUnscopedStorage();
      state.userDisplayName = payload.user.name || payload.user.email || state.userDisplayName;
      state.userEmail = payload.user.email || '';
      state.userEmailVerified = Boolean(payload.user.emailVerified);
      const sidebarName = document.querySelector('.sidebar-user-name');
      if (sidebarName) sidebarName.textContent = state.userDisplayName;
      const profileEmail = document.getElementById('profile-email');
      if (profileEmail && payload.user.email) profileEmail.value = payload.user.email;
      const verifStatusEl = document.getElementById('profile-verification-status');
      const btnLinkGoogle = document.getElementById('btn-link-google');
      if (verifStatusEl) {
        verifStatusEl.textContent = state.userEmailVerified
          ? 'Email Status: Verified — you can link your matching Google account below.'
          : 'Email Status: Unverified — Google account linking is unavailable until your email is verified (email verification is not configured).';
      }
      if (btnLinkGoogle) {
        btnLinkGoogle.disabled = !state.userEmailVerified;
        btnLinkGoogle.style.display = state.userEmailVerified ? 'inline-flex' : 'none';
        btnLinkGoogle.title = state.userEmailVerified
          ? 'Link matching Google account'
          : 'Unavailable until email is verified';
      }
    }

    if (payload.profile) {
      const nameInput = document.getElementById('profile-name');
      const phoneInput = document.getElementById('profile-phone');
      const pacingInput = document.getElementById('profile-pacing');
      const budgetPrefInput = document.getElementById('profile-budget-pref');
      if (nameInput && payload.profile.displayName) nameInput.value = payload.profile.displayName;
      if (phoneInput) phoneInput.value = payload.profile.phone || '';
      if (pacingInput && payload.profile.pacing) pacingInput.value = payload.profile.pacing;
      if (budgetPrefInput && payload.profile.budgetPref) budgetPrefInput.value = payload.profile.budgetPref;
      if (Array.isArray(payload.profile.interests)) {
        document.querySelectorAll('#profile-interests-group [data-interest]').forEach(btn => {
          const active = payload.profile.interests.includes(btn.getAttribute('data-interest'));
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      }
    }

    state.savedDestinations = new Set(payload.savedDestinations || []);
    document.querySelectorAll('.btn-save-dest').forEach(btn => {
      const did = btn.getAttribute('data-dest-id') || btn.closest('.destination-card')?.getAttribute('data-dest-id');
      btn.textContent = state.savedDestinations.has(did) ? '✔ Saved' : 'Save Destination';
    });
    const savedDestCountEl = document.getElementById('saved-dest-count');
    if (savedDestCountEl) savedDestCountEl.textContent = state.savedDestinations.size;
    const sidebarSavedBadge = document.getElementById('sidebar-saved-dest-badge');
    if (sidebarSavedBadge) {
      sidebarSavedBadge.textContent = state.savedDestinations.size > 0
        ? `${state.savedDestinations.size} Saved`
        : '5 Curated';
    }

    state.trips = Array.isArray(payload.trips) ? payload.trips : [];
    state.activeTripId = state.trips[0] ? state.trips[0].id : null;
    state.itineraryItems = Array.isArray(payload.itineraryItems) ? payload.itineraryItems : [];
    state.bookingNotes = Array.isArray(payload.bookingNotes) ? payload.bookingNotes : [];
    state.reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
    state.unlockedBadges = new Set(Array.isArray(payload.achievements) ? payload.achievements : []);
    state.recentActivity = Array.isArray(payload.recentActivity) ? payload.recentActivity : [];

    renderActiveTripItineraryList(state.activeTripId);

    const bookingsContainer = document.getElementById('bookings-container');
    if (bookingsContainer) {
      bookingsContainer.innerHTML = state.bookingNotes.length
        ? state.bookingNotes.map(b => `
          <article class="booking-card" data-booking-note-id="${b.id}">
            <div class="booking-card-top">
              <div class="booking-type-badge cat-${b.category}">${b.category}</div>
              <div class="booking-amount">₹${Math.round((b.amountPaise || 0) / 100).toLocaleString('en-IN')}</div>
            </div>
            <h4 class="booking-provider">${b.provider}</h4>
            <div class="booking-pnr"><span>Reference / PNR:</span><code>${b.reference || 'REF-N/A'}</code></div>
            ${b.notes ? `<p class="booking-notes">${b.notes}</p>` : ''}
            <div class="booking-card-actions">
              <span style="font-size: 0.75rem; color: var(--color-text-muted);">${b.isSimulated ? 'Simulated Demo Note' : 'Personal Note (D1)'}</span>
              <button class="btn-delete-booking" type="button" title="Delete booking note" aria-label="Delete booking note">Delete</button>
            </div>
          </article>
        `).join('')
        : '<div class="empty-state-card" style="padding: var(--space-lg);"><h3 class="empty-state-title">No booking notes saved</h3><p class="empty-state-desc">Add a personal booking reference note above.</p></div>';
    }

    if (typeof window.__yatraSetExpenses === 'function') {
      window.__yatraSetExpenses(Array.isArray(payload.expenses) ? payload.expenses : []);
    }
    if (state.activeTripId) syncActiveTripUI(state.activeTripId);
    if (typeof window.__yatraRenderMyTrips === 'function') window.__yatraRenderMyTrips();
    if (typeof window.__yatraRenderDashboard === 'function') window.__yatraRenderDashboard();
    if (typeof window.__yatraRenderAchievements === 'function') window.__yatraRenderAchievements();
    if (typeof window.__yatraRenderReviews === 'function') window.__yatraRenderReviews();
  }

  function initWorkerSessionBridge() {
    const backendStatusTag = document.getElementById('backend-status-tag');
    const backendStatusDesc = document.getElementById('backend-status-desc');

    fetch(getApiBase() + '/api/auth/get-session', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data && data.user) {
          state.isAuthenticated = true;
          state.userDisplayName = data.user.name || data.user.email || state.userDisplayName;
          const sidebarName = document.querySelector('.sidebar-user-name');
          if (sidebarName) sidebarName.textContent = state.userDisplayName;
          if (backendStatusTag) {
            backendStatusTag.textContent = 'Worker + D1 Live';
            backendStatusTag.style.background = 'var(--color-brand-teal)';
            backendStatusTag.style.color = '#FFF';
          }
          if (backendStatusDesc) {
            backendStatusDesc.textContent = `Signed in via Better Auth (${data.user.email}).`;
          }
          return apiFetch('/api/workspace/bootstrap')
            .then(hydrateAuthenticatedWorkspace)
            .catch((err) => {
              const errBanner = document.getElementById('simulated-error-banner');
              const errText = document.getElementById('error-banner-text');
              if (errText) {
                if (err && err.status === 401) {
                  errText.innerHTML = '<strong>Session Expired:</strong> Please sign in again to load your private D1 trips.';
                } else if (err && err.status === 403) {
                  errText.innerHTML = '<strong>Access Denied (403):</strong> You do not have permission for this trip.';
                } else if (err && err.status >= 500) {
                  errText.innerHTML = `<strong>Server / D1 Error (${err.status}):</strong> Could not query D1 workspace tables. Local data was preserved.`;
                } else {
                  errText.innerHTML = '<strong>Synchronization Failed:</strong> Network error while loading D1 workspace. Local data was preserved.';
                }
              }
              if (errBanner) errBanner.style.display = 'flex';
              showToast('Could not load saved D1 workspace data.');
            });
        } else {
          state.isAuthenticated = false;
          state.userId = null;
          state.trips = [];
          state.activeTripId = null;
          state.itineraryItems = [];
          state.bookingNotes = [];
          state.savedDestinations = new Set();
          state.unlockedBadges = new Set();
          state.recentActivity = [];
          if (backendStatusTag) {
            backendStatusTag.textContent = 'Sign-In Required';
            backendStatusTag.style.background = 'var(--color-brand-saffron)';
            backendStatusTag.style.color = 'var(--color-brand-ink)';
          }
          if (backendStatusDesc) {
            backendStatusDesc.textContent = 'No active Better Auth session. Redirecting to sign in...';
          }
          window.location.replace('/index.html?auth=required');
        }
      })
      .catch(() => {
        state.isAuthenticated = false;
        if (backendStatusTag) backendStatusTag.textContent = 'Static Preview';
        if (backendStatusDesc) backendStatusDesc.textContent = 'Worker session endpoint unavailable in static preview.';
      });
  }

  // --- 9. Itinerary Planning Modes, Linked Map, Route Comparison & Customise ---
  function initItineraryRoutePlanner() {
    const optionsListEl = document.getElementById('itinerary-options-list');
    const compareGridEl = document.getElementById('route-compare-grid');
    const customisePanelEl = document.getElementById('customise-builder-panel');
    const modeButtons = document.querySelectorAll('.planning-mode-btn');
    const mapEl = document.getElementById('itinerary-leaflet-map');
    const mapFallbackEl = document.getElementById('itinerary-map-fallback');
    const mapBadgeEl = document.getElementById('itinerary-map-badge');
    const detailOrderEl = document.getElementById('place-detail-order');
    const detailTimeEl = document.getElementById('place-detail-time');
    const detailNameEl = document.getElementById('place-detail-name');
    const detailDescEl = document.getElementById('place-detail-desc');
    const placeSelectEl = document.getElementById('customise-place-select');
    const customiseStopsEl = document.getElementById('customise-stops-list');
    const customiseTotalsEl = document.getElementById('customise-totals-pill');
    const btnAddCurated = document.getElementById('btn-customise-add-curated');
    const formCustomPlace = document.getElementById('form-customise-place');
    const btnSaveCustomise = document.getElementById('btn-save-customise-route');

    if (!optionsListEl || !compareGridEl) return;

    const DEST_CATALOG = {
      rajasthan: {
        places: [
          { id: 'raj-1', name: 'Heritage Haveli (Bani Park)', visitTime: '09:30 AM – 10:15 AM', durationMins: 45, location: 'Bani Park, Jaipur', estCost: 0, notes: 'Base check-in & morning chai.', lat: 26.9260, lng: 75.7920 },
          { id: 'raj-2', name: 'City Palace & Jantar Mantar', visitTime: '10:45 AM – 01:15 PM', durationMins: 150, location: 'Old City, Pink City', estCost: 1200, notes: 'Composite ticket includes observatory.', lat: 26.9258, lng: 75.8237 },
          { id: 'raj-3', name: 'Hawa Mahal & Bapu Bazaar', visitTime: '02:00 PM – 03:45 PM', durationMins: 105, location: 'Sireh Deori, Jaipur', estCost: 450, notes: 'Iconic facade & local craft lanes.', lat: 26.9239, lng: 75.8267 },
          { id: 'raj-4', name: 'Nahargarh Fort Sunset', visitTime: '04:30 PM – 06:30 PM', durationMins: 120, location: 'Aravalli Hills, Jaipur', estCost: 350, notes: 'Panoramic twilight city views.', lat: 26.9373, lng: 75.8155 },
          { id: 'raj-5', name: 'Amer Fort & Stepwell', visitTime: '09:00 AM – 11:30 AM', durationMins: 150, location: 'Amer, Jaipur', estCost: 800, notes: 'Hilltop palace & Panna Meena Kund.', lat: 26.9855, lng: 75.8513 }
        ],
        ai: [
          {
            id: 'raj-ai-scenic',
            title: 'Option 1 — Scenic Heritage Loop',
            recommended: true,
            desc: 'Balanced pacing through Pink City palaces, bazaar lanes, and Aravalli sunset.',
            perks: ['Scenic hill approach', 'Golden-hour fort finish'],
            totalKm: 18,
            totalDuration: '~55 min transit (est.)',
            stops: [
              { placeId: 'raj-1', legKm: 0, legMin: 0 },
              { placeId: 'raj-2', legKm: 4, legMin: 15 },
              { placeId: 'raj-3', legKm: 2, legMin: 8 },
              { placeId: 'raj-4', legKm: 12, legMin: 32 }
            ]
          },
          {
            id: 'raj-ai-quick',
            title: 'Option 2 — Quick Royal Highlights',
            recommended: false,
            desc: 'Compact inner-city circuit with minimal hill transit.',
            perks: ['Shortest total distance', 'Fewer road transfers'],
            totalKm: 13,
            totalDuration: '~38 min transit (est.)',
            stops: [
              { placeId: 'raj-1', legKm: 0, legMin: 0 },
              { placeId: 'raj-5', legKm: 9, legMin: 24 },
              { placeId: 'raj-2', legKm: 4, legMin: 14 }
            ]
          }
        ],
        fast: [
          {
            id: 'raj-fast-1',
            title: 'Option 1 — Direct Core Express',
            recommended: true,
            desc: 'Minimises cross-city travel by grouping Old City landmarks together.',
            perks: ['Minimal travel time', 'Walkable Old City cluster'],
            totalKm: 6,
            totalDuration: '~22 min transit (est.)',
            stops: [
              { placeId: 'raj-1', legKm: 0, legMin: 0 },
              { placeId: 'raj-2', legKm: 4, legMin: 15 },
              { placeId: 'raj-3', legKm: 2, legMin: 7 }
            ]
          },
          {
            id: 'raj-fast-2',
            title: 'Option 2 — Morning Fort & Palace',
            recommended: false,
            desc: 'Early Amer ascent before midday traffic builds.',
            perks: ['Morning-first sequence', '2 major landmarks'],
            totalKm: 13,
            totalDuration: '~38 min transit (est.)',
            stops: [
              { placeId: 'raj-5', legKm: 0, legMin: 0 },
              { placeId: 'raj-2', legKm: 9, legMin: 24 },
              { placeId: 'raj-1', legKm: 4, legMin: 14 }
            ]
          }
        ]
      },
      kerala: {
        places: [
          { id: 'ker-1', name: 'Munnar Tea Museum', visitTime: '09:30 AM – 11:00 AM', durationMins: 90, location: 'Nallathanni, Munnar', estCost: 300, notes: 'Heritage tea processing tour.', lat: 10.0977, lng: 77.0531 },
          { id: 'ker-2', name: 'Mattupetty Dam & Echo Point', visitTime: '11:30 AM – 01:30 PM', durationMins: 120, location: 'Mattupetty, Munnar', estCost: 200, notes: 'Lakeside hills & boating.', lat: 10.1066, lng: 77.1235 },
          { id: 'ker-3', name: 'Top Station Mist Viewpoint', visitTime: '02:30 PM – 04:00 PM', durationMins: 90, location: 'Munnar Border', estCost: 150, notes: 'Western Ghats valley views.', lat: 10.1259, lng: 77.2454 },
          { id: 'ker-4', name: 'Spice Garden Trail', visitTime: '04:45 PM – 06:00 PM', durationMins: 75, location: 'Chithirapuram', estCost: 400, notes: 'Cardamom & pepper walk.', lat: 10.0566, lng: 77.0419 }
        ],
        ai: [
          {
            id: 'ker-ai-scenic',
            title: 'Option 1 — Scenic Tea & Valley Loop',
            recommended: true,
            desc: 'Follows winding tea-estate ridges with lakeside and valley stops.',
            perks: ['Tea-estate ridge roads', 'Balanced 3-stop day'],
            totalKm: 32,
            totalDuration: '~1 hr 15 min transit (est.)',
            stops: [
              { placeId: 'ker-1', legKm: 0, legMin: 0 },
              { placeId: 'ker-2', legKm: 13, legMin: 30 },
              { placeId: 'ker-3', legKm: 19, legMin: 45 }
            ]
          },
          {
            id: 'ker-ai-quick',
            title: 'Option 2 — Relaxed Spice & Lake',
            recommended: false,
            desc: 'Shorter lower-elevation circuit ideal for misty afternoons.',
            perks: ['Shorter hill drive', 'Relaxed afternoon pace'],
            totalKm: 23,
            totalDuration: '~52 min transit (est.)',
            stops: [
              { placeId: 'ker-1', legKm: 0, legMin: 0 },
              { placeId: 'ker-2', legKm: 13, legMin: 30 },
              { placeId: 'ker-4', legKm: 10, legMin: 22 }
            ]
          }
        ],
        fast: [
          {
            id: 'ker-fast-1',
            title: 'Option 1 — Munnar Core Express',
            recommended: true,
            desc: 'Stays close to town to minimise ghat driving.',
            perks: ['Minimal hill driving', 'Easy return before dusk'],
            totalKm: 23,
            totalDuration: '~52 min transit (est.)',
            stops: [
              { placeId: 'ker-1', legKm: 0, legMin: 0 },
              { placeId: 'ker-4', legKm: 10, legMin: 22 },
              { placeId: 'ker-2', legKm: 13, legMin: 30 }
            ]
          },
          {
            id: 'ker-fast-2',
            title: 'Option 2 — Ridge Two-Stop',
            recommended: false,
            desc: 'Two key viewpoints in half a day.',
            perks: ['2 focused stops', 'Open evening'],
            totalKm: 13,
            totalDuration: '~30 min transit (est.)',
            stops: [
              { placeId: 'ker-1', legKm: 0, legMin: 0 },
              { placeId: 'ker-2', legKm: 13, legMin: 30 }
            ]
          }
        ]
      }
    };

    const plannerState = {
      mode: 'ai',
      themeKey: 'rajasthan',
      selectedOptionId: 'raj-ai-scenic',
      selectedStopIndex: 0,
      customStops: []
    };

    function getThemeCatalog() {
      return DEST_CATALOG[plannerState.themeKey] || DEST_CATALOG.rajasthan;
    }

    function getPlaceById(placeId) {
      return getThemeCatalog().places.find(p => p.id === placeId) || getThemeCatalog().places[0];
    }

    function getCurrentOptions() {
      const cat = getThemeCatalog();
      return plannerState.mode === 'fast' ? cat.fast : cat.ai;
    }

    function getActiveStopsForMap() {
      if (plannerState.mode === 'customise') {
        return plannerState.customStops;
      }
      const options = getCurrentOptions();
      const opt = options.find(o => o.id === plannerState.selectedOptionId) || options[0];
      return opt.stops.map(s => {
        const p = getPlaceById(s.placeId);
        return Object.assign({}, p, { legKm: s.legKm, legMin: s.legMin });
      });
    }

    function updatePlaceDetail(stop, index) {
      if (!stop) {
        if (detailOrderEl) detailOrderEl.textContent = 'No stops';
        if (detailTimeEl) detailTimeEl.textContent = '--';
        if (detailNameEl) detailNameEl.textContent = 'Add a stop to preview';
        if (detailDescEl) detailDescEl.textContent = 'Use the Customise controls to add places and update the route map.';
        return;
      }
      if (detailOrderEl) detailOrderEl.textContent = `Stop #${index + 1}`;
      if (detailTimeEl) detailTimeEl.textContent = stop.visitTime || 'Custom timing';
      if (detailNameEl) detailNameEl.textContent = stop.name;
      if (detailDescEl) {
        const costText = stop.estCost ? `Est. ₹${stop.estCost.toLocaleString('en-IN')}` : 'Est. ₹0';
        detailDescEl.textContent = `${stop.location || 'Local stop'} • ${costText} — ${stop.notes || 'Custom itinerary stop.'}`;
      }
    }

    function renderMap() {
      const stops = getActiveStopsForMap();

      if (!stops.length) {
        updatePlaceDetail(null, 0);
        return;
      }

      if (plannerState.selectedStopIndex >= stops.length) {
        plannerState.selectedStopIndex = 0;
      }

      updatePlaceDetail(stops[plannerState.selectedStopIndex], plannerState.selectedStopIndex);

      renderLeafletMap({
        mapEl,
        fallbackEl: mapFallbackEl,
        badgeEl: mapBadgeEl,
        stops,
        focusedIndex: plannerState.selectedStopIndex,
        onMarkerSelect: (idx) => {
          plannerState.selectedStopIndex = idx;
          updatePlaceDetail(stops[idx], idx);
          renderMap();
        }
      });
    }

    function applyStopsToDayItinerary(stops, routeLabel) {
      if (state.isOffline) {
        showToast('Offline Mode: Saving itinerary changes requires internet connectivity.');
        return;
      }
      const container = document.getElementById('activities-container');
      if (container && stops.length) {
        container.innerHTML = '';
        let totalEst = 0;
        stops.forEach(stop => {
          const est = Number(stop.estCost) || 0;
          totalEst += est;
          const card = document.createElement('article');
          card.className = 'activity-card';
          card.innerHTML = `
            <div class="activity-time-col">
              <span class="activity-time">${(stop.visitTime || '10:00 AM').split('–')[0].trim()}</span>
              <span class="activity-duration">${stop.durationMins || 90} mins</span>
            </div>
            <div class="activity-body">
              <h4 class="activity-title">${stop.name}</h4>
              <div class="activity-location">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <span>${stop.location || 'Local Area'}</span>
              </div>
              <p class="activity-notes">${stop.notes || 'Added from Itinerary Builder route.'}</p>
            </div>
            <div class="activity-cost-col">
              <span class="cost-estimate-label">Estimated Cost</span>
              <span class="cost-estimate-val">₹${est.toLocaleString('en-IN')}</span>
              <button class="btn-delete-item" type="button" title="Delete activity" aria-label="Delete activity">×</button>
            </div>
          `;
          container.appendChild(card);
        });

        const dayTotalBadge = document.querySelector('#section-itinerary-builder .sticker');
        if (dayTotalBadge) dayTotalBadge.textContent = `Day Est. Total: ₹${totalEst.toLocaleString('en-IN')}`;
      }

      try {
        localStorage.setItem(scopedStorageKey(`route_${state.activeTripId}`), JSON.stringify({
          routeLabel: routeLabel,
          stops: stops.map(s => s.name),
          savedAt: new Date().toISOString()
        }));
      } catch (e) {
        // Ignore storage quota issues
      }

      showToast(`Saved "${routeLabel}" (${stops.length} stops) to your trip itinerary!`);
    }

    function renderOptionsAndComparison() {
      const options = getCurrentOptions();
      if (!options.some(o => o.id === plannerState.selectedOptionId)) {
        plannerState.selectedOptionId = options[0].id;
      }

      optionsListEl.innerHTML = '';
      compareGridEl.innerHTML = '';

      options.forEach(opt => {
        const isSelected = opt.id === plannerState.selectedOptionId;
        const resolvedStops = opt.stops.map(s => Object.assign({}, getPlaceById(s.placeId), s));

        // Option Card
        const card = document.createElement('article');
        card.className = `route-option-card${isSelected ? ' selected' : ''}`;
        const stopsHtml = resolvedStops.map((st, idx) => `
          <li>
            ${idx > 0 ? `<div class="route-leg-meta">↳ ${st.legKm} km • Est. ~${st.legMin} min travel</div>` : ''}
            <div class="route-stop-row">
              <div class="route-stop-left">
                <span class="route-stop-num">${idx + 1}</span>
                <span class="route-stop-name">${st.name}</span>
              </div>
              <span class="route-stop-time">${st.visitTime}</span>
            </div>
          </li>
        `).join('');

        card.innerHTML = `
          <div class="route-option-top">
            <h3 class="route-option-title">${opt.title}</h3>
            ${opt.recommended ? '<span class="route-recommended-badge">Recommended</span>' : ''}
          </div>
          <p class="route-option-desc">${opt.desc}</p>
          <ul class="route-option-stops">${stopsHtml}</ul>
          <div class="route-option-footer">
            <span class="route-total-pill">Total: ${opt.totalKm} km • ${opt.totalDuration}</span>
            <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-select-route" style="min-height: 40px; padding: 6px 14px; font-size: 0.8125rem;">
              ${isSelected ? 'Selected on Map' : 'Preview on Map'}
            </button>
          </div>
        `;

        card.querySelector('.btn-select-route').addEventListener('click', function () {
          plannerState.selectedOptionId = opt.id;
          plannerState.selectedStopIndex = 0;
          window.__yatraRenderItineraryMap = renderMap;
    renderOptionsAndComparison();
          renderMap();
        });
        optionsListEl.appendChild(card);

        // Comparison Card
        const comp = document.createElement('article');
        comp.className = `route-compare-card${isSelected ? ' selected' : ''}`;
        comp.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <strong style="font-size: 0.875rem;">${opt.title.split('—')[0].trim()}</strong>
            ${opt.recommended ? '<span class="route-recommended-badge">Best Fit</span>' : ''}
          </div>
          <div class="route-compare-metrics">${opt.totalKm} km • ${opt.totalDuration}</div>
          <ul class="route-compare-perks">
            ${opt.perks.map(p => `<li>✓ ${p}</li>`).join('')}
          </ul>
          <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-save-compared" style="width: 100%; min-height: 40px; padding: 6px 12px; font-size: 0.8125rem;">
            Select &amp; Save
          </button>
        `;
        comp.querySelector('.btn-save-compared').addEventListener('click', function () {
          plannerState.selectedOptionId = opt.id;
          plannerState.selectedStopIndex = 0;
          window.__yatraRenderItineraryMap = renderMap;
    renderOptionsAndComparison();
          renderMap();
          applyStopsToDayItinerary(resolvedStops, opt.title);
        });
        compareGridEl.appendChild(comp);
      });
    }

    function renderCustomiseStops() {
      if (!customiseStopsEl) return;
      customiseStopsEl.innerHTML = '';

      let totalKm = 0;
      let totalMin = 0;
      plannerState.customStops.forEach((stop, idx) => {
        if (idx > 0) {
          totalKm += stop.legKm || 5;
          totalMin += stop.legMin || 15;
        }
        const li = document.createElement('li');
        li.className = 'customise-stop-item';
        li.innerHTML = `
          <div style="min-width: 0;">
            <div style="font-weight: 800; font-size: 0.875rem;">${idx + 1}. ${stop.name}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-secondary);">
              ${stop.visitTime}${idx > 0 ? ` • +${stop.legKm || 5} km (~${stop.legMin || 15} min est.)` : ' • Start'}
            </div>
          </div>
          <div class="customise-stop-actions">
            <button type="button" class="btn-reorder-stop" data-move="up" aria-label="Move ${stop.name} up" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn-reorder-stop" data-move="down" aria-label="Move ${stop.name} down" ${idx === plannerState.customStops.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn-reorder-stop" data-move="remove" aria-label="Remove ${stop.name}">×</button>
          </div>
        `;

        li.querySelector('[data-move="up"]').addEventListener('click', function () {
          if (idx === 0) return;
          const temp = plannerState.customStops[idx - 1];
          plannerState.customStops[idx - 1] = plannerState.customStops[idx];
          plannerState.customStops[idx] = temp;
          renderCustomiseStops();
          renderMap();
        });
        li.querySelector('[data-move="down"]').addEventListener('click', function () {
          if (idx >= plannerState.customStops.length - 1) return;
          const temp = plannerState.customStops[idx + 1];
          plannerState.customStops[idx + 1] = plannerState.customStops[idx];
          plannerState.customStops[idx] = temp;
          renderCustomiseStops();
          renderMap();
        });
        li.querySelector('[data-move="remove"]').addEventListener('click', function () {
          plannerState.customStops.splice(idx, 1);
          renderCustomiseStops();
          renderMap();
        });

        customiseStopsEl.appendChild(li);
      });

      if (customiseTotalsEl) {
        customiseTotalsEl.textContent = `${plannerState.customStops.length} stops • Est. ${totalKm} km (~${totalMin} min)`;
      }
    }

    function populateCustomiseSelect() {
      if (!placeSelectEl) return;
      const places = getThemeCatalog().places;
      placeSelectEl.innerHTML = places.map(p => `<option value="${p.id}">${p.name} (${p.visitTime})</option>`).join('');
    }

    function setPlanningMode(mode) {
      plannerState.mode = mode;
      plannerState.selectedStopIndex = 0;

      modeButtons.forEach(btn => {
        const isMatch = btn.getAttribute('data-plan-mode') === mode;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      });

      if (mode === 'customise') {
        optionsListEl.hidden = true;
        optionsListEl.style.display = 'none';
        if (customisePanelEl) customisePanelEl.hidden = false;
        renderCustomiseStops();
      } else {
        optionsListEl.hidden = false;
        optionsListEl.style.display = 'flex';
        if (customisePanelEl) customisePanelEl.hidden = true;
        window.__yatraRenderItineraryMap = renderMap;
    renderOptionsAndComparison();
      }

      renderMap();
    }

    modeButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => setPlanningMode(btn.getAttribute('data-plan-mode')));
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const nextIdx = e.key === 'ArrowRight'
            ? (idx + 1) % modeButtons.length
            : (idx - 1 + modeButtons.length) % modeButtons.length;
          const nextBtn = modeButtons[nextIdx];
          setPlanningMode(nextBtn.getAttribute('data-plan-mode'));
          nextBtn.focus();
        }
      });
    });

    if (btnAddCurated && placeSelectEl) {
      btnAddCurated.addEventListener('click', function () {
        const place = getPlaceById(placeSelectEl.value);
        if (!place) return;
        plannerState.customStops.push(Object.assign({}, place, { legKm: 5, legMin: 15 }));
        renderCustomiseStops();
        renderMap();
        showToast(`Added "${place.name}" to your custom route.`);
      });
    }

    if (formCustomPlace) {
      formCustomPlace.addEventListener('submit', function (e) {
        e.preventDefault();
        const nameInput = document.getElementById('customise-custom-name');
        const timeInput = document.getElementById('customise-custom-time');
        const name = nameInput ? nameInput.value.trim() : '';
        if (!name) {
          showToast('Please enter a place name to add.');
          if (nameInput) nameInput.focus();
          return;
        }
        const count = plannerState.customStops.length;
        const x = 110 + ((count * 95) % 390);
        const y = 85 + ((count * 55) % 165);
        plannerState.customStops.push({
          id: `custom-${Date.now()}`,
          name: name,
          visitTime: (timeInput && timeInput.value.trim()) || '04:00 PM',
          durationMins: 90,
          location: 'Custom Place',
          estCost: 300,
          notes: 'User-added custom itinerary stop.',
          x: x,
          y: y,
          legKm: 6,
          legMin: 18
        });
        if (nameInput) nameInput.value = '';
        renderCustomiseStops();
        renderMap();
        showToast(`Added custom stop "${name}".`);
      });
    }

    if (btnSaveCustomise) {
      btnSaveCustomise.addEventListener('click', function () {
        if (!plannerState.customStops.length) {
          showToast('Add at least one stop before saving your custom route.');
          return;
        }
        applyStopsToDayItinerary(plannerState.customStops, 'Customised Route');
      });
    }

    window.__yatraRefreshItineraryPlanner = function (trip) {
      plannerState.themeKey = (trip && trip.theme && DEST_CATALOG[trip.theme]) ? trip.theme : 'rajasthan';
      const cat = getThemeCatalog();
      plannerState.selectedOptionId = cat.ai[0].id;
      plannerState.customStops = cat.places.slice(0, 3).map((p, idx) => Object.assign({}, p, {
        legKm: idx === 0 ? 0 : 6,
        legMin: idx === 0 ? 0 : 16
      }));
      populateCustomiseSelect();
      setPlanningMode(plannerState.mode);
    };

    window.__yatraRefreshItineraryPlanner(state.trips[0]);
  }

  // --- 10. Dashboard Overview (Real User & Project Data) ---
  function initDashboard() {
    const greetingTextEl = document.getElementById('dash-greeting-text');
    const greetingSubEl = document.getElementById('dash-greeting-sub');
    const sourceBadgeEl = document.getElementById('dash-source-badge');
    const statsPanelEl = document.getElementById('dash-stats-panel');
    const statTripsEl = document.getElementById('dash-stat-trips');
    const statTripsCapEl = document.getElementById('dash-stat-trips-cap');
    const statXpEl = document.getElementById('dash-stat-xp');
    const statXpCapEl = document.getElementById('dash-stat-xp-cap');
    const statBadgesEl = document.getElementById('dash-stat-badges');
    const statBadgesCapEl = document.getElementById('dash-stat-badges-cap');
    const continueCardEl = document.getElementById('dash-continue-card');
    const upcomingListEl = document.getElementById('dash-upcoming-trips-list');
    const progressBodyEl = document.getElementById('dash-progress-body');
    const recommendedGridEl = document.getElementById('dash-recommended-grid');
    const activityListEl = document.getElementById('dash-recent-activity-list');
    const btnDashNewTrip = document.getElementById('btn-dash-new-trip');
    const btnDashQuickPlan = document.getElementById('btn-dash-quick-plan');

    if (!greetingTextEl || !continueCardEl) return;

    function getTimeGreeting() {
      const hour = new Date().getHours();
      if (hour < 12) return 'Good Morning';
      if (hour < 17) return 'Good Afternoon';
      return 'Good Evening';
    }

    function computeTripProgress(trip) {
      let score = 25; // Base trip created
      if (trip.startDate && trip.endDate) score += 25;
      if (trip.budget && trip.budget > 0) score += 25;
      const hasSavedRoute = Boolean(localStorage.getItem(scopedStorageKey(`route_${trip.id}`)));
      const hasOffline = Boolean(localStorage.getItem(scopedStorageKey(`offline_${trip.id}`)));
      if (hasSavedRoute || trip.id === 'trip-1') score += 15;
      if (hasOffline) score += 10;
      return Math.min(100, score);
    }

    function recordActivity(text) {
      state.recentActivity.unshift({ text: text, time: 'Just now' });
      if (state.recentActivity.length > 6) state.recentActivity.pop();
      renderDashboard();
    }

    function renderDashboard() {
      const isLoadingSim = state.uiMode === 'loading';
      const isEmptySimulated = state.uiMode === 'empty';
      const activeTrips = isEmptySimulated ? [] : state.trips;
      const firstName = (state.userDisplayName || 'Traveler').split(' ')[0];

      greetingTextEl.textContent = `${getTimeGreeting()}, ${firstName}`;
      if (greetingSubEl) {
        greetingSubEl.textContent = activeTrips.length > 0
          ? `You have ${activeTrips.length} trip${activeTrips.length === 1 ? '' : 's'} in your workspace. Ready to continue planning?`
          : 'Welcome to YatraSathi. Create your first trip or explore Indian destinations to begin.';
      }
      if (sourceBadgeEl) sourceBadgeEl.textContent = state.dataSourceLabel;

      const achStats = typeof window.__yatraGetAchievementStats === 'function'
        ? window.__yatraGetAchievementStats()
        : { totalXp: 0, unlockedCount: 0, totalBadges: 6 };
      const activityCount = isEmptySimulated
        ? 0
        : document.querySelectorAll('#activities-container .activity-card').length;
      const unlockedBadges = isEmptySimulated ? 0 : achStats.unlockedCount;

      if (statsPanelEl) {
        statsPanelEl.classList.toggle('is-loading', isLoadingSim);
        statsPanelEl.setAttribute('aria-busy', isLoadingSim ? 'true' : 'false');
      }

      if (isLoadingSim) {
        if (statTripsEl) statTripsEl.textContent = '—';
        if (statTripsCapEl) statTripsCapEl.textContent = 'Loading trips...';
        if (statXpEl) statXpEl.textContent = '—';
        if (statXpCapEl) statXpCapEl.textContent = 'Loading XP...';
        if (statBadgesEl) statBadgesEl.textContent = '—';
        if (statBadgesCapEl) statBadgesCapEl.textContent = 'Loading badges...';
      } else {
        const tripsCount = activeTrips.length;
        const totalXp = isEmptySimulated ? 0 : achStats.totalXp;
        const totalBadges = achStats.totalBadges || 6;

        if (statTripsEl) statTripsEl.textContent = tripsCount;
        if (statTripsCapEl) statTripsCapEl.textContent = tripsCount > 0 ? 'Active blueprints' : 'Create your first trip';
        if (statXpEl) statXpEl.textContent = `${totalXp} XP`;
        if (statXpCapEl) statXpCapEl.textContent = totalXp > 0 ? 'From real actions' : 'Complete trip actions';
        if (statBadgesEl) statBadgesEl.textContent = unlockedBadges;
        if (statBadgesCapEl) statBadgesCapEl.textContent = `Of ${totalBadges} unlocked`;
      }

      // 1. Continue Planning Card
      const currentTrip = activeTrips.find(t => t.id === state.activeTripId) || activeTrips[0];
      if (!currentTrip) {
        continueCardEl.innerHTML = `
          <div>
            <span class="section-label" style="margin-bottom: 6px;">Continue Planning</span>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 6px;">No active trip yet</h3>
            <p style="font-size: 0.875rem; color: var(--color-text-secondary);">Start a private India trip blueprint with just a name and destination.</p>
          </div>
          <button class="btn btn-primary" id="btn-dash-empty-create" type="button" style="width: 100%;">+ Create Your First Trip</button>
        `;
        const emptyBtn = document.getElementById('btn-dash-empty-create');
        if (emptyBtn) {
          emptyBtn.addEventListener('click', () => openModal(document.getElementById('modal-create-trip')));
        }
      } else {
        const pct = computeTripProgress(currentTrip);
        continueCardEl.innerHTML = `
          <div>
            <div class="dash-card-header" style="margin-bottom: 8px;">
              <span class="section-label" style="margin-bottom: 0;">Continue Planning</span>
              <span style="font-size: 0.75rem; font-weight: 800; color: var(--color-brand-teal);">${pct}% Ready</span>
            </div>
            <h3 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 4px;">${currentTrip.name}</h3>
            <div style="font-size: 0.8125rem; color: var(--color-text-secondary); margin-bottom: 10px;">
              ${currentTrip.destination} • ${currentTrip.startDate || 'Dates TBD'} – ${currentTrip.endDate || 'TBD'}
            </div>
            <div class="dash-progress-track" aria-label="Trip planning progress ${pct}%">
              <div class="dash-progress-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
          <button class="btn btn-primary" id="btn-dash-continue-trip" type="button" style="width: 100%; margin-top: 8px;">
            Continue Planning →
          </button>
        `;
        const contBtn = document.getElementById('btn-dash-continue-trip');
        if (contBtn) {
          contBtn.addEventListener('click', function () {
            syncActiveTripUI(currentTrip.id);
            switchSection('itinerary-builder');
          });
        }
      }

      // 2. Upcoming Trips List
      if (upcomingListEl) {
        if (!activeTrips.length) {
          upcomingListEl.innerHTML = `
            <div class="empty-state-card" style="padding: var(--space-lg); margin: 0;">
              <h3 class="empty-state-title" style="font-size: 1.05rem;">No upcoming trips yet</h3>
              <p class="empty-state-desc" style="margin-bottom: var(--space-sm); font-size: 0.875rem;">
                Create a trip or pick a curated destination to start your itinerary.
              </p>
              <button class="btn btn-secondary" id="btn-dash-explore-empty" type="button">Explore India</button>
            </div>
          `;
          const expBtn = document.getElementById('btn-dash-explore-empty');
          if (expBtn) expBtn.addEventListener('click', () => switchSection('explore-india'));
        } else {
          upcomingListEl.innerHTML = '';
          activeTrips.slice(0, 3).forEach(trip => {
            const pct = computeTripProgress(trip);
            const item = document.createElement('div');
            item.className = 'dash-upcoming-item';
            item.innerHTML = `
              <div style="flex: 1; min-width: 180px;">
                <div style="font-weight: 800; font-size: 1rem;">${trip.name}</div>
                <div style="font-size: 0.8125rem; color: var(--color-text-secondary); margin-bottom: 6px;">
                  ${trip.destination} • ${trip.startDate || 'Flexible'} • Budget ₹${(trip.budget || 0).toLocaleString('en-IN')}
                </div>
                <div class="dash-progress-track" style="max-width: 240px;">
                  <div class="dash-progress-fill" style="width: ${pct}%;"></div>
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-dash-open-trip" style="min-height: 40px; padding: 6px 14px; font-size: 0.8125rem;">
                Open Trip →
              </button>
            `;
            item.querySelector('.btn-dash-open-trip').addEventListener('click', function () {
              syncActiveTripUI(trip.id);
              switchSection('itinerary-builder');
            });
            upcomingListEl.appendChild(item);
          });
        }
      }

      // 3. Planning Progress Summary
      if (progressBodyEl) {
        if (!currentTrip) {
          progressBodyEl.innerHTML = `
            <p style="font-size: 0.875rem; color: var(--color-text-secondary); line-height: 1.5;">
              Your planning milestones will appear here once you start your first trip. No penalties for changing plans.
            </p>
          `;
        } else {
          const pct = computeTripProgress(currentTrip);
          progressBodyEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-weight: 800; margin-bottom: 6px;">
              <span>${currentTrip.name}</span>
              <span style="color: var(--color-brand-teal);">${pct}%</span>
            </div>
            <div class="dash-progress-track" style="margin-bottom: 12px;">
              <div class="dash-progress-fill" style="width: ${pct}%;"></div>
            </div>
            <p style="font-size: 0.8125rem; color: var(--color-text-secondary); margin-bottom: 12px;">
              ${unlockedBadges} milestone badge${unlockedBadges === 1 ? '' : 's'} unlocked • ${activityCount} activities plotted for Day 1.
            </p>
            <button type="button" class="btn btn-secondary" id="btn-dash-goto-expenses" style="width: 100%; min-height: 40px; font-size: 0.8125rem;">
              Review ₹${(currentTrip.spent || 0).toLocaleString('en-IN')} Spent vs ₹${(currentTrip.budget || 0).toLocaleString('en-IN')} Budget
            </button>
          `;
          const expLink = document.getElementById('btn-dash-goto-expenses');
          if (expLink) {
            expLink.addEventListener('click', function () {
              syncActiveTripUI(currentTrip.id);
              switchSection('expenses');
            });
          }
        }
      }

      // 4. Recommended Destinations (from curated DOM cards)
      if (recommendedGridEl) {
        recommendedGridEl.innerHTML = '';
        const cards = Array.from(document.querySelectorAll('#discover-cards-grid .destination-card')).slice(0, 4);
        if (!cards.length) {
          recommendedGridEl.innerHTML = `
            <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin: 0;">
              No destinations available right now. <button type="button" class="dash-link-btn" data-jump-section="explore-india">Open Explore India →</button>
            </p>
          `;
        }
        cards.forEach(card => {
          const name = card.querySelector('.dest-name')?.textContent || 'India Destination';
          const stateText = card.querySelector('.dest-state')?.textContent || '';
          const rec = document.createElement('div');
          rec.className = 'dash-rec-card';
          rec.innerHTML = `
            <div style="font-weight: 800; font-size: 0.9375rem;">${name}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-secondary); margin-bottom: auto;">${stateText}</div>
            <button type="button" class="btn btn-secondary btn-dash-plan-dest" style="min-height: 38px; padding: 6px 10px; font-size: 0.75rem; margin-top: 6px;">
              Plan Here →
            </button>
          `;
          rec.querySelector('.btn-dash-plan-dest').addEventListener('click', function () {
            openModal(document.getElementById('modal-create-trip'));
            const destInput = document.getElementById('new-trip-destination');
            const nameInput = document.getElementById('new-trip-name');
            if (destInput) destInput.value = name;
            if (nameInput) nameInput.value = `${name.split(' ')[0]} Exploration`;
          });
          recommendedGridEl.appendChild(rec);
        });
      }

      // 5. Recent Trip Activity & Notifications
      const notifCountEl = document.getElementById('dash-notif-count');
      const notifListEl = document.getElementById('dash-notif-list');
      const userAvatarEl = document.getElementById('dash-user-avatar');
      const tipTextEl = document.getElementById('dash-travel-tip-text');

      if (userAvatarEl) {
        const parts = (state.userDisplayName || 'YS').trim().split(/\s+/);
        userAvatarEl.textContent = ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase() || 'YS';
      }

      if (tipTextEl) {
        tipTextEl.textContent = currentTrip
          ? `Planning ${currentTrip.destination}: keep estimated route costs separate from actual INR expenses as you finalize stops.`
          : 'Start with just a trip name and destination—you can add dates, INR budget, and stops anytime.';
      }

      const notifItems = isEmptySimulated ? [] : state.recentActivity.slice(0, 4);
      if (notifCountEl) notifCountEl.textContent = notifItems.length;
      if (notifListEl) {
        notifListEl.innerHTML = '';
        if (!notifItems.length) {
          notifListEl.innerHTML = '<li>No new workspace notifications.</li>';
        } else {
          notifItems.forEach(entry => {
            const li = document.createElement('li');
            li.textContent = `${entry.text} (${entry.time})`;
            notifListEl.appendChild(li);
          });
        }
      }

      if (activityListEl) {
        activityListEl.innerHTML = '';
        if (isEmptySimulated || !state.recentActivity.length) {
          activityListEl.innerHTML = `
            <li class="dash-activity-item">
              <span>No recent trip activity yet. Create a trip or log an item to see updates.</span>
            </li>
          `;
        } else {
          state.recentActivity.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'dash-activity-item';
            li.innerHTML = `
              <span>${entry.text}</span>
              <span class="dash-activity-time">${entry.time}</span>
            `;
            activityListEl.appendChild(li);
          });
        }
      }
    }

    // Dashboard header search, notifications, profile, tip & CTA controls
    const dashSearchForm = document.getElementById('dash-dest-search-form');
    const dashSearchInput = document.getElementById('dash-dest-search-input');
    if (dashSearchForm && dashSearchInput) {
      dashSearchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const q = dashSearchInput.value.trim();
        switchSection('explore-india');
        const exploreInput = document.getElementById('discover-search-input');
        if (exploreInput) {
          exploreInput.value = q;
          exploreInput.dispatchEvent(new Event('input', { bubbles: true }));
          exploreInput.focus();
        }
      });
    }

    const btnNotif = document.getElementById('btn-dash-notifications');
    const notifPopover = document.getElementById('dash-notif-popover');
    if (btnNotif && notifPopover) {
      btnNotif.addEventListener('click', function (e) {
        e.stopPropagation();
        const willOpen = notifPopover.hasAttribute('hidden');
        if (willOpen) {
          notifPopover.removeAttribute('hidden');
          btnNotif.setAttribute('aria-expanded', 'true');
        } else {
          notifPopover.setAttribute('hidden', '');
          btnNotif.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !notifPopover.hasAttribute('hidden')) {
          notifPopover.setAttribute('hidden', '');
          btnNotif.setAttribute('aria-expanded', 'false');
          btnNotif.focus();
        }
      });
      document.addEventListener('click', function (e) {
        if (!notifPopover.hasAttribute('hidden') && !notifPopover.contains(e.target) && e.target !== btnNotif) {
          notifPopover.setAttribute('hidden', '');
          btnNotif.setAttribute('aria-expanded', 'false');
        }
      });
    }

    const btnDashProfile = document.getElementById('btn-dash-profile');
    if (btnDashProfile) {
      btnDashProfile.addEventListener('click', () => switchSection('profile-settings'));
    }

    const btnDashTipExplore = document.getElementById('btn-dash-tip-explore');
    if (btnDashTipExplore) {
      btnDashTipExplore.addEventListener('click', () => switchSection('explore-india'));
    }

    const btnDashCtaStart = document.getElementById('btn-dash-cta-start');

    // Quick link & jump buttons
    document.querySelectorAll('[data-jump-section]').forEach(btn => {
      btn.addEventListener('click', function () {
        const target = btn.getAttribute('data-jump-section');
        if (target) switchSection(target);
      });
    });

    [btnDashNewTrip, btnDashQuickPlan, btnDashCtaStart].forEach(btn => {
      if (btn) btn.addEventListener('click', () => openModal(document.getElementById('modal-create-trip')));
    });

    window.__yatraRenderDashboard = renderDashboard;
    window.__yatraRecordActivity = recordActivity;
    renderDashboard();
  }

  // --- 11. Explore India: Search, Filter, Sort, Place Details & Trip Map Sync ---
  function initExploreIndiaExplorer() {
    const searchInput = document.getElementById('discover-search-input');
    const destCards = document.querySelectorAll('#discover-cards-grid .destination-card');
    const destEmptyEl = document.getElementById('explore-dest-empty');
    const vibeBtns = document.querySelectorAll('.explore-vibe-chip');
    const catSelect = document.getElementById('explore-filter-category');
    const distSelect = document.getElementById('explore-filter-distance');
    const sortSelect = document.getElementById('explore-sort-select');
    const targetTripSelect = document.getElementById('explore-target-trip');
    const placesListEl = document.getElementById('explore-places-list');
    const placesEmptyEl = document.getElementById('explore-places-empty');
    const placesCountPill = document.getElementById('explore-places-count-pill');
    const mapMarkersEl = document.getElementById('explore-map-markers');
    const routeLineEl = document.getElementById('explore-route-line');
    const selectedTitleEl = document.getElementById('explore-selected-title');
    const selectedOrderEl = document.getElementById('explore-selected-order');
    const selectedSummaryEl = document.getElementById('explore-selected-summary');
    const btnClearSelected = document.getElementById('btn-explore-clear-selected');
    const btnViewItinerary = document.getElementById('btn-explore-view-itinerary');
    const btnResetExplore = document.getElementById('btn-reset-explore-filters');
    const btnResetPlaces = document.getElementById('btn-reset-places-filters');
    const tabSaved = document.getElementById('tab-discover-saved');

    if (!placesListEl) return;

    const DEST_VIBES = {
      'dest-rajasthan': ['heritage'],
      'dest-kerala': ['nature', 'coastal'],
      'dest-ladakh': ['nature', 'spiritual'],
      'dest-varanasi': ['heritage', 'spiritual'],
      'dest-goa': ['coastal', 'heritage']
    };

    const PLACES_CATALOG = [
      { id: 'exp-1', destId: 'dest-rajasthan', name: 'City Palace & Jantar Mantar', location: 'Old City, Jaipur', vibe: 'heritage', category: 'fort-palace', distanceKm: 4, estMin: 15, rating: 4.7, ratingSource: 'Curated guide', estCost: 1200, desc: 'Royal courtyard complex and astronomical observatory.', x: 185, y: 120 },
      { id: 'exp-2', destId: 'dest-rajasthan', name: 'Hawa Mahal & Bapu Bazaar', location: 'Pink City, Jaipur', vibe: 'heritage', category: 'market-culture', distanceKm: 2, estMin: 8, rating: 4.6, ratingSource: 'Curated guide', estCost: 450, desc: 'Iconic sandstone facade and craft shopping lanes.', x: 310, y: 185 },
      { id: 'exp-3', destId: 'dest-rajasthan', name: 'Amer Fort & Stepwell', location: 'Amer, Jaipur', vibe: 'heritage', category: 'fort-palace', distanceKm: 11, estMin: 28, rating: 4.8, ratingSource: 'Curated guide', estCost: 800, desc: 'Hilltop palace overlooking Maota Lake.', x: 460, y: 95 },
      { id: 'exp-4', destId: 'dest-kerala', name: 'Mattupetty Dam & Echo Point', location: 'Munnar, Kerala', vibe: 'nature', category: 'nature', distanceKm: 13, estMin: 30, rating: 4.5, ratingSource: 'Curated guide', estCost: 200, desc: 'Misty lakeside hills and tea-estate views.', x: 140, y: 215 },
      { id: 'exp-5', destId: 'dest-kerala', name: 'Alleppey Backwater Cruise', location: 'Alleppey, Kerala', vibe: 'coastal', category: 'beach-water', distanceKm: 18, estMin: 40, rating: 4.7, ratingSource: 'Curated guide', estCost: 1500, desc: 'Tranquil palm-lined canals and village waterways.', x: 350, y: 245 },
      { id: 'exp-6', destId: 'dest-goa', name: 'Palolem & Agonda Coast', location: 'South Goa', vibe: 'coastal', category: 'beach-water', distanceKm: 5, estMin: 14, rating: 4.8, ratingSource: 'Curated guide', estCost: 300, desc: 'Calm crescent beaches framed by coconut palms.', x: 120, y: 110 },
      { id: 'exp-7', destId: 'dest-goa', name: 'Fontainhas Latin Quarter', location: 'Panaji, Goa', vibe: 'heritage', category: 'market-culture', distanceKm: 3, estMin: 10, rating: 4.6, ratingSource: 'Curated guide', estCost: 250, desc: 'Colorful heritage lanes, bakeries, and galleries.', x: 270, y: 135 },
      { id: 'exp-8', destId: 'dest-varanasi', name: 'Dashashwamedh Ghat Aarti', location: 'Varanasi, UP', vibe: 'spiritual', category: 'market-culture', distanceKm: 2, estMin: 10, rating: 4.9, ratingSource: 'Curated guide', estCost: 0, desc: 'Evening Ganga Aarti ceremony along historic steps.', x: 430, y: 210 },
      { id: 'exp-9', destId: 'dest-ladakh', name: 'Pangong & Nubra Pass', location: 'Leh, Ladakh', vibe: 'nature', category: 'nature', distanceKm: 24, estMin: 55, rating: null, ratingSource: null, estCost: 600, desc: 'High-altitude mountain lakes and desert dunes.', x: 500, y: 155 }
    ];

    const exploreState = {
      vibe: 'all',
      category: 'all',
      distance: 'all',
      sort: 'recommended',
      highlightedPlaceId: null,
      selectedPlaceIdsByTrip: {
        'trip-1': ['exp-1', 'exp-2'],
        'trip-2': ['exp-4', 'exp-5']
      }
    };

    function populateTargetTrips() {
      if (!targetTripSelect) return;
      const currentVal = targetTripSelect.value || state.activeTripId;
      targetTripSelect.innerHTML = state.trips.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      if (state.trips.some(t => t.id === currentVal)) {
        targetTripSelect.value = currentVal;
      }
    }

    function getSelectedTripId() {
      return (targetTripSelect && targetTripSelect.value) || state.activeTripId || (state.trips[0] && state.trips[0].id) || 'trip-1';
    }

    function getSelectedPlaceIds() {
      const tid = getSelectedTripId();
      if (!exploreState.selectedPlaceIdsByTrip[tid]) {
        exploreState.selectedPlaceIdsByTrip[tid] = [];
      }
      return exploreState.selectedPlaceIdsByTrip[tid];
    }

    function getFilteredPlaces() {
      const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
      let list = PLACES_CATALOG.filter(p => {
        const matchesQuery = !query || `${p.name} ${p.location} ${p.desc}`.toLowerCase().includes(query);
        const matchesVibe = exploreState.vibe === 'all' || p.vibe === exploreState.vibe;
        const matchesCat = exploreState.category === 'all' || p.category === exploreState.category;
        let matchesDist = true;
        if (exploreState.distance === '5') matchesDist = p.distanceKm <= 5;
        else if (exploreState.distance === '15') matchesDist = p.distanceKm <= 15;
        else if (exploreState.distance === '16') matchesDist = p.distanceKm > 15;
        return matchesQuery && matchesVibe && matchesCat && matchesDist;
      });

      if (exploreState.sort === 'distance-asc') {
        list.sort((a, b) => a.distanceKm - b.distanceKm);
      } else if (exploreState.sort === 'rating-desc') {
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      }
      return list;
    }

    function filterDestinationCards() {
      const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
      const isSavedTab = tabSaved && tabSaved.classList.contains('active');
      let visibleCount = 0;

      destCards.forEach(card => {
        const destId = card.getAttribute('data-dest-id');
        const vibes = DEST_VIBES[destId] || [];
        const matchesQuery = !query || card.textContent.toLowerCase().includes(query) ||
          PLACES_CATALOG.some(p => p.destId === destId && p.name.toLowerCase().includes(query));
        const matchesVibe = exploreState.vibe === 'all' || vibes.includes(exploreState.vibe);
        const matchesSaved = !isSavedTab || state.savedDestinations.has(destId);
        const show = matchesQuery && matchesVibe && matchesSaved;
        card.style.display = show ? 'flex' : 'none';
        if (show) visibleCount++;
      });

      if (destEmptyEl) {
        const showEmpty = !isSavedTab && visibleCount === 0;
        destEmptyEl.style.display = showEmpty ? 'block' : 'none';
      }
    }

    function renderSelectedSummary() {
      const selectedIds = getSelectedPlaceIds();
      const selectedPlaces = selectedIds.map(id => PLACES_CATALOG.find(p => p.id === id)).filter(Boolean);

      if (selectedTitleEl) selectedTitleEl.textContent = `Selected Places (${selectedPlaces.length})`;

      if (!selectedPlaces.length) {
        if (selectedOrderEl) selectedOrderEl.textContent = 'Add places from the list to build your ordered stops.';
        if (selectedSummaryEl) selectedSummaryEl.textContent = 'Total Est. 0 km • ~0 min transit';
      } else {
        const orderedNames = selectedPlaces.map((p, idx) => `${idx + 1}. ${p.name}`).join(' → ');
        const totalKm = selectedPlaces.reduce((sum, p) => sum + p.distanceKm, 0);
        const totalMin = selectedPlaces.reduce((sum, p) => sum + p.estMin, 0);
        if (selectedOrderEl) selectedOrderEl.textContent = orderedNames;
        if (selectedSummaryEl) selectedSummaryEl.textContent = `Total Est. ${totalKm} km • ~${totalMin} min transit`;
      }
    }

    function renderExploreMap(filteredPlaces) {
      if (!mapMarkersEl) return;
      const selectedIds = getSelectedPlaceIds();
      const selectedPlaces = selectedIds.map(id => PLACES_CATALOG.find(p => p.id === id)).filter(Boolean);
      const mapPlaces = selectedPlaces.length ? selectedPlaces : filteredPlaces;

      mapMarkersEl.innerHTML = '';
      if (routeLineEl) {
        if (selectedPlaces.length >= 2) {
          routeLineEl.setAttribute('d', selectedPlaces.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' '));
        } else {
          routeLineEl.setAttribute('d', '');
        }
      }

      mapPlaces.forEach((place, idx) => {
        const isSelected = selectedIds.includes(place.id);
        const isHighlighted = exploreState.highlightedPlaceId === place.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `map-marker-btn${isSelected || isHighlighted ? ' active' : ''}`;
        btn.style.left = `${(place.x / 600) * 100}%`;
        btn.style.top = `${(place.y / 320) * 100}%`;
        btn.setAttribute('aria-label', `${isSelected ? `Selected stop ${idx + 1}: ` : ''}${place.name}`);
        btn.innerHTML = `<span>${idx + 1}</span><span>${place.name.split(' ')[0]}</span>`;
        btn.addEventListener('click', function () {
          exploreState.highlightedPlaceId = place.id;
          renderExplorePlaces();
          showToast(`${place.name} (${place.location}) — ${place.distanceKm} km, Est. ~${place.estMin} min`);
        });
        mapMarkersEl.appendChild(btn);
      });
    }

    function renderExplorePlaces() {
      const filtered = getFilteredPlaces();
      const selectedIds = getSelectedPlaceIds();

      if (placesCountPill) placesCountPill.textContent = `${filtered.length} Place${filtered.length === 1 ? '' : 's'}`;
      placesListEl.innerHTML = '';

      if (!filtered.length) {
        if (placesEmptyEl) placesEmptyEl.style.display = 'block';
      } else {
        if (placesEmptyEl) placesEmptyEl.style.display = 'none';
        filtered.forEach(place => {
          const isAdded = selectedIds.includes(place.id);
          const isHighlighted = exploreState.highlightedPlaceId === place.id;
          const card = document.createElement('article');
          card.className = `explore-place-card${isHighlighted ? ' highlighted' : ''}`;
          const ratingBadge = place.rating
            ? `<span class="explore-place-rating">★ ${place.rating.toFixed(1)} (${place.ratingSource})</span>`
            : `<span style="color: var(--color-text-muted);">Rating unavailable</span>`;

          card.innerHTML = `
            <div style="flex: 1; min-width: 0;">
              <div class="explore-place-meta">
                <span class="explore-place-cat">${place.category.replace('-', ' & ')}</span>
                <span>${place.distanceKm} km • ~${place.estMin} min (est.)</span>
                ${ratingBadge}
              </div>
              <h3 style="font-size: 1rem; font-weight: 800; margin-bottom: 2px;">${place.name}</h3>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary); margin-bottom: 4px;">${place.location} • Est. ₹${place.estCost.toLocaleString('en-IN')}</div>
              <p style="font-size: 0.8125rem; color: var(--color-text-secondary); line-height: 1.4;">${place.desc}</p>
            </div>
            <button type="button" class="btn ${isAdded ? 'btn-primary' : 'btn-secondary'} btn-toggle-place" style="min-height: 40px; padding: 6px 12px; font-size: 0.8125rem; flex-shrink: 0;">
              ${isAdded ? 'Remove ×' : 'Add to Trip +'}
            </button>
          `;

          card.querySelector('.btn-toggle-place').addEventListener('click', function () {
            if (state.isOffline) {
              showToast('Offline Mode: Modifying trip stops requires internet connectivity.');
              return;
            }
            const ids = getSelectedPlaceIds();
            const existingIdx = ids.indexOf(place.id);
            if (existingIdx >= 0) {
              ids.splice(existingIdx, 1);
              showToast(`Removed "${place.name}" from trip stops.`);
            } else {
              ids.push(place.id);
              showToast(`Added "${place.name}" to trip stops!`);
            }
            exploreState.highlightedPlaceId = place.id;
            renderExplorePlaces();
          });

          placesListEl.appendChild(card);
        });
      }

      renderSelectedSummary();
      renderExploreMap(filtered);
    }

    function resetAllExploreFilters() {
      exploreState.vibe = 'all';
      exploreState.category = 'all';
      exploreState.distance = 'all';
      exploreState.sort = 'recommended';
      if (searchInput) searchInput.value = '';
      if (catSelect) catSelect.value = 'all';
      if (distSelect) distSelect.value = 'all';
      if (sortSelect) sortSelect.value = 'recommended';
      vibeBtns.forEach(b => {
        const isAll = b.getAttribute('data-vibe') === 'all';
        b.classList.toggle('active', isAll);
        b.setAttribute('aria-pressed', isAll ? 'true' : 'false');
      });
      filterDestinationCards();
      renderExplorePlaces();
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        filterDestinationCards();
        renderExplorePlaces();
      });
    }

    vibeBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        exploreState.vibe = btn.getAttribute('data-vibe') || 'all';
        vibeBtns.forEach(b => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        filterDestinationCards();
        renderExplorePlaces();
      });
    });

    if (catSelect) catSelect.addEventListener('change', () => { exploreState.category = catSelect.value; renderExplorePlaces(); });
    if (distSelect) distSelect.addEventListener('change', () => { exploreState.distance = distSelect.value; renderExplorePlaces(); });
    if (sortSelect) sortSelect.addEventListener('change', () => { exploreState.sort = sortSelect.value; renderExplorePlaces(); });
    if (targetTripSelect) targetTripSelect.addEventListener('change', () => renderExplorePlaces());

    if (btnClearSelected) {
      btnClearSelected.addEventListener('click', function () {
        exploreState.selectedPlaceIdsByTrip[getSelectedTripId()] = [];
        renderExplorePlaces();
        showToast('Cleared selected places.');
      });
    }

    if (btnViewItinerary) {
      btnViewItinerary.addEventListener('click', function () {
        const tripId = getSelectedTripId();
        const selectedPlaces = getSelectedPlaceIds().map(id => PLACES_CATALOG.find(p => p.id === id)).filter(Boolean);
        syncActiveTripUI(tripId);
        if (selectedPlaces.length && !state.isOffline) {
          const container = document.getElementById('activities-container');
          if (container) {
            container.innerHTML = '';
            let totalEst = 0;
            selectedPlaces.forEach((p, idx) => {
              totalEst += p.estCost || 0;
              const card = document.createElement('article');
              card.className = 'activity-card';
              card.innerHTML = `
                <div class="activity-time-col">
                  <span class="activity-time">Stop ${idx + 1}</span>
                  <span class="activity-duration">~${p.estMin} min transit</span>
                </div>
                <div class="activity-body">
                  <h4 class="activity-title">${p.name}</h4>
                  <div class="activity-location">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    <span>${p.location}</span>
                  </div>
                  <p class="activity-notes">${p.desc}</p>
                </div>
                <div class="activity-cost-col">
                  <span class="cost-estimate-label">Estimated Cost</span>
                  <span class="cost-estimate-val">₹${(p.estCost || 0).toLocaleString('en-IN')}</span>
                  <button class="btn-delete-item" type="button" title="Delete activity" aria-label="Delete activity">×</button>
                </div>
              `;
              container.appendChild(card);
            });
            const dayTotalBadge = document.querySelector('#section-itinerary-builder .sticker');
            if (dayTotalBadge) dayTotalBadge.textContent = `Day Est. Total: ₹${totalEst.toLocaleString('en-IN')}`;
          }
          if (typeof window.__yatraRecordActivity === 'function') {
            window.__yatraRecordActivity(`Added ${selectedPlaces.length} place(s) from Explore India`);
          }
        }
        switchSection('itinerary-builder');
      });
    }

    if (btnResetExplore) btnResetExplore.addEventListener('click', resetAllExploreFilters);
    if (btnResetPlaces) btnResetPlaces.addEventListener('click', resetAllExploreFilters);

    const modalDestDetail = document.getElementById('modal-destination-detail');
    const detailBtns = document.querySelectorAll('.btn-dest-details');
    let activeDetailDestId = null;

    function openDestinationDetail(destId) {
      const card = document.querySelector(`.destination-card[data-dest-id="${destId}"]`);
      if (!card || !modalDestDetail) return;
      activeDetailDestId = destId;
      const title = card.querySelector('.dest-name')?.textContent || 'Destination';
      const stateText = card.querySelector('.dest-state')?.textContent || '';
      const region = card.querySelector('.dest-badge-region')?.textContent || '';
      const duration = card.querySelector('.dest-duration-pill')?.textContent || '';
      const desc = card.querySelector('.dest-description')?.textContent?.trim() || '';
      const planBtn = card.querySelector('.btn-plan-from-dest');

      document.getElementById('modal-dest-title').textContent = title;
      document.getElementById('modal-dest-state').textContent = stateText;
      document.getElementById('modal-dest-region').textContent = region;
      document.getElementById('modal-dest-duration').textContent = duration;
      document.getElementById('modal-dest-desc').textContent = desc;

      const highlightsEl = document.getElementById('modal-dest-highlights');
      if (highlightsEl) {
        const places = PLACES_CATALOG.filter(p => p.destId === destId);
        highlightsEl.innerHTML = places.length
          ? places.map(p => `
            <div style="padding: 10px 12px; background: var(--color-surface-muted); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
              <div>
                <div style="font-weight: 700; font-size: 0.9rem;">${p.name}</div>
                <div style="font-size: 0.78rem; color: var(--color-text-secondary);">${p.location} • ${p.distanceKm} km (~${p.estMin} min est.)${p.rating ? ` • ★ ${p.rating.toFixed(1)} (${p.ratingSource})` : ''}</div>
              </div>
              <span style="font-weight: 800; font-size: 0.85rem; color: var(--color-brand-teal); white-space: nowrap;">Est. ₹${(p.estCost || 0).toLocaleString('en-IN')}</span>
            </div>
          `).join('')
          : '<p style="font-size: 0.85rem; color: var(--color-text-secondary);">No curated highlights listed yet.</p>';
      }

      const modalSaveBtn = document.getElementById('btn-modal-dest-save');
      if (modalSaveBtn) {
        const isSaved = state.savedDestinations.has(destId);
        modalSaveBtn.textContent = isSaved ? 'Saved ✓' : 'Save Destination';
      }

      const modalPlanBtn = document.getElementById('btn-modal-dest-plan');
      if (modalPlanBtn && planBtn) {
        modalPlanBtn.setAttribute('data-dest', planBtn.getAttribute('data-dest') || title);
      }

      openModal(modalDestDetail);
    }

    detailBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDestinationDetail(btn.getAttribute('data-dest-id'));
      });
    });

    const modalSaveBtn = document.getElementById('btn-modal-dest-save');
    if (modalSaveBtn) {
      modalSaveBtn.addEventListener('click', () => {
        if (!activeDetailDestId) return;
        const cardBtn = document.querySelector(`.btn-save-dest[data-dest-id="${activeDetailDestId}"]`);
        if (cardBtn) cardBtn.click();
        modalSaveBtn.textContent = state.savedDestinations.has(activeDetailDestId) ? 'Saved ✓' : 'Save Destination';
      });
    }

    const modalPlanBtn = document.getElementById('btn-modal-dest-plan');
    if (modalPlanBtn) {
      modalPlanBtn.addEventListener('click', () => {
        const destName = modalPlanBtn.getAttribute('data-dest') || '';
        closeAllModals();
        const modalCreateTrip = document.getElementById('modal-create-trip');
        const editIdEl = document.getElementById('trip-edit-id');
        const titleEl = document.getElementById('modal-trip-title');
        const submitEl = document.getElementById('btn-submit-trip-form');
        const destInput = document.getElementById('new-trip-destination');
        if (editIdEl) editIdEl.value = '';
        if (titleEl) titleEl.textContent = 'Create a New Trip';
        if (submitEl) submitEl.textContent = 'Create Trip Workspace';
        if (destInput) destInput.value = destName;
        openModal(modalCreateTrip);
      });
    }

    populateTargetTrips();
    filterDestinationCards();
    renderExplorePlaces();
  }

  // --- 12. My Trips: Search, Status Filters, Dynamic Cards, Details Panel & Archive ---
  function initMyTripsManager() {
    const tripsContainer = document.getElementById('trips-container');
    const searchInput = document.getElementById('trips-search-input');
    const filterTabs = document.querySelectorAll('[data-trip-filter]');
    const emptyStateEl = document.getElementById('dashboard-empty-state');
    const detailPanelEl = document.getElementById('my-trip-detail-panel');
    const detailContentEl = document.getElementById('trip-detail-content');
    const detailTabs = document.querySelectorAll('[data-detail-tab]');
    const btnDetailContinue = document.getElementById('btn-detail-continue');
    const btnDetailEdit = document.getElementById('btn-detail-edit');
    const btnDetailMap = document.getElementById('btn-detail-map');
    const btnDetailArchive = document.getElementById('btn-detail-archive');

    if (!tripsContainer || !detailPanelEl) return;

    const myTripsState = {
      filter: 'all',
      detailTab: 'itinerary'
    };

    function getTripStatus(trip) {
      if (trip.status === 'archived') return 'archived';
      if (trip.status === 'completed' || trip.status === 'past') return 'past';
      if (trip.endDate && new Date(trip.endDate) < new Date('2026-11-25')) return 'past';
      return 'upcoming';
    }

    function computeProgress(trip) {
      let score = 25;
      if (trip.startDate && trip.endDate) score += 25;
      if (trip.budget && trip.budget > 0) score += 25;
      if (localStorage.getItem(scopedStorageKey(`route_${trip.id}`)) || (!state.isAuthenticated && trip.id === 'trip-1')) score += 15;
      if (localStorage.getItem(scopedStorageKey(`offline_${trip.id}`))) score += 10;
      return Math.min(100, score);
    }

    function updateFilterCounts(activeTrips) {
      const counts = { all: activeTrips.length, upcoming: 0, past: 0, archived: 0 };
      activeTrips.forEach(t => {
        counts[getTripStatus(t)]++;
      });
      const elAll = document.getElementById('trips-count-all');
      const elUp = document.getElementById('trips-count-upcoming');
      const elPast = document.getElementById('trips-count-past');
      const elArch = document.getElementById('trips-count-archived');
      if (elAll) elAll.textContent = counts.all;
      if (elUp) elUp.textContent = counts.upcoming;
      if (elPast) elPast.textContent = counts.past;
      if (elArch) elArch.textContent = counts.archived;

      const sidebarTripsCount = document.getElementById('sidebar-trips-count');
      if (sidebarTripsCount) sidebarTripsCount.textContent = counts.all;
    }

    function renderTripDetailPanel() {
      const isEmptySim = state.uiMode === 'empty';
      const trip = isEmptySim ? null : (state.trips.find(t => t.id === state.activeTripId) || state.trips[0]);
      if (!trip) {
        detailPanelEl.style.display = 'none';
        return;
      }

      detailPanelEl.style.display = 'block';
      const status = getTripStatus(trip);
      const progress = computeProgress(trip);
      const hasRecords = (trip.spent && trip.spent > 0) || (trip.bookingsCount && trip.bookingsCount > 0);

      document.getElementById('trip-detail-status').textContent = status === 'archived' ? 'Archived' : (status === 'past' ? 'Completed' : 'Upcoming');
      document.getElementById('trip-detail-name').textContent = trip.name;
      document.getElementById('trip-detail-meta').textContent = `${trip.destination} • ${trip.startDate || 'Dates TBD'} – ${trip.endDate || 'TBD'} • ${trip.travelers || 1} Travelers`;
      document.getElementById('trip-detail-budget').textContent = `₹${(trip.budget || 0).toLocaleString('en-IN')}`;
      document.getElementById('trip-detail-spent').textContent = `₹${(trip.spent || 0).toLocaleString('en-IN')}`;
      document.getElementById('trip-detail-progress').textContent = `${progress}%`;
      document.getElementById('trip-detail-history-note').textContent = hasRecords
        ? 'Has booking/expense records • Archive preserves history'
        : 'Can be archived anytime';

      if (btnDetailArchive) {
        btnDetailArchive.textContent = status === 'archived' ? 'Restore Trip' : 'Archive Trip';
      }

      if (!detailContentEl) return;
      if (myTripsState.detailTab === 'itinerary') {
        const items = Array.from(document.querySelectorAll('#activities-container .activity-card'));
        const previewHtml = items.slice(0, 3).map((el, i) => `
          <div style="padding: 8px 12px; background: var(--color-surface-muted); border-radius: var(--radius-sm); display: flex; justify-content: space-between; gap: 8px;">
            <span><strong>${i + 1}. ${el.querySelector('.activity-title')?.textContent || 'Activity'}</strong></span>
            <span style="font-size: 0.8125rem; color: var(--color-brand-teal); font-weight: 700;">${el.querySelector('.cost-estimate-val')?.textContent || 'Est. ₹0'}</span>
          </div>
        `).join('');
        detailContentEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
            ${previewHtml || '<p style="font-size: 0.875rem; color: var(--color-text-secondary);">No itinerary activities plotted yet.</p>'}
          </div>
          <button type="button" class="btn btn-secondary btn-jump-itinerary" style="min-height: 40px; font-size: 0.8125rem;">Open Full Itinerary Builder →</button>
        `;
        detailContentEl.querySelector('.btn-jump-itinerary').addEventListener('click', () => switchSection('itinerary-builder'));
      } else if (myTripsState.detailTab === 'bookings') {
        const bookingCards = Array.from(document.querySelectorAll('#bookings-container .booking-card'));
        const listHtml = bookingCards.slice(0, 3).map(el => `
          <div style="padding: 8px 12px; background: var(--color-surface-muted); border-radius: var(--radius-sm); display: flex; justify-content: space-between; gap: 8px;">
            <span><strong>${el.querySelector('.booking-provider')?.textContent || 'Booking Note'}</strong></span>
            <span style="font-size: 0.8125rem; font-weight: 700;">${el.querySelector('.booking-amount')?.textContent || ''}</span>
          </div>
        `).join('');
        detailContentEl.innerHTML = `
          <p style="font-size: 0.75rem; color: var(--color-text-secondary); margin-bottom: 8px;">Personal reference notes only — YatraSathi does not make or confirm external bookings.</p>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
            ${listHtml || '<p style="font-size: 0.875rem; color: var(--color-text-secondary);">No booking notes recorded yet.</p>'}
          </div>
          <button type="button" class="btn btn-secondary btn-jump-bookings" style="min-height: 40px; font-size: 0.8125rem;">Manage Booking Notes →</button>
        `;
        detailContentEl.querySelector('.btn-jump-bookings').addEventListener('click', () => switchSection('bookings'));
      } else {
        const rem = Math.max(0, (trip.budget || 0) - (trip.spent || 0));
        detailContentEl.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px;">
            <div style="padding: 10px; background: var(--color-surface-muted); border-radius: var(--radius-sm);">
              <div class="stat-item-label">Budget</div>
              <strong>₹${(trip.budget || 0).toLocaleString('en-IN')}</strong>
            </div>
            <div style="padding: 10px; background: var(--color-surface-muted); border-radius: var(--radius-sm);">
              <div class="stat-item-label">Actual Spent</div>
              <strong style="color: var(--color-brand-teal);">₹${(trip.spent || 0).toLocaleString('en-IN')}</strong>
            </div>
            <div style="padding: 10px; background: var(--color-surface-muted); border-radius: var(--radius-sm);">
              <div class="stat-item-label">Remaining</div>
              <strong>₹${rem.toLocaleString('en-IN')}</strong>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-jump-expenses" style="min-height: 40px; font-size: 0.8125rem;">Open INR Expense Ledger →</button>
        `;
        detailContentEl.querySelector('.btn-jump-expenses').addEventListener('click', () => switchSection('expenses'));
      }
    }

    function renderMyTrips() {
      const isEmptySim = state.uiMode === 'empty';
      const activeTrips = isEmptySim ? [] : state.trips;
      updateFilterCounts(activeTrips);

      const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
      const filtered = activeTrips.filter(trip => {
        const status = getTripStatus(trip);
        const matchesFilter = myTripsState.filter === 'all' || status === myTripsState.filter;
        const matchesQuery = !query || `${trip.name} ${trip.destination}`.toLowerCase().includes(query);
        return matchesFilter && matchesQuery;
      });

      tripsContainer.innerHTML = '';
      if (!filtered.length) {
        tripsContainer.style.display = 'none';
        if (emptyStateEl) emptyStateEl.style.display = 'block';
        renderTripDetailPanel();
        return;
      }

      tripsContainer.style.display = 'grid';
      if (emptyStateEl) emptyStateEl.style.display = 'none';

      filtered.forEach(trip => {
        const status = getTripStatus(trip);
        const progress = computeProgress(trip);
        const isSelected = trip.id === state.activeTripId;
        const card = document.createElement('article');
        card.className = `trip-summary-card${isSelected ? ' selected-trip' : ''}`;
        card.setAttribute('data-trip-id', trip.id);
        card.setAttribute('data-theme', trip.theme || 'rajasthan');
        card.innerHTML = `
          <div class="trip-card-header">
            <div>
              <h3 class="trip-card-name">${trip.name}</h3>
              <div class="trip-card-dest">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <span>${trip.destination} • ${trip.startDate || 'TBD'} – ${trip.endDate || 'TBD'}</span>
              </div>
            </div>
            <span class="trip-status-chip">${status === 'archived' ? 'Archived' : (status === 'past' ? 'Completed' : 'Upcoming')}</span>
          </div>
          <div class="trip-stats-grid">
            <div>
              <div class="stat-item-label">Budget</div>
              <div class="stat-item-val">₹${(trip.budget || 0).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div class="stat-item-label">Actual Spent</div>
              <div class="stat-item-val" style="color: var(--color-brand-teal);">₹${(trip.spent || 0).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div class="stat-item-label">Travelers</div>
              <div class="stat-item-val">${trip.travelers || 1} People</div>
            </div>
            <div>
              <div class="stat-item-label">Progress</div>
              <div class="stat-item-val">${progress}%</div>
            </div>
          </div>
          <div class="dash-progress-track" style="margin-bottom: 12px;" aria-label="Progress ${progress}%">
            <div class="dash-progress-fill" style="width: ${progress}%;"></div>
          </div>
          <div class="trip-card-footer">
            <span style="font-size: 0.8125rem; color: var(--color-text-secondary); font-weight: 600;">Role: ${trip.role || 'Owner'}</span>
            <button type="button" class="btn btn-secondary btn-open-plan" style="padding: 6px 14px; min-height: 40px; font-size: 0.8125rem;">Select &amp; View →</button>
          </div>
        `;

        card.addEventListener('click', function () {
          syncActiveTripUI(trip.id);
          renderMyTrips();
        });
        tripsContainer.appendChild(card);
      });

      renderTripDetailPanel();
    }

    if (searchInput) searchInput.addEventListener('input', renderMyTrips);

    filterTabs.forEach(tab => {
      tab.addEventListener('click', function () {
        myTripsState.filter = tab.getAttribute('data-trip-filter') || 'all';
        filterTabs.forEach(t => {
          const active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        renderMyTrips();
      });
    });

    detailTabs.forEach(tab => {
      tab.addEventListener('click', function () {
        myTripsState.detailTab = tab.getAttribute('data-detail-tab') || 'itinerary';
        detailTabs.forEach(t => {
          const active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        renderTripDetailPanel();
      });
    });

    if (btnDetailContinue) {
      btnDetailContinue.addEventListener('click', () => switchSection('itinerary-builder'));
    }

    if (btnDetailEdit) {
      btnDetailEdit.addEventListener('click', function () {
        const trip = state.trips.find(t => t.id === state.activeTripId);
        if (!trip) return;
        const modalCreateTrip = document.getElementById('modal-create-trip');
        const editIdEl = document.getElementById('trip-edit-id');
        const titleEl = document.getElementById('modal-trip-title');
        const submitEl = document.getElementById('btn-submit-trip-form');
        if (editIdEl) editIdEl.value = trip.id;
        if (titleEl) titleEl.textContent = 'Edit Trip Details';
        if (submitEl) submitEl.textContent = 'Save Trip Changes';
        const nameEl = document.getElementById('new-trip-name');
        const destEl = document.getElementById('new-trip-destination');
        const startEl = document.getElementById('new-trip-start');
        const endEl = document.getElementById('new-trip-end');
        const travEl = document.getElementById('new-trip-travelers');
        const budgEl = document.getElementById('new-trip-budget');
        if (nameEl) nameEl.value = trip.name || '';
        if (destEl) destEl.value = trip.destination || '';
        if (startEl) startEl.value = trip.startDate || '';
        if (endEl) endEl.value = trip.endDate || '';
        if (travEl) travEl.value = trip.travelers || 1;
        if (budgEl) budgEl.value = trip.budget || 0;
        openModal(modalCreateTrip);
      });
    }

    if (btnDetailMap) {
      btnDetailMap.addEventListener('click', () => switchSection('maps-routes'));
    }

    if (btnDetailArchive) {
      btnDetailArchive.addEventListener('click', async function () {
        if (state.isOffline) {
          showToast('Offline Mode: Archiving or restoring trips requires internet connectivity.');
          return;
        }
        const trip = state.trips.find(t => t.id === state.activeTripId);
        if (!trip) return;
        const isArchived = getTripStatus(trip) === 'archived';
        const nextStatus = isArchived ? 'upcoming' : 'archived';
        if (state.isAuthenticated) {
          try {
            await apiFetch(`/api/workspace/trips/${encodeURIComponent(trip.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: nextStatus })
            });
          } catch (err) {
            showToast(err.message || 'Could not update trip status in D1.');
            return;
          }
        }
        trip.status = nextStatus;
        showToast(isArchived
          ? `Restored "${trip.name}" to Upcoming Trips.`
          : `Archived "${trip.name}". Booking and expense history is preserved.`);
        renderMyTrips();
        if (typeof window.__yatraRenderDashboard === 'function') window.__yatraRenderDashboard();
      });
    }

    window.__yatraRenderMyTrips = renderMyTrips;
    renderMyTrips();
  }

  // --- 13. App Bootstrapping ---
  // --- 13. Maps & Routes: Day/Full-Trip Views, Marker Sync & Route Selection ---
  function initMapsAndRoutesSection() {
    const scopeButtons = document.querySelectorAll('[data-maps-scope]');
    const daySelectorEl = document.getElementById('maps-day-selector');
    const dayButtons = document.querySelectorAll('[data-maps-day]');
    const mapEl = document.getElementById('maps-leaflet-map');
    const fallbackOverlayEl = document.getElementById('maps-fallback-overlay');
    const badgeEl = document.getElementById('maps-fallback-badge');
    const stopListEl = document.getElementById('maps-stop-list');
    const seqHeadingEl = document.getElementById('maps-sequence-heading');
    const seqTotalsEl = document.getElementById('maps-sequence-totals');
    const compareGridEl = document.getElementById('maps-route-compare-grid');
    const detailOrderEl = document.getElementById('maps-detail-order');
    const detailTimeEl = document.getElementById('maps-detail-time');
    const detailNameEl = document.getElementById('maps-detail-name');
    const detailDescEl = document.getElementById('maps-detail-desc');
    const tripNameEl = document.getElementById('maps-active-trip-name');

    if (!stopListEl || !compareGridEl) return;

    const DAY_ROUTES = {
      'day-1': {
        label: 'Day 1 Ordered Stops',
        options: [
          {
            id: 'd1-scenic',
            name: 'Route A — Scenic Heritage',
            recommended: true,
            totalKm: 18,
            totalMin: 55,
            note: 'Passes Old City bazaars & Aravalli ridge',
            stops: [
              { name: 'Heritage Haveli (Bani Park)', time: '09:30 AM', leg: 'Start point', notes: 'Check-in & morning logistics', lat: 26.9260, lng: 75.7920 },
              { name: 'City Palace & Jantar Mantar', time: '11:00 AM', leg: 'Estimated stop leg', notes: 'Composite heritage ticket', lat: 26.9258, lng: 75.8237 },
              { name: 'Nahargarh Fort Sunset Point', time: '05:00 PM', leg: 'Estimated stop leg', notes: 'Hill road approach for sunset', lat: 26.9373, lng: 75.8155 }
            ]
          },
          {
            id: 'd1-fast',
            name: 'Route B — Faster Direct',
            recommended: false,
            totalKm: 13,
            totalMin: 38,
            note: 'Direct arterial road, skips bazaar detour',
            stops: [
              { name: 'Heritage Haveli (Bani Park)', time: '09:30 AM', leg: 'Start point', notes: 'Check-in & morning logistics', lat: 26.9260, lng: 75.7920 },
              { name: 'Hawa Mahal Gate', time: '10:30 AM', leg: 'Estimated stop leg', notes: 'Quick photo stop', lat: 26.9239, lng: 75.8267 },
              { name: 'Nahargarh Fort Sunset Point', time: '04:30 PM', leg: 'Estimated stop leg', notes: 'Direct hill road ascent', lat: 26.9373, lng: 75.8155 }
            ]
          }
        ]
      },
      'day-2': {
        label: 'Day 2 Ordered Stops',
        options: [
          {
            id: 'd2-scenic',
            name: 'Route A — Amer & Jal Mahal',
            recommended: true,
            totalKm: 16,
            totalMin: 42,
            note: 'Lakeside road past Jal Mahal',
            stops: [
              { name: 'Amer Fort & Stepwell', time: '09:00 AM', leg: 'Start point', notes: 'Morning palace walk', lat: 26.9855, lng: 75.8513 },
              { name: 'Jal Mahal Promenade', time: '12:30 PM', leg: 'Estimated stop leg', notes: 'Man Sagar lake viewpoint', lat: 26.9535, lng: 75.8461 },
              { name: 'Johari Bazaar Craft Walk', time: '03:30 PM', leg: 'Estimated stop leg', notes: 'Local textiles & dinner', lat: 26.9196, lng: 75.8266 }
            ]
          },
          {
            id: 'd2-fast',
            name: 'Route B — Direct Amer Loop',
            recommended: false,
            totalKm: 12,
            totalMin: 32,
            note: 'Two-stop express morning',
            stops: [
              { name: 'Amer Fort & Stepwell', time: '09:00 AM', leg: 'Start point', notes: 'Morning palace walk', lat: 26.9855, lng: 75.8513 },
              { name: 'Johari Bazaar Craft Walk', time: '01:00 PM', leg: 'Estimated stop leg', notes: 'Direct return to Old City', lat: 26.9196, lng: 75.8266 }
            ]
          }
        ]
      },
      'day-3': {
        label: 'Day 3 Ordered Stops',
        options: [
          {
            id: 'd3-direct',
            name: 'Route A — Highway Transfer',
            recommended: true,
            totalKm: 335,
            totalMin: 320,
            note: 'NH62/NH25 intercity highway (est.)',
            stops: [
              { name: 'Jaipur Junction / Hotel', time: '08:00 AM', leg: 'Start point', notes: 'Morning departure', lat: 26.9196, lng: 75.7878 },
              { name: 'Ajmer Highway Stop', time: '10:30 AM', leg: 'Estimated stop leg', notes: 'Tea & refreshment break', lat: 26.4499, lng: 74.6399 },
              { name: 'Mehrangarh & Blue City', time: '02:30 PM', leg: 'Estimated stop leg', notes: 'Arrival in Jodhpur', lat: 26.2981, lng: 73.0186 }
            ]
          }
        ]
      }
    };

    const mapsState = {
      scope: 'day',
      day: 'day-1',
      selectedRouteId: 'd1-scenic',
      focusedStopIndex: 0
    };

    function getActiveData() {
      if (mapsState.scope === 'full') {
        const allStops = [];
        let totalKm = 0;
        let totalMin = 0;
        ['day-1', 'day-2', 'day-3'].forEach((dKey, dIdx) => {
          const opt = DAY_ROUTES[dKey].options[0];
          totalKm += opt.totalKm;
          totalMin += opt.totalMin;
          opt.stops.forEach((s, sIdx) => {
            allStops.push(Object.assign({}, s, {
              name: `D${dIdx + 1}: ${s.name}`,
              leg: sIdx === 0 && dIdx === 0 ? 'Trip Start' : s.leg
            }));
          });
        });
        return {
          heading: 'Full Trip Ordered Stops',
          options: [{ id: 'full-trip', name: 'Full Trip Route', recommended: true, totalKm: totalKm, totalMin: totalMin, note: 'Combined 3-day sequence (est.)', stops: allStops }],
          activeOption: { id: 'full-trip', name: 'Full Trip Route', totalKm: totalKm, totalMin: totalMin, stops: allStops },
          altOption: null
        };
      }

      const dayData = DAY_ROUTES[mapsState.day] || DAY_ROUTES['day-1'];
      const activeOption = dayData.options.find(o => o.id === mapsState.selectedRouteId) || dayData.options[0];
      const altOption = dayData.options.find(o => o.id !== activeOption.id) || null;
      return {
        heading: dayData.label,
        options: dayData.options,
        activeOption: activeOption,
        altOption: altOption
      };
    }

    function renderMapsSection() {
      const activeTrip = state.trips.find(t => t.id === state.activeTripId) || state.trips[0];
      if (tripNameEl && activeTrip) tripNameEl.textContent = activeTrip.name;

      const { heading, options, activeOption, altOption } = getActiveData();
      const stops = activeOption.stops;
      if (mapsState.focusedStopIndex >= stops.length) mapsState.focusedStopIndex = 0;

      if (seqHeadingEl) seqHeadingEl.textContent = heading;
      if (seqTotalsEl) seqTotalsEl.textContent = 'Awaiting Google Routes API estimate';

      renderLeafletMap({
        mapEl,
        fallbackEl: fallbackOverlayEl,
        badgeEl,
        stops,
        focusedIndex: mapsState.focusedStopIndex,
        totalsEl: seqTotalsEl,
        onMarkerSelect: (idx) => {
          mapsState.focusedStopIndex = idx;
          window.__yatraRenderMapsSection = renderMapsSection;
    renderMapsSection();
        }
      });

      // Detail Card
      const focusedStop = stops[mapsState.focusedStopIndex];
      if (focusedStop) {
        if (detailOrderEl) detailOrderEl.textContent = `Stop #${mapsState.focusedStopIndex + 1}`;
        if (detailTimeEl) detailTimeEl.textContent = focusedStop.time;
        if (detailNameEl) detailNameEl.textContent = focusedStop.name;
        if (detailDescEl) detailDescEl.textContent = `${focusedStop.leg} — ${focusedStop.notes}`;
      }

      // Stop List (clicking focuses map marker)
      stopListEl.innerHTML = '';
      stops.forEach((stop, idx) => {
        const hasCoords = Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `location-item-btn${idx === mapsState.focusedStopIndex ? ' active' : ''}`;
        btn.innerHTML = `
          <div class="location-number">${idx + 1}</div>
          <div>
            <strong style="display: block; font-size: 0.9375rem;">${stop.name}</strong>
            <div style="font-size: 0.75rem; color: var(--color-text-secondary);">${stop.time} • ${stop.leg}${hasCoords ? '' : ' • No coordinates (cannot be pinned yet)'}</div>
          </div>
        `;
        btn.addEventListener('click', function () {
          mapsState.focusedStopIndex = idx;
          window.__yatraRenderMapsSection = renderMapsSection;
    renderMapsSection();
        });
        stopListEl.appendChild(btn);
      });

      // Route Comparison Cards
      compareGridEl.innerHTML = '';
      options.forEach(opt => {
        const isSelected = opt.id === activeOption.id;
        const card = document.createElement('article');
        card.className = `route-compare-card${isSelected ? ' selected' : ''}`;
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <strong style="font-size: 0.875rem;">${opt.name}</strong>
            ${opt.recommended ? '<span class="route-recommended-badge">Best</span>' : ''}
          </div>
          <div class="route-compare-metrics">Est. ${opt.totalKm} km • ~${opt.totalMin} min</div>
          <div style="font-size: 0.75rem; color: var(--color-text-secondary); margin-bottom: auto;">${opt.note}</div>
          <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'}" style="width: 100%; min-height: 38px; padding: 6px 10px; font-size: 0.8125rem;">
            ${isSelected ? 'Selected' : 'Select Route'}
          </button>
        `;
        card.querySelector('button').addEventListener('click', function () {
          mapsState.selectedRouteId = opt.id;
          mapsState.focusedStopIndex = 0;
          window.__yatraRenderMapsSection = renderMapsSection;
    renderMapsSection();
          showToast(`Selected "${opt.name}" (Est. ${opt.totalKm} km).`);
        });
        compareGridEl.appendChild(card);
      });
    }

    scopeButtons.forEach(btn => {
      btn.addEventListener('click', function () {
        mapsState.scope = btn.getAttribute('data-maps-scope') || 'day';
        mapsState.focusedStopIndex = 0;
        scopeButtons.forEach(b => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (daySelectorEl) daySelectorEl.style.display = mapsState.scope === 'day' ? 'flex' : 'none';
        window.__yatraRenderMapsSection = renderMapsSection;
    renderMapsSection();
      });
    });

    dayButtons.forEach(btn => {
      btn.addEventListener('click', function () {
        mapsState.day = btn.getAttribute('data-maps-day') || 'day-1';
        mapsState.selectedRouteId = DAY_ROUTES[mapsState.day].options[0].id;
        mapsState.focusedStopIndex = 0;
        dayButtons.forEach(b => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        window.__yatraRenderMapsSection = renderMapsSection;
    renderMapsSection();
      });
    });

    window.__yatraRenderMapsSection = renderMapsSection;
    window.__yatraRenderMapsSection = renderMapsSection;
    renderMapsSection();
  }

  // --- 14. Bookings: Seeded Reference Catalogue & INR Breakdown (No External Payments) ---
  function initBookingsCatalogue() {
    const typeTabs = document.querySelectorAll('#booking-type-tabs [data-btype]');
    const searchInput = document.getElementById('booking-catalogue-search');
    const sortSelect = document.getElementById('booking-catalogue-sort');
    const listEl = document.getElementById('booking-catalogue-list');
    const summaryTripEl = document.getElementById('booking-summary-trip');
    const summarySelectedEl = document.getElementById('booking-summary-selected');
    const baseInrEl = document.getElementById('booking-base-inr');
    const taxInrEl = document.getElementById('booking-tax-inr');
    const totalInrEl = document.getElementById('booking-total-inr');
    const btnSaveNote = document.getElementById('btn-save-catalogue-note');
    const btnProceedPay = document.getElementById('btn-proceed-sim-payment');
    const bookingsContainer = document.getElementById('bookings-container');

    // Simulated Payment Review elements
    const btnBackBookings = document.getElementById('btn-payment-back-bookings');
    const payTripDetailsEl = document.getElementById('pay-trip-details');
    const paySelectedEl = document.getElementById('pay-selected-service');
    const payBaseEl = document.getElementById('pay-base-inr');
    const payTaxEl = document.getElementById('pay-tax-inr');
    const payTotalEl = document.getElementById('pay-total-inr');
    const payStatusEl = document.getElementById('pay-booking-status');
    const payMethodBtns = document.querySelectorAll('#pay-methods-list [data-pay-method]');
    const payScenarioEl = document.getElementById('pay-demo-scenario');
    const payErrorEl = document.getElementById('payment-error-alert');
    const payReceiptEl = document.getElementById('payment-receipt-card');
    const receiptIdEl = document.getElementById('receipt-id-code');
    const receiptSummaryEl = document.getElementById('receipt-summary-text');
    const btnRunSimPay = document.getElementById('btn-run-sim-payment');

    if (!listEl || !btnSaveNote) return;

    // Seeded sample options (no real supplier logos or live availability; prices in integer paise)
    const SEEDED_SERVICES = [
      { id: 'svc-f1', serviceType: 'flights', prdCategory: 'transport', title: 'Sample Morning Flight (DEL → JAI)', detail: '07:15 AM – 08:25 AM • Non-stop • Sample estimate', basePaise: 320000, taxPaise: 48000 },
      { id: 'svc-h1', serviceType: 'hotels', prdCategory: 'stay', title: 'Sample Heritage Haveli Stay (2 Nights)', detail: 'Bani Park, Jaipur • Breakfast included • Sample estimate', basePaise: 850000, taxPaise: 102000 },
      { id: 'svc-t1', serviceType: 'trains', prdCategory: 'transport', title: 'Sample Morning Express Chair Car (NDLS → JP)', detail: '06:05 AM – 10:45 AM • AC Chair Car • Sample estimate', basePaise: 215000, taxPaise: 15000 },
      { id: 'svc-b1', serviceType: 'buses', prdCategory: 'transport', title: 'Sample AC Sleeper Coach (Jaipur → Jodhpur)', detail: '10:30 PM – 05:30 AM • Overnight • Sample estimate', basePaise: 95000, taxPaise: 9500 },
      { id: 'svc-a1', serviceType: 'activities', prdCategory: 'activity', title: 'Sample Guided Fort & Observatory Pass', detail: '3 hrs walking tour • Audio guide included • Sample estimate', basePaise: 110000, taxPaise: 10000 }
    ];

    const catState = {
      type: 'all',
      sort: 'recommended',
      selectedId: 'svc-t1',
      payMethod: 'upi',
      confirmedServiceKeys: new Set()
    };

    function formatInrFromPaise(paise) {
      const rupees = Math.round(paise / 100);
      return `₹${rupees.toLocaleString('en-IN')}`;
    }

    function renderSummary() {
      const trip = state.trips.find(t => t.id === state.activeTripId) || state.trips[0];
      if (summaryTripEl && trip) {
        summaryTripEl.textContent = `${trip.name} • ${trip.destination} • ${trip.travelers || 1} Travelers`;
      }
      const selected = SEEDED_SERVICES.find(s => s.id === catState.selectedId);
      if (!selected) {
        if (summarySelectedEl) summarySelectedEl.textContent = 'Select a sample service on the left to inspect its INR breakdown.';
        if (baseInrEl) baseInrEl.textContent = '₹0';
        if (taxInrEl) taxInrEl.textContent = '₹0';
        if (totalInrEl) totalInrEl.textContent = '₹0';
        btnSaveNote.disabled = true;
        if (btnProceedPay) btnProceedPay.disabled = true;
        return;
      }

      const totalPaise = selected.basePaise + selected.taxPaise;
      if (summarySelectedEl) summarySelectedEl.textContent = `${selected.title} (${selected.serviceType.toUpperCase()})`;
      if (baseInrEl) baseInrEl.textContent = formatInrFromPaise(selected.basePaise);
      if (taxInrEl) taxInrEl.textContent = formatInrFromPaise(selected.taxPaise);
      if (totalInrEl) totalInrEl.textContent = formatInrFromPaise(totalPaise);
      btnSaveNote.disabled = false;
      if (btnProceedPay) btnProceedPay.disabled = false;
    }

    function renderList() {
      const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
      let filtered = SEEDED_SERVICES.filter(s => {
        const matchType = catState.type === 'all' || s.serviceType === catState.type;
        const matchQuery = !query || `${s.title} ${s.detail} ${s.serviceType}`.toLowerCase().includes(query);
        return matchType && matchQuery;
      });

      if (catState.sort === 'price-asc') {
        filtered.sort((a, b) => (a.basePaise + a.taxPaise) - (b.basePaise + b.taxPaise));
      } else if (catState.sort === 'price-desc') {
        filtered.sort((a, b) => (b.basePaise + b.taxPaise) - (a.basePaise + a.taxPaise));
      }

      listEl.innerHTML = '';
      if (!filtered.length) {
        listEl.innerHTML = `
          <div class="empty-state-card" style="padding: var(--space-lg); margin: 0;">
            <h3 class="empty-state-title" style="font-size: 1rem;">No matching sample services</h3>
            <p class="empty-state-desc" style="margin-bottom: 0; font-size: 0.875rem;">Try clearing your search or choosing "All Services".</p>
          </div>
        `;
        renderSummary();
        return;
      }

      filtered.forEach(svc => {
        const totalPaise = svc.basePaise + svc.taxPaise;
        const isSel = svc.id === catState.selectedId;
        const card = document.createElement('article');
        card.className = `booking-option-card${isSel ? ' selected' : ''}`;
        card.innerHTML = `
          <div style="flex: 1; min-width: 200px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
              <span class="booking-type-badge cat-${svc.prdCategory}">${svc.serviceType}</span>
              <span style="font-size: 0.6875rem; color: var(--color-text-muted); font-weight: 700;">Sample Estimate • No Live Availability</span>
            </div>
            <h3 style="font-size: 0.9375rem; font-weight: 800; margin-bottom: 2px;">${svc.title}</h3>
            <div style="font-size: 0.75rem; color: var(--color-text-secondary);">${svc.detail}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <strong style="font-size: 1.05rem; color: var(--color-brand-ink);">${formatInrFromPaise(totalPaise)}</strong>
            <button type="button" class="btn ${isSel ? 'btn-primary' : 'btn-secondary'}" style="min-height: 38px; padding: 6px 12px; font-size: 0.8125rem;">
              ${isSel ? 'Selected' : 'Select'}
            </button>
          </div>
        `;
        card.querySelector('button').addEventListener('click', function () {
          catState.selectedId = svc.id;
          renderList();
        });
        listEl.appendChild(card);
      });

      renderSummary();
    }

    typeTabs.forEach(tab => {
      tab.addEventListener('click', function () {
        catState.type = tab.getAttribute('data-btype') || 'all';
        typeTabs.forEach(t => {
          const active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        renderList();
      });
    });

    if (searchInput) searchInput.addEventListener('input', renderList);
    if (sortSelect) sortSelect.addEventListener('change', () => { catState.sort = sortSelect.value; renderList(); });

    btnSaveNote.addEventListener('click', async function () {
      if (state.isOffline) {
        showToast('Offline Mode: Saving booking notes requires internet connectivity.');
        return;
      }
      const selected = SEEDED_SERVICES.find(s => s.id === catState.selectedId);
      if (!selected || !bookingsContainer) return;

      const totalPaise = selected.basePaise + selected.taxPaise;
      let noteId = `bnote-${Date.now()}`;
      if (state.isAuthenticated && state.activeTripId) {
        try {
          const res = await apiFetch(`/api/workspace/trips/${encodeURIComponent(state.activeTripId)}/booking-notes`, {
            method: 'POST',
            body: JSON.stringify({
              category: selected.prdCategory,
              provider: selected.title,
              reference: 'SAMPLE-NOTE',
              notes: `${selected.detail}. Personal reference note only — YatraSathi does not book or process payments.`,
              amountPaise: totalPaise,
              isSimulated: true
            })
          });
          if (res.bookingNote && res.bookingNote.id) noteId = res.bookingNote.id;
        } catch (err) {
          showToast(err.message || 'Could not save booking note to D1.');
          return;
        }
      }

      const card = document.createElement('article');
      card.className = 'booking-card';
      card.setAttribute('data-booking-note-id', noteId);
      card.innerHTML = `
        <div class="booking-card-top">
          <div class="booking-type-badge cat-${selected.prdCategory}">${selected.prdCategory}</div>
          <div class="booking-amount">${formatInrFromPaise(totalPaise)}</div>
        </div>
        <h4 class="booking-provider">${selected.title}</h4>
        <div class="booking-pnr">
          <span>Reference Status:</span>
          <code>SAMPLE-NOTE-LOCAL</code>
        </div>
        <p class="booking-notes">${selected.detail}. Personal reference note only — YatraSathi does not book or process payments.</p>
        <div class="booking-card-actions">
          <span style="font-size: 0.75rem; color: var(--color-text-muted);">Added by ${state.userDisplayName || 'Owner'}</span>
          <button class="btn-delete-booking" type="button" title="Delete record" aria-label="Delete booking note">Delete</button>
        </div>
      `;
      bookingsContainer.prepend(card);
      showToast(`Saved "${selected.title}" as a personal booking note.`);
      if (typeof window.__yatraRecordActivity === 'function') {
        window.__yatraRecordActivity(`Saved booking reference: ${selected.title}`);
      }
    });

    function populatePaymentReview() {
      const trip = state.trips.find(t => t.id === state.activeTripId) || state.trips[0];
      const selected = SEEDED_SERVICES.find(s => s.id === catState.selectedId) || SEEDED_SERVICES[0];
      if (!selected) return;

      const totalPaise = selected.basePaise + selected.taxPaise;
      const confirmKey = `${trip ? trip.id : 'trip-1'}:${selected.id}`;
      const alreadyConfirmed = catState.confirmedServiceKeys.has(confirmKey);

      if (payTripDetailsEl && trip) {
        payTripDetailsEl.textContent = `${trip.name} • ${trip.destination} • ${trip.startDate || 'TBD'} – ${trip.endDate || 'TBD'} • ${trip.travelers || 1} Travelers`;
      }
      if (paySelectedEl) paySelectedEl.textContent = `${selected.title} (${selected.serviceType.toUpperCase()})`;
      if (payBaseEl) payBaseEl.textContent = formatInrFromPaise(selected.basePaise);
      if (payTaxEl) payTaxEl.textContent = formatInrFromPaise(selected.taxPaise);
      if (payTotalEl) payTotalEl.textContent = formatInrFromPaise(totalPaise);
      if (payStatusEl) payStatusEl.textContent = alreadyConfirmed ? 'Simulated Confirmed' : 'Pending Simulated Review';

      if (payErrorEl) payErrorEl.style.display = 'none';
      if (payReceiptEl) payReceiptEl.style.display = alreadyConfirmed ? 'block' : 'none';
      if (btnRunSimPay) {
        btnRunSimPay.textContent = alreadyConfirmed ? 'Confirmed (Simulated)' : 'Run Simulated Payment';
        btnRunSimPay.disabled = alreadyConfirmed;
      }
    }

    if (btnProceedPay) {
      btnProceedPay.addEventListener('click', function () {
        populatePaymentReview();
        switchSection('payment-review');
      });
    }

    if (btnBackBookings) {
      btnBackBookings.addEventListener('click', () => switchSection('bookings'));
    }

    payMethodBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        catState.payMethod = btn.getAttribute('data-pay-method') || 'upi';
        payMethodBtns.forEach(b => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-checked', active ? 'true' : 'false');
        });
      });
    });

    if (btnRunSimPay) {
      btnRunSimPay.addEventListener('click', function () {
        if (state.isOffline) {
          showToast('Offline Mode: Simulated payment review requires connectivity.');
          return;
        }
        const trip = state.trips.find(t => t.id === state.activeTripId) || state.trips[0];
        const selected = SEEDED_SERVICES.find(s => s.id === catState.selectedId);
        if (!selected || !bookingsContainer) return;

        const scenario = payScenarioEl ? payScenarioEl.value : 'success';
        const confirmKey = `${trip ? trip.id : 'trip-1'}:${selected.id}`;

        if (scenario === 'failure') {
          if (payErrorEl) payErrorEl.style.display = 'flex';
          if (payReceiptEl) payReceiptEl.style.display = 'none';
          if (payStatusEl) payStatusEl.textContent = 'Simulated Failure — Retry Ready';
          btnRunSimPay.textContent = 'Retry Simulated Payment';
          showToast('Simulated payment failed. You can retry safely without duplicate bookings.');
          return;
        }

        // Prevent duplicate bookings on success
        if (!catState.confirmedServiceKeys.has(confirmKey)) {
          catState.confirmedServiceKeys.add(confirmKey);
          const totalPaise = selected.basePaise + selected.taxPaise;
          const rcptCode = `SIM-RCPT-${String(Date.now()).slice(-6)}`;
          const card = document.createElement('article');
          card.className = 'booking-card';
          card.innerHTML = `
            <div class="booking-card-top">
              <div class="booking-type-badge cat-${selected.prdCategory}">${selected.prdCategory}</div>
              <div class="booking-amount">${formatInrFromPaise(totalPaise)}</div>
            </div>
            <h4 class="booking-provider">${selected.title}</h4>
            <div class="booking-pnr">
              <span>Simulated Receipt:</span>
              <code>${rcptCode}</code>
            </div>
            <p class="booking-notes">Simulated ${catState.payMethod.toUpperCase()} confirmation (demo only — not a real reservation or payment).</p>
            <div class="booking-card-actions">
              <span style="font-size: 0.75rem; color: var(--color-state-success); font-weight: 700;">Simulated Confirmed</span>
              <button class="btn-delete-booking" type="button" title="Delete record" aria-label="Delete booking note">Delete</button>
            </div>
          `;
          bookingsContainer.prepend(card);

          if (receiptIdEl) receiptIdEl.textContent = rcptCode;
          if (receiptSummaryEl) {
            receiptSummaryEl.textContent = `${selected.title} • ${formatInrFromPaise(totalPaise)} via Simulated ${catState.payMethod.toUpperCase()}`;
          }
          if (typeof window.__yatraRecordActivity === 'function') {
            window.__yatraRecordActivity(`Simulated confirmation: ${selected.title}`);
          }
        }

        if (payErrorEl) payErrorEl.style.display = 'none';
        if (payReceiptEl) payReceiptEl.style.display = 'block';
        if (payStatusEl) payStatusEl.textContent = 'Simulated Confirmed';
        btnRunSimPay.textContent = 'Confirmed (Simulated)';
        btnRunSimPay.disabled = true;
        showToast('Simulated booking confirmed! Receipt displayed.');

        const receiptEmailStatusEl = document.getElementById('receipt-email-status');
        const btnRetryReceipt = document.getElementById('btn-retry-receipt-email');
        if (receiptEmailStatusEl && btnRetryReceipt) {
          btnRetryReceipt.setAttribute('data-booking-id', confirmKey);
          receiptEmailStatusEl.textContent = 'Ready to send receipt email (owner-scoped).';
        }
      });
    }

    const btnRetryReceiptEmail = document.getElementById('btn-retry-receipt-email');
    const receiptEmailStatusEl = document.getElementById('receipt-email-status');
    if (btnRetryReceiptEmail && receiptEmailStatusEl) {
      btnRetryReceiptEmail.addEventListener('click', async function () {
        if (state.isOffline) {
          receiptEmailStatusEl.textContent = 'Offline Mode: Sending receipt email requires connectivity.';
          return;
        }
        const bookingId = btnRetryReceiptEmail.getAttribute('data-booking-id') || 'sim-booking';
        const confirmFresh = btnRetryReceiptEmail.getAttribute('data-confirm-fresh') === 'true';
        btnRetryReceiptEmail.disabled = true;
        receiptEmailStatusEl.textContent = 'Requesting receipt email...';
        try {
          const resp = await fetch(getApiBase() + `/api/bookings/${encodeURIComponent(bookingId)}/receipt-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ confirmFreshSend: confirmFresh })
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.status === 409 && data.freshSendAllowed) {
            receiptEmailStatusEl.textContent = data.message;
            btnRetryReceiptEmail.setAttribute('data-confirm-fresh', 'true');
            btnRetryReceiptEmail.textContent = 'Send Fresh Receipt';
            btnRetryReceiptEmail.disabled = false;
            return;
          }
          if (!resp.ok) {
            receiptEmailStatusEl.textContent = data.message || 'Receipt email unavailable right now.';
            btnRetryReceiptEmail.disabled = data.retryAllowed === false;
            return;
          }
          receiptEmailStatusEl.textContent = data.message || 'Receipt email accepted for sending.';
          btnRetryReceiptEmail.removeAttribute('data-confirm-fresh');
          btnRetryReceiptEmail.textContent = 'Retry Receipt Email';
          btnRetryReceiptEmail.disabled = false;
        } catch {
          receiptEmailStatusEl.textContent = 'Worker email API is not connected in local preview mode.';
          btnRetryReceiptEmail.disabled = false;
        }
      });
    }

    renderList();
  }

  // --- 15. Expenses: Integer-Paise Ledger, Category Breakdown, Trip Summary & Edit/Delete ---
  function initExpensesLedger() {
    const tbody = document.getElementById('expense-table-body');
    const emptyEl = document.getElementById('exp-empty-state');
    const filterTripEl = document.getElementById('exp-filter-trip');
    const filterCatEl = document.getElementById('exp-filter-category');
    const breakdownEl = document.getElementById('exp-category-breakdown');
    const breakdownPillEl = document.getElementById('exp-breakdown-total-pill');
    const tripSummaryEl = document.getElementById('exp-trip-summary');
    const totalBudgetEl = document.getElementById('exp-total-budget');
    const totalSpentEl = document.getElementById('exp-total-spent');
    const remainingEl = document.getElementById('exp-remaining');
    const remainingLabelEl = document.getElementById('exp-remaining-label');
    const remainingNoteEl = document.getElementById('exp-remaining-note');
    const plannedEstEl = document.getElementById('exp-planned-est');
    const btnResetFilters = document.getElementById('btn-exp-reset-filters');

    const modalExpense = document.getElementById('modal-add-expense');
    const modalExpenseTitle = document.getElementById('modal-expense-title');
    const formExpense = document.getElementById('form-add-expense');
    const editIdInput = document.getElementById('expense-edit-id');
    const tripSelectInput = document.getElementById('expense-input-trip');
    const amountInput = document.getElementById('expense-input-amount');
    const catInput = document.getElementById('expense-input-cat');
    const descInput = document.getElementById('expense-input-desc');
    const dateInput = document.getElementById('expense-input-date');

    if (!tbody || !breakdownEl || !tripSummaryEl) return;

    // Saved expenses stored in integer paise
    const expensesState = {
      filterTrip: 'all',
      filterCat: 'all',
      items: [
        { id: 'exp-r1', tripId: 'trip-1', date: '2026-11-25', category: 'stay', note: 'Haveli Hotel Advance Deposit', author: 'Arnav (Owner)', amountPaise: 980000 },
        { id: 'exp-r2', tripId: 'trip-1', date: '2026-11-26', category: 'transport', note: 'Train Shatabdi Express Tickets (2)', author: 'Arnav (Owner)', amountPaise: 245000 },
        { id: 'exp-r3', tripId: 'trip-1', date: '2026-11-27', category: 'transport', note: 'Advance for Jodhpur Taxi Transfer', author: 'Meera (Collaborator)', amountPaise: 300000 },
        { id: 'exp-r4', tripId: 'trip-1', date: '2026-11-27', category: 'activities', note: 'Amer Fort Audio Guides & Passes', author: 'Meera (Collaborator)', amountPaise: 160000 },
        { id: 'exp-r5', tripId: 'trip-1', date: '2026-11-27', category: 'food', note: 'Traditional Sweets at Rawat Mishtan', author: 'Arnav (Owner)', amountPaise: 155000 },
        { id: 'exp-k1', tripId: 'trip-2', date: '2027-01-10', category: 'stay', note: 'Munnar Tea Estate Homestay Deposit', author: 'Arnav (Owner)', amountPaise: 420000 }
      ]
    };

    function formatPaise(paise, withDecimals) {
      const rupees = paise / 100;
      if (withDecimals) {
        return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
    }

    function populateTripSelectors() {
      if (filterTripEl) {
        const prev = filterTripEl.value || 'all';
        filterTripEl.innerHTML = `<option value="all">All Trips</option>` +
          state.trips.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        if (prev === 'all' || state.trips.some(t => t.id === prev)) filterTripEl.value = prev;
      }
      if (tripSelectInput) {
        const prev = tripSelectInput.value || state.activeTripId;
        tripSelectInput.innerHTML = state.trips.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        if (state.trips.some(t => t.id === prev)) tripSelectInput.value = prev;
      }
    }

    function syncTripSpentFromItems() {
      state.trips.forEach(t => {
        const sumPaise = expensesState.items
          .filter(item => item.tripId === t.id)
          .reduce((acc, item) => acc + item.amountPaise, 0);
        t.spent = Math.round(sumPaise / 100);
      });
    }

    function renderExpensesSection() {
      populateTripSelectors();
      syncTripSpentFromItems();

      const isEmptySim = state.uiMode === 'empty';
      const baseItems = isEmptySim ? [] : expensesState.items;
      const scopeTrips = isEmptySim ? [] : (expensesState.filterTrip === 'all' ? state.trips : state.trips.filter(t => t.id === expensesState.filterTrip));

      // KPI totals in integer paise
      const totalBudgetPaise = scopeTrips.reduce((s, t) => s + ((t.budget || 0) * 100), 0);
      const totalEstPaise = scopeTrips.reduce((s, t) => s + ((t.estimated || 0) * 100), 0);
      const scopedExpenses = baseItems.filter(i => expensesState.filterTrip === 'all' || i.tripId === expensesState.filterTrip);
      const totalSpentPaise = scopedExpenses.reduce((s, i) => s + i.amountPaise, 0);
      const diffPaise = totalBudgetPaise - totalSpentPaise;

      if (totalBudgetEl) totalBudgetEl.textContent = formatPaise(totalBudgetPaise, false);
      if (totalSpentEl) totalSpentEl.textContent = formatPaise(totalSpentPaise, false);
      if (plannedEstEl) plannedEstEl.textContent = formatPaise(totalEstPaise, false);

      if (remainingEl && remainingLabelEl && remainingNoteEl) {
        if (diffPaise < 0) {
          remainingLabelEl.textContent = 'Over Budget';
          remainingLabelEl.style.color = 'var(--color-state-error)';
          remainingEl.textContent = formatPaise(Math.abs(diffPaise), false);
          remainingEl.style.color = 'var(--color-state-error)';
          remainingNoteEl.textContent = `Exceeded budget by ${formatPaise(Math.abs(diffPaise), false)}`;
        } else {
          remainingLabelEl.textContent = 'Remaining Safe Budget';
          remainingLabelEl.style.color = '';
          remainingEl.textContent = formatPaise(diffPaise, false);
          remainingEl.style.color = 'var(--color-state-success)';
          remainingNoteEl.textContent = 'Budget minus actual spent';
        }
      }

      // Category Breakdown
      if (breakdownPillEl) breakdownPillEl.textContent = `${formatPaise(totalSpentPaise, false)} Total`;
      breakdownEl.innerHTML = '';
      if (!scopedExpenses.length) {
        breakdownEl.innerHTML = `<p style="font-size: 0.875rem; color: var(--color-text-secondary);">No saved expense data yet to break down by category.</p>`;
      } else {
        const categories = ['transport', 'stay', 'food', 'activities', 'other'];
        categories.forEach(cat => {
          const catPaise = scopedExpenses.filter(i => i.category === cat).reduce((s, i) => s + i.amountPaise, 0);
          if (catPaise === 0) return;
          const pct = totalSpentPaise > 0 ? Math.round((catPaise * 100) / totalSpentPaise) : 0;
          const row = document.createElement('div');
          row.className = 'exp-cat-row';
          row.innerHTML = `
            <div class="exp-cat-row-top">
              <span class="expense-cat-badge cat-${cat}">${cat}</span>
              <span><strong>${formatPaise(catPaise, false)}</strong> (${pct}%)</span>
            </div>
            <div class="dash-progress-track"><div class="dash-progress-fill" style="width: ${pct}%;"></div></div>
          `;
          breakdownEl.appendChild(row);
        });
      }

      // Trip-Wise Summary
      tripSummaryEl.innerHTML = '';
      if (isEmptySim || !state.trips.length) {
        tripSummaryEl.innerHTML = `<p style="font-size: 0.875rem; color: var(--color-text-secondary);">No trips available to summarize.</p>`;
      } else {
        state.trips.forEach(t => {
          const tSpentPaise = baseItems.filter(i => i.tripId === t.id).reduce((s, i) => s + i.amountPaise, 0);
          const tBudgetPaise = (t.budget || 0) * 100;
          const pct = tBudgetPaise > 0 ? Math.min(100, Math.round((tSpentPaise * 100) / tBudgetPaise)) : 0;
          const isOver = tBudgetPaise > 0 && tSpentPaise > tBudgetPaise;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `exp-trip-summary-btn${expensesState.filterTrip === t.id ? ' active' : ''}`;
          btn.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.875rem; font-weight: 800;">
              <span>${t.name}</span>
              <span style="color: ${isOver ? 'var(--color-state-error)' : 'var(--color-brand-teal)'};">${formatPaise(tSpentPaise, false)} / ${formatPaise(tBudgetPaise, false)}</span>
            </div>
            <div class="dash-progress-track"><div class="dash-progress-fill" style="width: ${pct}%;"></div></div>
          `;
          btn.addEventListener('click', function () {
            expensesState.filterTrip = expensesState.filterTrip === t.id ? 'all' : t.id;
            if (filterTripEl) filterTripEl.value = expensesState.filterTrip;
            renderExpensesSection();
          });
          tripSummaryEl.appendChild(btn);
        });
      }

      // Filtered Table Rows
      const visibleItems = scopedExpenses.filter(i => expensesState.filterCat === 'all' || i.category === expensesState.filterCat);
      tbody.innerHTML = '';

      if (!visibleItems.length) {
        if (emptyEl) emptyEl.style.display = 'block';
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        visibleItems.forEach(item => {
          const tripObj = state.trips.find(t => t.id === item.tripId);
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${item.date}</td>
            <td>${tripObj ? tripObj.name : 'Trip'}</td>
            <td><span class="expense-cat-badge cat-${item.category}">${item.category}</span></td>
            <td>${item.note}</td>
            <td>${item.author}</td>
            <td style="text-align: right; font-weight: 800;">${formatPaise(item.amountPaise, true)}</td>
            <td style="text-align: center; white-space: nowrap;">
              <button class="btn-edit-expense" type="button" aria-label="Edit expense ${item.note}">Edit</button>
              <button class="btn-delete-expense" type="button" title="Delete expense" aria-label="Delete expense ${item.note}">×</button>
            </td>
          `;
          tr.querySelector('.btn-edit-expense').addEventListener('click', function () {
            if (state.isOffline) {
              showToast('Offline Mode: Editing expenses requires internet connectivity.');
              return;
            }
            if (editIdInput) editIdInput.value = item.id;
            if (modalExpenseTitle) modalExpenseTitle.textContent = 'Edit Expense Entry';
            if (tripSelectInput) tripSelectInput.value = item.tripId;
            if (amountInput) amountInput.value = (item.amountPaise / 100).toFixed(2);
            if (catInput) catInput.value = item.category;
            if (descInput) descInput.value = item.note;
            if (dateInput) dateInput.value = item.date;
            openModal(modalExpense);
          });
          tr.querySelector('.btn-delete-expense').addEventListener('click', async function () {
            if (state.isOffline) {
              showToast('Offline Mode: Deleting expenses requires internet connectivity.');
              return;
            }
            if (state.isAuthenticated) {
              try {
                await apiFetch(`/api/workspace/trips/${encodeURIComponent(item.tripId)}/expenses/${encodeURIComponent(item.id)}`, {
                  method: 'DELETE'
                });
              } catch (err) {
                showToast(err.message || 'Could not delete expense from D1.');
                return;
              }
            }
            expensesState.items = expensesState.items.filter(x => x.id !== item.id);
            renderExpensesSection();
            if (typeof window.__yatraRenderDashboard === 'function') window.__yatraRenderDashboard();
            if (typeof window.__yatraRenderMyTrips === 'function') window.__yatraRenderMyTrips();
            showToast('Expense entry deleted.');
          });
          tbody.appendChild(tr);
        });
      }
    }

    // Reset edit state when "+ Record Expense" is clicked
    document.querySelectorAll('.btn-action-add-expense').forEach(btn => {
      btn.addEventListener('click', function () {
        if (editIdInput) editIdInput.value = '';
        if (modalExpenseTitle) modalExpenseTitle.textContent = 'Record Actual Expense';
        populateTripSelectors();
        if (tripSelectInput) tripSelectInput.value = state.activeTripId;
        if (amountInput) amountInput.value = '';
        if (descInput) descInput.value = '';
      });
    });

    if (formExpense) {
      formExpense.addEventListener('submit', async function (e) {
        e.preventDefault();
        const editId = editIdInput ? editIdInput.value : '';
        const tripId = (tripSelectInput && tripSelectInput.value) || state.activeTripId;
        const amountPaise = Math.round((parseFloat(amountInput.value) || 0) * 100);
        const cat = catInput ? catInput.value : 'other';
        const note = descInput ? descInput.value.trim() : '';
        const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

        if (amountPaise <= 0) {
          showToast('Please enter a valid INR amount greater than zero.');
          return;
        }

        if (editId) {
          const existing = expensesState.items.find(x => x.id === editId);
          if (existing) {
            if (state.isAuthenticated) {
              try {
                await apiFetch(`/api/workspace/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(editId)}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ category: cat, amountPaise, note, date })
                });
              } catch (err) {
                showToast(err.message || 'Could not update expense in D1.');
                return;
              }
            }
            existing.tripId = tripId;
            existing.amountPaise = amountPaise;
            existing.category = cat;
            existing.note = note;
            existing.date = date;
          }
          showToast(`Updated expense "${note}" (${formatPaise(amountPaise, true)}).`);
        } else {
          let newExp = {
            id: `exp-${Date.now()}`,
            tripId: tripId,
            date: date,
            category: cat,
            note: note,
            author: `${state.userDisplayName || 'Arnav'} (Owner)`,
            amountPaise: amountPaise
          };
          if (state.isAuthenticated) {
            try {
              const res = await apiFetch(`/api/workspace/trips/${encodeURIComponent(tripId)}/expenses`, {
                method: 'POST',
                body: JSON.stringify({ category: cat, amountPaise, note, date })
              });
              if (res.expense) newExp = res.expense;
            } catch (err) {
              showToast(err.message || 'Could not save expense to D1.');
              return;
            }
          }
          expensesState.items.unshift(newExp);
          showToast(`Logged ${formatPaise(amountPaise, true)} under ${cat}.`);
          if (typeof window.__yatraRecordActivity === 'function') {
            window.__yatraRecordActivity(`Logged ${formatPaise(amountPaise, false)} expense (${cat})`);
          }
        }

        if (editIdInput) editIdInput.value = '';
        closeAllModals();
        renderExpensesSection();
        if (typeof window.__yatraRenderDashboard === 'function') window.__yatraRenderDashboard();
        if (typeof window.__yatraRenderMyTrips === 'function') window.__yatraRenderMyTrips();
      });
    }

    window.__yatraSetExpenses = function (items) {
      expensesState.items = Array.isArray(items) ? items : [];
      renderExpensesSection();
    };

    if (filterTripEl) filterTripEl.addEventListener('change', () => { expensesState.filterTrip = filterTripEl.value; renderExpensesSection(); });
    if (filterCatEl) filterCatEl.addEventListener('change', () => { expensesState.filterCat = filterCatEl.value; renderExpensesSection(); });
    if (btnResetFilters) {
      btnResetFilters.addEventListener('click', function () {
        expensesState.filterTrip = 'all';
        expensesState.filterCat = 'all';
        if (filterTripEl) filterTripEl.value = 'all';
        if (filterCatEl) filterCatEl.value = 'all';
        renderExpensesSection();
      });
    }

    window.__yatraRenderExpenses = renderExpensesSection;
    renderExpensesSection();
  }

  // --- 16. Achievements: Real Activity-Based Badges, XP & Goals ---
  function initAchievementsTracker() {
    const emptyEl = document.getElementById('ach-empty-state');
    const mainEl = document.getElementById('ach-main-content');
    const totalXpEl = document.getElementById('ach-total-xp');
    const badgesCountEl = document.getElementById('ach-badges-count');
    const overallPctEl = document.getElementById('ach-overall-pct');
    const actionsCountEl = document.getElementById('ach-actions-count');
    const badgesGridEl = document.getElementById('ach-badges-grid');
    const goalsListEl = document.getElementById('ach-goals-list');
    const recentListEl = document.getElementById('ach-recent-list');
    const btnStartTrip = document.getElementById('btn-ach-start-trip');
    const sidebarAchBadge = document.querySelector('[data-section="achievements"] .sidebar-badge-pill');

    if (!badgesGridEl || !goalsListEl || !recentListEl) return;

    const BADGE_DEFS = [
      {
        id: 'first-blueprint',
        name: 'First Blueprint',
        description: 'Started your first structured trip plan in YatraSathi.',
        xp: 100,
        how: 'Create at least 1 trip blueprint.',
        check: ctx => ctx.tripsCount >= 1
      },
      {
        id: 'budget-architect',
        name: 'Budget Architect',
        description: 'Established a dedicated INR spending target for a trip.',
        xp: 100,
        how: 'Set an INR trip budget above ₹0.',
        check: ctx => ctx.hasBudget
      },
      {
        id: 'route-scout',
        name: 'Route Scout',
        description: 'Mapped out a multi-stop day-by-day itinerary.',
        xp: 150,
        how: 'Plot 3 or more activities in your itinerary.',
        check: ctx => ctx.activitiesCount >= 3
      },
      {
        id: 'vault-keeper',
        name: 'Vault Keeper',
        description: 'Stored a personal booking reference in your private vault.',
        xp: 100,
        how: 'Save at least 1 personal booking reference note.',
        check: ctx => ctx.bookingsCount >= 1
      },
      {
        id: 'expense-tracker',
        name: 'Expense Tracker',
        description: 'Logged actual trip spending separately from estimates.',
        xp: 150,
        how: 'Record at least 1 actual expense in INR.',
        check: ctx => ctx.expensesCount >= 1
      },
      {
        id: 'destination-explorer',
        name: 'Destination Explorer',
        description: 'Shortlisted curated Indian destinations for future trips.',
        xp: 100,
        how: 'Save at least 2 Indian destinations in Explore India.',
        check: ctx => ctx.savedDestCount >= 2
      },
      {
        id: 'offline-ready',
        name: 'Offline Ready',
        description: 'Prepared a read-only trip snapshot on this device.',
        xp: 100,
        how: 'Save a trip snapshot for read-only offline viewing.',
        check: ctx => ctx.hasOffline
      }
    ];

    function getPersistedUnlocked() {
      if (state.isAuthenticated) {
        return new Set(state.unlockedBadges || []);
      }
      try {
        const raw = localStorage.getItem(scopedStorageKey('unlocked_badges'));
        return raw ? new Set(JSON.parse(raw)) : new Set();
      } catch (e) {
        return new Set();
      }
    }

    function savePersistedUnlocked(setObj, newlyUnlocked) {
      if (state.isAuthenticated) {
        if (newlyUnlocked) {
          apiFetch('/api/workspace/achievements/sync', {
            method: 'POST',
            body: '{}'
          })
            .then(res => {
              if (res && Array.isArray(res.achievements)) {
                state.unlockedBadges = new Set(res.achievements);
              }
            })
            .catch(() => {});
        }
        return;
      }
      try {
        localStorage.setItem(scopedStorageKey('unlocked_badges'), JSON.stringify(Array.from(setObj)));
      } catch (e) {
        // Ignore storage quota issues
      }
    }

    function computeAchievementSummary() {
      const isEmptySim = state.uiMode === 'empty';
      const tripsCount = isEmptySim ? 0 : state.trips.length;
      const activitiesCount = isEmptySim
        ? 0
        : (state.isAuthenticated ? (state.itineraryItems || []).length : document.querySelectorAll('#activities-container .activity-card').length);
      const bookingsCount = isEmptySim
        ? 0
        : (state.isAuthenticated ? (state.bookingNotes || []).length : document.querySelectorAll('#bookings-container .booking-card').length);
      const expensesCount = isEmptySim
        ? 0
        : (state.isAuthenticated && typeof window.__yatraGetExpensesCount === 'function'
          ? window.__yatraGetExpensesCount()
          : document.querySelectorAll('#expense-table-body tr').length);
      const savedDestCount = isEmptySim ? 0 : state.savedDestinations.size;
      const hasBudget = !isEmptySim && state.trips.some(t => (t.budget || 0) > 0);
      const offlinePrefix = scopedStoragePrefix('offline_');
      const hasOffline = !isEmptySim && Object.keys(localStorage).some(k => k.startsWith(offlinePrefix));
      const totalActions = tripsCount + activitiesCount + bookingsCount + expensesCount + savedDestCount;

      if (totalActions === 0) {
        return {
          totalActions: 0,
          totalXp: 0,
          unlockedList: [],
          unlockedCount: 0,
          totalBadges: BADGE_DEFS.length,
          goals: [],
          overallGoalPct: 0
        };
      }

      const ctx = { tripsCount, activitiesCount, bookingsCount, expensesCount, savedDestCount, hasBudget, hasOffline };
      const persisted = getPersistedUnlocked();
      const unlockedList = [];
      let totalXp = 0;
      let newlyUnlocked = false;

      BADGE_DEFS.forEach(def => {
        if (def.check(ctx) && !persisted.has(def.id)) {
          persisted.add(def.id);
          newlyUnlocked = true;
        }
        if (persisted.has(def.id)) {
          totalXp += def.xp;
          unlockedList.push(def);
        }
      });
      savePersistedUnlocked(persisted, newlyUnlocked);

      const goals = [
        { title: 'Plan 3 Trips', current: tripsCount, target: 3, xp: 150 },
        { title: 'Plot 5 Itinerary Activities', current: activitiesCount, target: 5, xp: 150 },
        { title: 'Save 2 Indian Destinations', current: savedDestCount, target: 2, xp: 100 }
      ];
      let goalPctSum = 0;
      goals.forEach(g => {
        goalPctSum += Math.min(100, Math.round((g.current * 100) / g.target));
        if (g.current >= g.target) totalXp += g.xp;
      });
      const overallGoalPct = Math.round(goalPctSum / goals.length);

      return {
        totalActions,
        totalXp,
        unlockedList,
        unlockedCount: unlockedList.length,
        totalBadges: BADGE_DEFS.length,
        goals,
        overallGoalPct
      };
    }

    window.__yatraGetAchievementStats = computeAchievementSummary;

    function renderAchievements() {
      const summary = computeAchievementSummary();
      const { totalActions, totalXp, unlockedList, goals, overallGoalPct } = summary;

      if (totalActions === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (mainEl) mainEl.style.display = 'none';
        if (sidebarAchBadge) sidebarAchBadge.textContent = '0 XP';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';
      if (mainEl) mainEl.style.display = 'block';

      if (totalXpEl) totalXpEl.textContent = `${totalXp} XP`;
      if (badgesCountEl) badgesCountEl.textContent = `${unlockedList.length} / ${BADGE_DEFS.length}`;
      if (overallPctEl) overallPctEl.textContent = `${overallGoalPct}%`;
      if (actionsCountEl) actionsCountEl.textContent = totalActions;
      if (sidebarAchBadge) sidebarAchBadge.textContent = `${overallGoalPct}%`;

      // Render Badges Grid
      badgesGridEl.innerHTML = '';
      BADGE_DEFS.forEach(def => {
        const isUnlocked = unlockedList.some(b => b.id === def.id);
        const card = document.createElement('article');
        card.className = `ach-badge-card${isUnlocked ? ' unlocked' : ''}`;
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <strong style="font-size: 0.9375rem;">${def.name}</strong>
            <span class="ach-xp-pill">+${def.xp} XP</span>
          </div>
          <p style="font-size: 0.75rem; color: var(--color-text-secondary); line-height: 1.4; margin: 4px 0 2px;">${def.description}</p>
          <p style="font-size: 0.75rem; color: var(--color-text-muted); line-height: 1.4; margin: 0;"><strong>How to earn:</strong> ${def.how}</p>
          <span style="font-size: 0.6875rem; font-weight: 800; color: ${isUnlocked ? 'var(--color-state-success)' : 'var(--color-text-muted)'};">
            ${isUnlocked ? '✓ Earned' : 'Locked'}
          </span>
        `;
        badgesGridEl.appendChild(card);
      });

      // Render Goals List
      goalsListEl.innerHTML = '';
      goals.forEach(g => {
        const pct = Math.min(100, Math.round((g.current * 100) / g.target));
        const row = document.createElement('div');
        row.className = 'exp-cat-row';
        row.innerHTML = `
          <div class="exp-cat-row-top">
            <strong>${g.title}</strong>
            <span>${Math.min(g.current, g.target)} / ${g.target} (+${g.xp} XP)</span>
          </div>
          <div class="dash-progress-track"><div class="dash-progress-fill" style="width: ${pct}%;"></div></div>
        `;
        goalsListEl.appendChild(row);
      });

      // Render Recent Achievements
      recentListEl.innerHTML = '';
      if (!unlockedList.length) {
        recentListEl.innerHTML = `<li class="dash-activity-item"><span>Complete a planning step above to unlock your first badge.</span></li>`;
      } else {
        unlockedList.slice().reverse().slice(0, 4).forEach(b => {
          const li = document.createElement('li');
          li.className = 'dash-activity-item';
          li.innerHTML = `
            <span><strong>${b.name}</strong> — ${b.how}</span>
            <span class="ach-xp-pill">+${b.xp} XP</span>
          `;
          recentListEl.appendChild(li);
        });
      }
    }

    if (btnStartTrip) {
      btnStartTrip.addEventListener('click', () => openModal(document.getElementById('modal-create-trip')));
    }

    window.__yatraRenderAchievements = renderAchievements;
    renderAchievements();
  }

  // --- 17. Profile & Settings: Editable Profile, Interests, Budget Pref & Password Change ---
  function initProfileSettings() {
    const formProfile = document.getElementById('form-profile-settings');
    const nameInput = document.getElementById('profile-name');
    const phoneInput = document.getElementById('profile-phone');
    const pacingInput = document.getElementById('profile-pacing');
    const budgetPrefInput = document.getElementById('profile-budget-pref');
    const interestBtns = document.querySelectorAll('#profile-interests-group [data-interest]');
    const profileStatusEl = document.getElementById('profile-save-status');

    const formPassword = document.getElementById('form-change-password');
    const newPassInput = document.getElementById('profile-new-password');
    const confirmPassInput = document.getElementById('profile-confirm-password');
    const passStatusEl = document.getElementById('profile-password-status');

    if (!formProfile || !formPassword) return;

    // Load saved local preferences only in unauthenticated prototype mode
    try {
      const saved = !state.isAuthenticated
        ? JSON.parse(localStorage.getItem('yatrasathi_profile_prefs') || 'null')
        : null;
      if (saved) {
        if (saved.display_name && nameInput) {
          nameInput.value = saved.display_name;
          state.userDisplayName = saved.display_name;
          const sidebarName = document.querySelector('.sidebar-user-name');
          if (sidebarName) sidebarName.textContent = saved.display_name;
        }
        if (saved.phone && phoneInput) phoneInput.value = saved.phone;
        if (saved.pacing && pacingInput) pacingInput.value = saved.pacing;
        if (saved.budgetPref && budgetPrefInput) budgetPrefInput.value = saved.budgetPref;
        if (Array.isArray(saved.interests)) {
          interestBtns.forEach(btn => {
            const active = saved.interests.includes(btn.getAttribute('data-interest'));
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
        }
      }
    } catch (e) {
      // Ignore storage parse error
    }

    interestBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        const nextActive = !btn.classList.contains('active');
        btn.classList.toggle('active', nextActive);
        btn.setAttribute('aria-pressed', nextActive ? 'true' : 'false');
      });
    });

    function showStatus(el, msg, isError) {
      if (!el) return;
      el.textContent = msg;
      el.style.color = isError ? 'var(--color-state-error)' : 'var(--color-state-success)';
      el.style.fontWeight = '700';
    }

    formProfile.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (state.isOffline) {
        showStatus(profileStatusEl, 'Offline Mode: Saving profile changes requires internet connectivity.', true);
        return;
      }

      const displayName = nameInput ? nameInput.value.trim() : '';
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const pacing = pacingInput ? pacingInput.value : 'relaxed';
      const budgetPref = budgetPrefInput ? budgetPrefInput.value : 'balanced';
      const interests = Array.from(interestBtns)
        .filter(b => b.classList.contains('active'))
        .map(b => b.getAttribute('data-interest'));

      if (!displayName || displayName.length < 2) {
        showStatus(profileStatusEl, 'Please enter a valid display name (at least 2 characters).', true);
        if (nameInput) nameInput.focus();
        return;
      }

      if (phone && !/^[+\d\s()-]{8,18}$/.test(phone)) {
        showStatus(profileStatusEl, 'Please enter a valid phone number or leave it blank.', true);
        if (phoneInput) phoneInput.focus();
        return;
      }

      const payload = {
        display_name: displayName,
        preferences: {
          phone: phone || null,
          pacing: pacing,
          budget_preference: budgetPref,
          interests: interests,
          currency: 'INR'
        }
      };

      state.userDisplayName = displayName;
      const sidebarName = document.querySelector('.sidebar-user-name');
      if (sidebarName) sidebarName.textContent = displayName;

      if (state.isAuthenticated) {
        try {
          await apiFetch('/api/workspace/profile', {
            method: 'PUT',
            body: JSON.stringify({ displayName, phone, pacing, budgetPref, interests })
          });
          showStatus(profileStatusEl, 'Profile preferences saved to Cloudflare D1.', false);
          showToast('Profile preferences updated!');
        } catch (err) {
          showStatus(profileStatusEl, err.message || 'Could not save profile to D1.', true);
          return;
        }
      } else {
        try {
          localStorage.setItem('yatrasathi_profile_prefs', JSON.stringify({
            display_name: displayName,
            phone: phone,
            pacing: pacing,
            budgetPref: budgetPref,
            interests: interests
          }));
        } catch (err) {
          // Ignore storage error
        }
        showStatus(profileStatusEl, 'Profile preferences saved locally.', false);
        showToast('Profile preferences updated!');
      }

      if (typeof window.__yatraRenderDashboard === 'function') window.__yatraRenderDashboard();
    });

    const btnLinkGoogle = document.getElementById('btn-link-google');
    if (btnLinkGoogle) {
      btnLinkGoogle.addEventListener('click', async function () {
        if (!state.isAuthenticated || !state.userEmailVerified) {
          showStatus(passStatusEl, 'Google account linking is unavailable until your email is verified.', true);
          return;
        }
        if (state.isOffline) {
          showStatus(passStatusEl, 'Offline Mode: Linking Google requires internet connectivity.', true);
          return;
        }
        btnLinkGoogle.disabled = true;
        try {
          const resp = await fetch(getApiBase() + '/api/auth/link-social', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              provider: 'google',
              callbackURL: '/app.html'
            })
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && data && data.url) {
            window.location.href = data.url;
            return;
          }
          showStatus(passStatusEl, (data && data.message) || 'Could not start Google account linking.', true);
        } catch {
          showStatus(passStatusEl, 'Could not reach Worker auth endpoint.', true);
        } finally {
          btnLinkGoogle.disabled = false;
        }
      });
    }

    formPassword.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (state.isOffline) {
        showStatus(passStatusEl, 'Offline Mode: Updating your password requires internet connectivity.', true);
        return;
      }

      const newPass = newPassInput ? newPassInput.value : '';
      const confirmPass = confirmPassInput ? confirmPassInput.value : '';

      if (newPass.length < 8) {
        showStatus(passStatusEl, 'Password must be at least 8 characters.', true);
        if (newPassInput) newPassInput.focus();
        return;
      }
      if (newPass !== confirmPass) {
        showStatus(passStatusEl, 'Passwords do not match.', true);
        if (confirmPassInput) confirmPassInput.focus();
        return;
      }

      try {
        const currentPass = prompt('Enter your current password to confirm:');
        if (!currentPass) return;
        const resp = await fetch(getApiBase() + '/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass, revokeOtherSessions: true })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.message || data.error || 'Password update failed');
        if (newPassInput) newPassInput.value = '';
        if (confirmPassInput) confirmPassInput.value = '';
        showStatus(passStatusEl, 'Password updated successfully.', false);
        showToast('Password updated!');
      } catch (err) {
        showStatus(passStatusEl, `Password update failed: ${err.message}`, true);
      }
    });

    const deleteConfirmInput = document.getElementById('delete-account-confirm-input');
    const deleteStatusEl = document.getElementById('delete-account-status');
    const btnDeleteAccount = document.getElementById('btn-delete-account');
    if (btnDeleteAccount) {
      btnDeleteAccount.addEventListener('click', async function () {
        if (!state.isAuthenticated) {
          showStatus(deleteStatusEl, 'You must be signed in to delete your account.', true);
          return;
        }
        if (state.isOffline) {
          showStatus(deleteStatusEl, 'Offline Mode: Deleting your account requires internet connectivity.', true);
          return;
        }
        const confirmText = deleteConfirmInput ? deleteConfirmInput.value.trim() : '';
        if (confirmText !== 'DELETE') {
          showStatus(deleteStatusEl, 'Please type DELETE in the confirmation box first.', true);
          if (deleteConfirmInput) deleteConfirmInput.focus();
          return;
        }
        if (!confirm('Permanently delete your YatraSathi account and all trips, itineraries, bookings, expenses, and achievements? This cannot be undone.')) {
          return;
        }

        btnDeleteAccount.disabled = true;
        showStatus(deleteStatusEl, 'Deleting account and revoking active sessions...', false);
        try {
          await apiFetch('/api/workspace/account', {
            method: 'DELETE',
            body: JSON.stringify({ confirmText })
          });
          clearAllUserStorage();
          state.isAuthenticated = false;
          state.userId = null;
          window.location.replace('/index.html?account=deleted');
        } catch (err) {
          showStatus(deleteStatusEl, err.message || 'Could not delete account. Your data was preserved.', true);
          btnDeleteAccount.disabled = false;
        }
      });
    }
  }

  function initTripReviews() {
    const formEl = document.getElementById('form-trip-review');
    const headingEl = document.getElementById('review-form-heading');
    const editIdEl = document.getElementById('review-edit-id');
    const tripSelectEl = document.getElementById('review-trip-select');
    const titleEl = document.getElementById('review-title');
    const locationEl = document.getElementById('review-location');
    const ratingEl = document.getElementById('review-rating');
    const bodyEl = document.getElementById('review-body');
    const photoInput = document.getElementById('review-photo-input');
    const photoPreviewWrap = document.getElementById('review-photo-preview-wrap');
    const photoPreviewImg = document.getElementById('review-photo-preview');
    const removePhotoBtn = document.getElementById('btn-remove-review-photo');
    const statusEl = document.getElementById('review-form-status');
    const submitBtn = document.getElementById('btn-submit-review');
    const cancelEditBtn = document.getElementById('btn-cancel-review-edit');
    const feedEl = document.getElementById('trip-reviews-feed');
    const countBadgeEl = document.getElementById('reviews-count-badge');
    const googleLinkEl = document.getElementById('link-google-review');

    if (!formEl || !feedEl) return;

    const MAX_PHOTO_BYTES = 250 * 1024;
    const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
    let pendingPhotoDataUrl = null;
    let photoTouched = false;

    function setFormStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.color = isError ? 'var(--color-state-error)' : 'var(--color-state-success)';
      statusEl.style.fontWeight = '700';
    }

    function updateGoogleReviewLink() {
      if (!googleLinkEl) return;
      const loc = (locationEl && locationEl.value.trim()) ||
        (state.trips.find(t => t.id === state.activeTripId)?.destination) ||
        'India Travel';
      googleLinkEl.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;
    }

    function syncTripOptions() {
      if (!tripSelectEl) return;
      const cur = tripSelectEl.value;
      tripSelectEl.innerHTML = '<option value="">General Travel Review</option>' +
        (state.trips || []).map(t => `<option value="${escapeHtmlAttr(t.id)}">${escapeHtmlAttr(t.name)} (${escapeHtmlAttr(t.destination)})</option>`).join('');
      if (cur) tripSelectEl.value = cur;
    }

    function resetReviewForm() {
      if (editIdEl) editIdEl.value = '';
      if (headingEl) headingEl.textContent = 'Write a Private Trip Review';
      if (submitBtn) submitBtn.textContent = 'Save Private Review';
      if (cancelEditBtn) cancelEditBtn.style.display = 'none';
      formEl.reset();
      pendingPhotoDataUrl = null;
      photoTouched = false;
      if (photoPreviewWrap) photoPreviewWrap.style.display = 'none';
      if (photoPreviewImg) photoPreviewImg.removeAttribute('src');
      updateGoogleReviewLink();
    }

    if (locationEl) locationEl.addEventListener('input', updateGoogleReviewLink);

    if (photoInput) {
      photoInput.addEventListener('change', function () {
        const file = photoInput.files && photoInput.files[0];
        if (!file) return;
        if (!ALLOWED_MIMES.has(file.type)) {
          setFormStatus('Only JPEG, PNG, or WebP photos are supported. Videos and reels are not supported.', true);
          photoInput.value = '';
          return;
        }
        if (file.size > MAX_PHOTO_BYTES) {
          setFormStatus('Photo must be 250 KB or smaller for free D1 storage.', true);
          photoInput.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          pendingPhotoDataUrl = typeof reader.result === 'string' ? reader.result : null;
          photoTouched = true;
          if (pendingPhotoDataUrl && photoPreviewImg && photoPreviewWrap) {
            photoPreviewImg.src = pendingPhotoDataUrl;
            photoPreviewWrap.style.display = 'block';
          }
          setFormStatus('', false);
        };
        reader.readAsDataURL(file);
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', () => {
        pendingPhotoDataUrl = null;
        photoTouched = true;
        if (photoInput) photoInput.value = '';
        if (photoPreviewWrap) photoPreviewWrap.style.display = 'none';
        if (photoPreviewImg) photoPreviewImg.removeAttribute('src');
      });
    }

    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
        resetReviewForm();
        setFormStatus('', false);
      });
    }

    function renderReviewsFeed() {
      syncTripOptions();
      updateGoogleReviewLink();
      const reviews = Array.isArray(state.reviews) ? state.reviews : [];
      if (countBadgeEl) countBadgeEl.textContent = `${reviews.length} Review${reviews.length === 1 ? '' : 's'}`;

      if (!reviews.length) {
        feedEl.innerHTML = '<div class="empty-state-card" style="padding: var(--space-lg);"><h3 class="empty-state-title">No private reviews yet</h3><p class="empty-state-desc">Write a reflection or memory from your trip on the left. Only your account can see these reviews.</p></div>';
        return;
      }

      feedEl.innerHTML = reviews.map(rev => {
        const stars = '★'.repeat(Math.max(1, Math.min(5, rev.rating || 5))) + '☆'.repeat(5 - Math.max(1, Math.min(5, rev.rating || 5)));
        const dateStr = rev.createdAt ? new Date(rev.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent';
        const linkedTrip = rev.tripId ? (state.trips.find(t => t.id === rev.tripId)?.name || '') : '';
        return `
          <article class="widget-card" data-review-id="${escapeHtmlAttr(rev.id)}" style="padding: 16px; border: 1px solid var(--color-border-subtle); box-shadow: none;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-bottom: 8px;">
              <div>
                <h3 style="font-size: 1rem; margin: 0 0 4px;">${escapeHtmlAttr(rev.title)}</h3>
                <div style="font-size: 0.75rem; color: var(--color-text-muted);">
                  ${rev.location ? `${escapeHtmlAttr(rev.location)} • ` : ''}${linkedTrip ? `${escapeHtmlAttr(linkedTrip)} • ` : ''}${dateStr}
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="badge badge-teal" style="font-size: 0.6875rem;">Private</span>
                <span style="color: var(--color-brand-saffron); font-weight: 700; letter-spacing: 1px;" aria-label="Rated ${rev.rating} out of 5">${stars}</span>
              </div>
            </div>
            <p style="font-size: 0.875rem; color: var(--color-text-secondary); line-height: 1.55; margin: 0 0 12px; white-space: pre-wrap;">${escapeHtmlAttr(rev.body)}</p>
            ${rev.photoDataUrl ? `<img src="${escapeHtmlAttr(rev.photoDataUrl)}" alt="Trip review attachment" style="width: 100%; max-height: 260px; object-fit: cover; border-radius: var(--radius-sm); margin-bottom: 12px; border: 1px solid var(--color-border-subtle);">` : ''}
            <div style="display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--color-border-subtle); padding-top: 10px;">
              <button type="button" class="btn btn-secondary btn-edit-review" style="min-height: 34px; padding: 4px 12px; font-size: 0.8125rem;">Edit</button>
              <button type="button" class="btn btn-secondary btn-delete-review" style="min-height: 34px; padding: 4px 12px; font-size: 0.8125rem; color: var(--color-state-error); border-color: var(--color-state-error);">Delete</button>
            </div>
          </article>
        `;
      }).join('');
    }

    window.__yatraRenderReviews = renderReviewsFeed;

    feedEl.addEventListener('click', async function (e) {
      const card = e.target.closest('[data-review-id]');
      if (!card) return;
      const reviewId = card.getAttribute('data-review-id');
      const rev = (state.reviews || []).find(r => r.id === reviewId);
      if (!rev) return;

      if (e.target.closest('.btn-edit-review')) {
        if (editIdEl) editIdEl.value = rev.id;
        if (headingEl) headingEl.textContent = 'Edit Private Trip Review';
        if (submitBtn) submitBtn.textContent = 'Update Private Review';
        if (cancelEditBtn) cancelEditBtn.style.display = 'inline-flex';
        if (tripSelectEl) tripSelectEl.value = rev.tripId || '';
        if (titleEl) titleEl.value = rev.title || '';
        if (locationEl) locationEl.value = rev.location || '';
        if (ratingEl) ratingEl.value = String(rev.rating || 5);
        if (bodyEl) bodyEl.value = rev.body || '';
        pendingPhotoDataUrl = rev.photoDataUrl || null;
        photoTouched = false;
        if (rev.photoDataUrl && photoPreviewImg && photoPreviewWrap) {
          photoPreviewImg.src = rev.photoDataUrl;
          photoPreviewWrap.style.display = 'block';
        } else if (photoPreviewWrap) {
          photoPreviewWrap.style.display = 'none';
        }
        updateGoogleReviewLink();
        if (titleEl) titleEl.focus();
        return;
      }

      if (e.target.closest('.btn-delete-review')) {
        if (!confirm('Delete this private trip review permanently?')) return;
        if (state.isAuthenticated) {
          try {
            await apiFetch(`/api/workspace/reviews/${encodeURIComponent(reviewId)}`, { method: 'DELETE' });
          } catch (err) {
            setFormStatus(err.message || 'Could not delete review.', true);
            return;
          }
        }
        state.reviews = (state.reviews || []).filter(r => r.id !== reviewId);
        renderReviewsFeed();
        showToast('Private trip review deleted.');
      }
    });

    formEl.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (state.isOffline) {
        setFormStatus('Offline Mode: Saving trip reviews requires internet connectivity.', true);
        return;
      }
      const editId = editIdEl ? editIdEl.value.trim() : '';
      const title = titleEl ? titleEl.value.trim() : '';
      const location = locationEl ? locationEl.value.trim() : '';
      const rating = ratingEl ? parseInt(ratingEl.value, 10) : 5;
      const body = bodyEl ? bodyEl.value.trim() : '';
      const tripId = tripSelectEl && tripSelectEl.value ? tripSelectEl.value : null;

      if (!title || !body) {
        setFormStatus('Please enter a review title and review notes.', true);
        return;
      }

      if (editId) {
        const payload = { title, location, rating, body };
        if (photoTouched) payload.photoDataUrl = pendingPhotoDataUrl;
        if (state.isAuthenticated) {
          try {
            const res = await apiFetch(`/api/workspace/reviews/${encodeURIComponent(editId)}`, {
              method: 'PATCH',
              body: JSON.stringify(payload)
            });
            state.reviews = (state.reviews || []).map(r => (r.id === editId ? res.review : r));
          } catch (err) {
            setFormStatus(err.message || 'Could not update review.', true);
            return;
          }
        }
        resetReviewForm();
        renderReviewsFeed();
        setFormStatus('Private review updated.', false);
        showToast('Trip review updated!');
        return;
      }

      if (state.isAuthenticated) {
        try {
          const res = await apiFetch('/api/workspace/reviews', {
            method: 'POST',
            body: JSON.stringify({ tripId, title, location, rating, body, photoDataUrl: pendingPhotoDataUrl })
          });
          state.reviews = [res.review, ...(state.reviews || [])];
        } catch (err) {
          setFormStatus(err.message || 'Could not save review.', true);
          return;
        }
      } else {
        state.reviews = [{
          id: `rev-${Date.now()}`,
          tripId,
          title,
          location,
          rating,
          body,
          photoDataUrl: pendingPhotoDataUrl,
          visibility: 'private',
          createdAt: Date.now()
        }, ...(state.reviews || [])];
      }

      resetReviewForm();
      renderReviewsFeed();
      setFormStatus('Private review saved to D1.', false);
      showToast('Private trip review saved!');
    });

    renderReviewsFeed();
  }

  // --- 18. App Bootstrapping ---
  document.addEventListener('DOMContentLoaded', function () {
    initNavigation();
    initTripCardClicks();
    initModals();
    initInteractiveFeatures();
    initSimulator();
    initWorkerSessionBridge();
    initItineraryRoutePlanner();
    initDashboard();
    initExploreIndiaExplorer();
    initMyTripsManager();
    initMapsAndRoutesSection();
    initBookingsCatalogue();
    initExpensesLedger();
    initAchievementsTracker();
    initProfileSettings();
    initTripReviews();
    syncActiveTripUI('trip-1');
    if (typeof window.__yatraRenderDashboard === 'function') window.__yatraRenderDashboard();
  });
})();
