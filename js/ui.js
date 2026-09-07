/* ═══════════════════════════════════════════════════════
   NavDR — UI Module
   Map, Charts, Telemetry, Timeline, Notifications
   ═══════════════════════════════════════════════════════ */

// ════════════════════════════════════════════════════
// MAP MODULE (Leaflet)
// ════════════════════════════════════════════════════

NavDR.Map = {
  map: null,
  vehicleMarker: null,
  referenceRouteOutline: null,
  referenceRouteLine: null,
  gnssZoneLine: null,
  gnssZoneOverlay: null,
  referenceTrailLine: null,
  drTrailOutline: null,
  drTrailLine: null,
  fusedTrailOutline: null,
  fusedTrailLine: null,
  mapMatchedTrailLine: null,
  correctionLine: null,
  startMarker: null,
  endMarker: null,
  entryMarker: null,
  exitMarker: null,
  gnssZoneLabel: null,
  _vehicleHeading: 0,

  /**
   * Initialize the Leaflet map and draw the route.
   */
  initialize() {
    // Create map centered on route
    const routeLatLngs = NavDR.Route.getLatLngs();
    const center = routeLatLngs[Math.floor(routeLatLngs.length / 2)];

    this.map = L.map("map", {
      center: center,
      zoom: 15,
      zoomControl: true,
      attributionControl: true,
    });

    // OpenStreetMap tile layer (Free public tiles, no API key required)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);

    // ── Custom Leaflet Panes to enforce z-index layer ordering ──
    this.map.createPane("gnssZonePane");
    this.map.getPane("gnssZonePane").style.zIndex = "400";

    this.map.createPane("refRouteOutlinePane");
    this.map.getPane("refRouteOutlinePane").style.zIndex = "440";

    this.map.createPane("refRoutePane");
    this.map.getPane("refRoutePane").style.zIndex = "450";

    this.map.createPane("drTrailOutlinePane");
    this.map.getPane("drTrailOutlinePane").style.zIndex = "490";

    this.map.createPane("drTrailPane");
    this.map.getPane("drTrailPane").style.zIndex = "500";

    this.map.createPane("fusedTrailOutlinePane");
    this.map.getPane("fusedTrailOutlinePane").style.zIndex = "540";

    this.map.createPane("fusedTrailPane");
    this.map.getPane("fusedTrailPane").style.zIndex = "550";

    this.map.createPane("markerPaneCustom");
    this.map.getPane("markerPaneCustom").style.zIndex = "600";

    // ── GNSS Denied Zone Overlay ──
    const zoneBounds = NavDR.Route.getGNSSZoneBounds();
    this.gnssZoneOverlay = L.polygon(zoneBounds, {
      color: "#dc2626",
      weight: 3,
      opacity: 0.9,
      fillColor: "#ef4444",
      fillOpacity: 0.25,
      dashArray: "8, 6",
      pane: "gnssZonePane",
    }).addTo(this.map);

    // ── Reference Route Lines (Outline Halo + Main Bright Line) ──
    this.referenceRouteOutline = L.polyline(routeLatLngs, {
      color: "#0f172a",
      weight: 10,
      opacity: 0.8,
      lineCap: "round",
      lineJoin: "round",
      pane: "refRouteOutlinePane",
    }).addTo(this.map);

    this.referenceRouteLine = L.polyline(routeLatLngs, {
      color: "#0284c7",
      weight: 6,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
      pane: "refRoutePane",
    }).addTo(this.map);

    // ── GNSS Denied Zone Route Highlight ──
    const zoneLatLngs = NavDR.Route.getGNSSZoneRouteLatLngs();
    this.gnssZoneLine = L.polyline(zoneLatLngs, {
      color: "#ef4444",
      weight: 7,
      opacity: 0.9,
      lineCap: "round",
      pane: "refRoutePane",
    }).addTo(this.map);

    // ── Zone Entry & Exit Boundary Markers ──
    const entryPt = zoneLatLngs[0];
    const exitPt = zoneLatLngs[zoneLatLngs.length - 1];

    this.entryMarker = L.marker(entryPt, {
      icon: L.divIcon({
        className: "boundary-marker-entry",
        html: "🔴 GNSS LOSS",
        iconSize: [95, 20],
        iconAnchor: [47, 24],
      }),
      pane: "markerPaneCustom",
    }).addTo(this.map);

    this.exitMarker = L.marker(exitPt, {
      icon: L.divIcon({
        className: "boundary-marker-exit",
        html: "🟢 GNSS RECOVERY",
        iconSize: [110, 20],
        iconAnchor: [55, -8],
      }),
      pane: "markerPaneCustom",
    }).addTo(this.map);

    // ── Zone Center Prominent Label ──
    const zoneMid = zoneLatLngs[Math.floor(zoneLatLngs.length / 2)];
    this.gnssZoneLabel = L.marker(zoneMid, {
      icon: L.divIcon({
        className: "gnss-zone-center-label",
        html: '<div class="zone-label-title">SIMULATED OUTAGE ZONE</div><div class="zone-label-sub">SCENARIO FIXTURE</div>',
        iconSize: [220, 36],
        iconAnchor: [110, 18],
      }),
      pane: "markerPaneCustom",
    }).addTo(this.map);

    // ── Start & End Markers ──
    const startPt = routeLatLngs[0];
    const endPt = routeLatLngs[routeLatLngs.length - 1];

    this.startMarker = L.marker(startPt, {
      icon: L.divIcon({
        className: "start-label",
        html: "🟢 START",
        iconSize: [64, 20],
        iconAnchor: [32, 24],
      }),
      pane: "markerPaneCustom",
    }).addTo(this.map);

    this.endMarker = L.marker(endPt, {
      icon: L.divIcon({
        className: "end-label",
        html: "🏁 END",
        iconSize: [54, 20],
        iconAnchor: [27, 24],
      }),
      pane: "markerPaneCustom",
    }).addTo(this.map);

    // ── Dead Reckoning Trajectory (Outline Halo + Dashed Line) ──
    this.drTrailOutline = L.polyline([], {
      color: "#450a0a",
      weight: 8,
      opacity: 0.6,
      dashArray: "8, 6",
      lineCap: "round",
      pane: "drTrailOutlinePane",
    }).addTo(this.map);

    this.drTrailLine = L.polyline([], {
      color: "#ef4444",
      weight: 5,
      opacity: 0.95,
      dashArray: "8, 6",
      lineCap: "round",
      pane: "drTrailPane",
    }).addTo(this.map);

    // ── Fused / AI-Corrected Trajectory (Outline Halo + Solid Line) ──
    this.fusedTrailOutline = L.polyline([], {
      color: "#064e3b",
      weight: 8,
      opacity: 0.6,
      lineCap: "round",
      pane: "fusedTrailOutlinePane",
    }).addTo(this.map);

    this.fusedTrailLine = L.polyline([], {
      color: "#10b981",
      weight: 5,
      opacity: 0.95,
      lineCap: "round",
      pane: "fusedTrailPane",
    }).addTo(this.map);

    // ── Map-Matched Trajectory Line ──
    this.mapMatchedTrailLine = L.polyline([], {
      color: "#38bdf8",
      weight: 4,
      opacity: 0.95,
      dashArray: "3, 5",
      lineCap: "round",
      pane: "fusedTrailPane",
    }).addTo(this.map);

    // ── Vehicle Marker ──
    const vehicleSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
            <polygon points="14,2 25,24 14,19 3,24" fill="#06b6d4" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>`;

    this.vehicleMarker = L.marker(startPt, {
      icon: L.divIcon({
        className: "vehicle-marker-icon",
        html: `<div class="vehicle-arrow" id="vehicle-arrow">${vehicleSvg}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      pane: "markerPaneCustom",
      zIndexOffset: 2000,
    }).addTo(this.map);

    // Refit after a responsive breakpoint changes the map's available size.
    if(typeof ResizeObserver!=='undefined') {
      this.resizeObserver=new ResizeObserver(()=>{
        this.map.invalidateSize({animate:false});
        if(!NavDR.Workbench || NavDR.Workbench.source==='simulation')
          this.map.fitBounds(this.referenceRouteLine.getBounds().pad(0.12),{animate:false,maxZoom:17});
      });
      this.resizeObserver.observe(document.getElementById('map'));
    }

    // Fit map to full route with padding
    if (
      this.referenceRouteLine &&
      typeof this.referenceRouteLine.getBounds === "function"
    ) {
      const bounds = this.referenceRouteLine.getBounds();
      if (bounds && typeof bounds.pad === "function") {
        this.map.fitBounds(bounds.pad(0.12));
      }
    }
  },

  /**
   * Update vehicle position and heading on map.
   */
  updateVehicle(lat, lng, headingRad) {
    if (this.vehicleMarker) {
      this.vehicleMarker.setLatLng([lat, lng]);
    }
    this._vehicleHeading = headingRad;

    const arrow = document.getElementById("vehicle-arrow");
    if (arrow) {
      const deg = NavDR.Geo.bearingToDegrees(headingRad);
      arrow.style.transform = `rotate(${deg}deg)`;
    }
  },

  /**
   * Update GNSS Outage Status Banner
   */
  setGnssStatus(status) {
    const banner = document.getElementById("gnss-status-banner");
    const bannerText = document.getElementById("gnss-banner-text");

    if (!banner || !bannerText) return;

    if (status === "ready") {
      banner.className = "gnss-banner";
      bannerText.textContent = "Ready to start";
    } else if (status === "available" || status === "AVAILABLE") {
      banner.className = "gnss-banner available";
      bannerText.textContent = "GNSS AVAILABLE";
    } else if (status === "lost" || status === "LOST") {
      banner.className = "gnss-banner lost";
      bannerText.textContent = "GNSS lost; inertial navigation active";
    } else if (status === "recovery" || status === "RECOVERY") {
      banner.className = "gnss-banner recovery";
      bannerText.textContent = "GNSS restored; checking innovations";
    }
  },

  /**
   * Add a point to the reference trajectory trail.
   */
  addReferenceTrailPoint(lat, lng) {
    // Reserved for reference track
  },

  /**
   * Add a point to the dead reckoning trajectory trail.
   */
  addDRTrailPoint(lat, lng) {
    if (this.drTrailOutline) this.drTrailOutline.addLatLng([lat, lng]);
    if (this.drTrailLine) this.drTrailLine.addLatLng([lat, lng]);
  },

  /**
   * Add a point to the fused trajectory trail.
   */
  addFusedTrailPoint(lat, lng) {
    if (this.fusedTrailOutline) this.fusedTrailOutline.addLatLng([lat, lng]);
    if (this.fusedTrailLine) this.fusedTrailLine.addLatLng([lat, lng]);
  },

  /**
   * Step 5: Add a point to the map-matched trajectory trail.
   */
  addMapMatchedTrailPoint(lat, lng) {
    if (this.mapMatchedTrailLine) {
      this.mapMatchedTrailLine.addLatLng([lat, lng]);
    }
  },

  /**
   * Step 5: Update correction line between raw DR and map-matched position
   */
  updateCorrectionLine(rawLat, rawLng, matchedLat, matchedLng) {
    if (this.correctionLine) {
      if (rawLat && rawLng && matchedLat && matchedLng) {
        this.correctionLine.setLatLngs([
          [rawLat, rawLng],
          [matchedLat, matchedLng],
        ]);
      } else {
        this.correctionLine.setLatLngs([]);
      }
    }
  },

  /**
   * Clear correction line
   */
  clearCorrectionLine() {
    if (this.correctionLine) {
      this.correctionLine.setLatLngs([]);
    }
  },

  /**
   * Center map on a position.
   */
  panTo(lat, lng) {
    if (this.map) this.map.panTo([lat, lng], { animate: true, duration: 0.3 });
  },

  /**
   * Clear all trajectory trails.
   */
  clearTrails() {
    if (this.referenceTrailLine) this.referenceTrailLine.setLatLngs([]);
    if (this.drTrailOutline) this.drTrailOutline.setLatLngs([]);
    if (this.drTrailLine) this.drTrailLine.setLatLngs([]);
    if (this.fusedTrailOutline) this.fusedTrailOutline.setLatLngs([]);
    if (this.fusedTrailLine) this.fusedTrailLine.setLatLngs([]);
    if (this.mapMatchedTrailLine) this.mapMatchedTrailLine.setLatLngs([]);
    this.clearCorrectionLine();
  },

  /**
   * Reset map to initial state.
   */
  reset() {
    this.clearTrails();
    const startPt = NavDR.Route.getLatLngs()[0];
    if (startPt) {
      this.updateVehicle(startPt[0], startPt[1], 0);
    }
    this.setGnssStatus("available");
    if (
      this.map &&
      this.referenceRouteLine &&
      typeof this.referenceRouteLine.getBounds === "function"
    ) {
      const bounds = this.referenceRouteLine.getBounds();
      if (bounds && typeof bounds.pad === "function") {
        this.map.fitBounds(bounds.pad(0.12));
      }
    }
  },
};

// ════════════════════════════════════════════════════
// CHARTS MODULE (Chart.js)
// ════════════════════════════════════════════════════

NavDR.Telemetry = {
  _put(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },
  setGNSSStatus(available) {
    this._put(
      "header-gnss-text",
      available ? "GNSS available" : "GNSS unavailable",
    );
  },
  setNavMode(mode) {
    this._put("header-mode-badge", mode);
  },
  setSpeed(kmh) {
    this._put(
      "telem-speed",
      Number.isFinite(kmh) ? kmh.toFixed(1) + " km/h" : "Unavailable",
    );
  },
  setPosition(lat, lon) {
    this._put("telem-lat", lat.toFixed(6) + "°");
    this._put("telem-lng", lon.toFixed(6) + "°");
  },
  setHeading(degrees) {
    this._put(
      "telem-heading",
      (((degrees % 360) + 360) % 360).toFixed(1) + "°",
    );
  },
  setError(metres) {
    this._put(
      "telem-error",
      Number.isFinite(metres) ? metres.toFixed(1) + " m" : "Unavailable",
    );
  },
  setDistance(metres) {
    this._put(
      "telem-distance",
      Number.isFinite(metres) ? metres.toFixed(1) + " m" : "Unavailable",
    );
  },
  reset() {
    for (const key of ["lat", "lng", "speed", "heading", "error", "distance"])
      this._put("telem-" + key, "—");
  },
};

// NOTIFICATION MODULE
// Toast notifications for GNSS events.
// ════════════════════════════════════════════════════

NavDR.Notifications = {
  _timeout: null,

  /**
   * Show a notification toast.
   * @param {string} message - Notification text
   * @param {string} type - 'warning', 'success', or 'info'
   * @param {number} duration - Auto-hide delay in ms
   */
  show(message, type, duration = 4000) {
    const el = document.getElementById("notification");
    const iconEl = document.getElementById("notification-icon");
    const textEl = document.getElementById("notification-text");

    if (this._timeout) clearTimeout(this._timeout);

    const icons = { warning: "⚠️", success: "✅", info: "ℹ️" };
    iconEl.textContent = icons[type] || "ℹ️";
    textEl.textContent = message;
    el.className = "notification " + type;

    this._timeout = setTimeout(() => {
      el.classList.add("hidden");
    }, duration);
  },

  /**
   * Hide the notification immediately.
   */
  hide() {
    document.getElementById("notification").classList.add("hidden");
    if (this._timeout) clearTimeout(this._timeout);
  },
};

// ════════════════════════════════════════════════════
// TIMELINE MODULE
// Visualizes the GNSS outage phases.
// ════════════════════════════════════════════════════
