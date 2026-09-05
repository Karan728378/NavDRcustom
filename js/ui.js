/* ═══════════════════════════════════════════════════════
   IDRN — UI Module
   Map, Charts, Telemetry, Timeline, Notifications
   ═══════════════════════════════════════════════════════ */

// ════════════════════════════════════════════════════
// MAP MODULE (Leaflet)
// ════════════════════════════════════════════════════

IDRN.Map = {
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
        const routeLatLngs = IDRN.Route.getLatLngs();
        const center = routeLatLngs[Math.floor(routeLatLngs.length / 2)];

        this.map = L.map('map', {
            center: center,
            zoom: 15,
            zoomControl: true,
            attributionControl: true,
        });

        // OpenStreetMap tile layer (Free public tiles, no API key required)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(this.map);

        // ── Custom Leaflet Panes to enforce z-index layer ordering ──
        this.map.createPane('gnssZonePane');
        this.map.getPane('gnssZonePane').style.zIndex = '400';

        this.map.createPane('refRouteOutlinePane');
        this.map.getPane('refRouteOutlinePane').style.zIndex = '440';

        this.map.createPane('refRoutePane');
        this.map.getPane('refRoutePane').style.zIndex = '450';

        this.map.createPane('drTrailOutlinePane');
        this.map.getPane('drTrailOutlinePane').style.zIndex = '490';

        this.map.createPane('drTrailPane');
        this.map.getPane('drTrailPane').style.zIndex = '500';

        this.map.createPane('fusedTrailOutlinePane');
        this.map.getPane('fusedTrailOutlinePane').style.zIndex = '540';

        this.map.createPane('fusedTrailPane');
        this.map.getPane('fusedTrailPane').style.zIndex = '550';

        this.map.createPane('markerPaneCustom');
        this.map.getPane('markerPaneCustom').style.zIndex = '600';

        // ── GNSS Denied Zone Overlay ──
        const zoneBounds = IDRN.Route.getGNSSZoneBounds();
        this.gnssZoneOverlay = L.polygon(zoneBounds, {
            color: '#dc2626',
            weight: 3,
            opacity: 0.9,
            fillColor: '#ef4444',
            fillOpacity: 0.25,
            dashArray: '8, 6',
            pane: 'gnssZonePane'
        }).addTo(this.map);

        // ── Reference Route Lines (Outline Halo + Main Bright Line) ──
        this.referenceRouteOutline = L.polyline(routeLatLngs, {
            color: '#0f172a',
            weight: 10,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
            pane: 'refRouteOutlinePane'
        }).addTo(this.map);

        this.referenceRouteLine = L.polyline(routeLatLngs, {
            color: '#0284c7',
            weight: 6,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
            pane: 'refRoutePane'
        }).addTo(this.map);

        // ── GNSS Denied Zone Route Highlight ──
        const zoneLatLngs = IDRN.Route.getGNSSZoneRouteLatLngs();
        this.gnssZoneLine = L.polyline(zoneLatLngs, {
            color: '#ef4444',
            weight: 7,
            opacity: 0.9,
            lineCap: 'round',
            pane: 'refRoutePane'
        }).addTo(this.map);

        // ── Zone Entry & Exit Boundary Markers ──
        const entryPt = zoneLatLngs[0];
        const exitPt = zoneLatLngs[zoneLatLngs.length - 1];

        this.entryMarker = L.marker(entryPt, {
            icon: L.divIcon({
                className: 'boundary-marker-entry',
                html: '🔴 GNSS LOSS',
                iconSize: [95, 20],
                iconAnchor: [47, 24]
            }),
            pane: 'markerPaneCustom'
        }).addTo(this.map);

        this.exitMarker = L.marker(exitPt, {
            icon: L.divIcon({
                className: 'boundary-marker-exit',
                html: '🟢 GNSS RECOVERY',
                iconSize: [110, 20],
                iconAnchor: [55, -8]
            }),
            pane: 'markerPaneCustom'
        }).addTo(this.map);

        // ── Zone Center Prominent Label ──
        const zoneMid = zoneLatLngs[Math.floor(zoneLatLngs.length / 2)];
        this.gnssZoneLabel = L.marker(zoneMid, {
            icon: L.divIcon({
                className: 'gnss-zone-center-label',
                html: '<div class="zone-label-title">GNSS SIGNAL LOST</div><div class="zone-label-sub">NAVIGATION CONTINUES USING IMU + INS</div>',
                iconSize: [220, 36],
                iconAnchor: [110, 18],
            }),
            pane: 'markerPaneCustom'
        }).addTo(this.map);

        // ── Start & End Markers ──
        const startPt = routeLatLngs[0];
        const endPt = routeLatLngs[routeLatLngs.length - 1];

        this.startMarker = L.marker(startPt, {
            icon: L.divIcon({
                className: 'start-label',
                html: '🟢 START',
                iconSize: [64, 20],
                iconAnchor: [32, 24],
            }),
            pane: 'markerPaneCustom'
        }).addTo(this.map);

        this.endMarker = L.marker(endPt, {
            icon: L.divIcon({
                className: 'end-label',
                html: '🏁 END',
                iconSize: [54, 20],
                iconAnchor: [27, 24],
            }),
            pane: 'markerPaneCustom'
        }).addTo(this.map);

        // ── Dead Reckoning Trajectory (Outline Halo + Dashed Line) ──
        this.drTrailOutline = L.polyline([], {
            color: '#450a0a',
            weight: 8,
            opacity: 0.6,
            dashArray: '8, 6',
            lineCap: 'round',
            pane: 'drTrailOutlinePane'
        }).addTo(this.map);

        this.drTrailLine = L.polyline([], {
            color: '#ef4444',
            weight: 5,
            opacity: 0.95,
            dashArray: '8, 6',
            lineCap: 'round',
            pane: 'drTrailPane'
        }).addTo(this.map);

        // ── Fused / AI-Corrected Trajectory (Outline Halo + Solid Line) ──
        this.fusedTrailOutline = L.polyline([], {
            color: '#064e3b',
            weight: 8,
            opacity: 0.6,
            lineCap: 'round',
            pane: 'fusedTrailOutlinePane'
        }).addTo(this.map);

        this.fusedTrailLine = L.polyline([], {
            color: '#10b981',
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            pane: 'fusedTrailPane'
        }).addTo(this.map);

        // ── Map-Matched Trajectory Line ──
        this.mapMatchedTrailLine = L.polyline([], {
            color: '#38bdf8',
            weight: 4,
            opacity: 0.95,
            dashArray: '3, 5',
            lineCap: 'round',
            pane: 'fusedTrailPane'
        }).addTo(this.map);

        // ── Vehicle Marker ──
        const vehicleSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
            <polygon points="14,2 25,24 14,19 3,24" fill="#06b6d4" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>`;

        this.vehicleMarker = L.marker(startPt, {
            icon: L.divIcon({
                className: 'vehicle-marker-icon',
                html: `<div class="vehicle-arrow" id="vehicle-arrow">${vehicleSvg}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            }),
            pane: 'markerPaneCustom',
            zIndexOffset: 2000,
        }).addTo(this.map);

        // Fit map to full route with padding
        if (this.referenceRouteLine && typeof this.referenceRouteLine.getBounds === 'function') {
            const bounds = this.referenceRouteLine.getBounds();
            if (bounds && typeof bounds.pad === 'function') {
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

        const arrow = document.getElementById('vehicle-arrow');
        if (arrow) {
            const deg = IDRN.Geo.bearingToDegrees(headingRad);
            arrow.style.transform = `rotate(${deg}deg)`;
        }
    },

    /**
     * Update GNSS Outage Status Banner
     */
    setGnssStatus(status) {
        const banner = document.getElementById('gnss-status-banner');
        const bannerText = document.getElementById('gnss-banner-text');

        if (!banner || !bannerText) return;

        if (status === 'available' || status === 'AVAILABLE') {
            banner.className = 'gnss-banner available';
            bannerText.textContent = 'GNSS AVAILABLE';
        } else if (status === 'lost' || status === 'LOST') {
            banner.className = 'gnss-banner lost';
            bannerText.textContent = 'GNSS SIGNAL LOST ● NAVIGATION CONTINUES';
        } else if (status === 'recovery' || status === 'RECOVERY') {
            banner.className = 'gnss-banner recovery';
            bannerText.textContent = 'GNSS RESTORED ● FUSION RECOVERY ACTIVE';
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
                this.correctionLine.setLatLngs([[rawLat, rawLng], [matchedLat, matchedLng]]);
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
        const startPt = IDRN.Route.getLatLngs()[0];
        if (startPt) {
            this.updateVehicle(startPt[0], startPt[1], 0);
        }
        this.setGnssStatus('available');
        if (this.map && this.referenceRouteLine && typeof this.referenceRouteLine.getBounds === 'function') {
            const bounds = this.referenceRouteLine.getBounds();
            if (bounds && typeof bounds.pad === 'function') {
                this.map.fitBounds(bounds.pad(0.12));
            }
        }
    }
};


// ════════════════════════════════════════════════════
// CHARTS MODULE (Chart.js)
// ════════════════════════════════════════════════════

IDRN.Charts = {
    speedChart: null,
    errorChart: null,
    accelChart: null,
    gyroChart: null,
    rawAccelChart: null,
    rawGyroChart: null,
    drSpeedChart: null,
    drDriftChart: null,
    drHeadingChart: null,
    _tickCount: 0,

    /**
     * Initialize all real-time charts including Step 4 DR charts.
     */
    initialize() {
        const maxPts = IDRN.Config.CHART_MAX_POINTS;

        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#94a3b8',
                        font: { size: 9, family: "'Inter', sans-serif" },
                        boxWidth: 10,
                        padding: 6
                    }
                },
                tooltip: { enabled: false },
            },
            scales: {
                x: {
                    display: false,
                    grid: { display: false },
                },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(148, 163, 184, 0.08)',
                        drawBorder: false,
                    },
                    ticks: {
                        color: '#64748b',
                        font: { size: 9, family: "'JetBrains Mono', monospace" },
                        maxTicksLimit: 4,
                    },
                    border: { display: false },
                },
            },
            elements: {
                point: { radius: 0 },
                line: { borderWidth: 1.5, tension: 0.3 },
            },
        };

        const makeDataset = (label, color, fill = true) => ({
            label,
            data: [],
            borderColor: color,
            backgroundColor: fill ? color.replace(')', ', 0.1)').replace('rgb', 'rgba') : 'transparent',
            fill: fill,
        });

        // Speed Chart
        this.speedChart = new Chart(document.getElementById('chart-speed'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [makeDataset('Speed', 'rgb(245, 158, 11)')],
            },
            options: {
                ...commonOptions,
                plugins: { legend: { display: false } },
                scales: {
                    ...commonOptions.scales,
                    y: { ...commonOptions.scales.y, min: 0, suggestedMax: 80 },
                },
            },
        });

        // Error Chart
        this.errorChart = new Chart(document.getElementById('chart-error'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [makeDataset('Error', 'rgb(239, 68, 68)')],
            },
            options: {
                ...commonOptions,
                plugins: { legend: { display: false } },
                scales: {
                    ...commonOptions.scales,
                    y: { ...commonOptions.scales.y, min: 0, suggestedMax: 30 },
                },
            },
        });

        // Accelerometer Chart (Filtered)
        this.accelChart = new Chart(document.getElementById('chart-accel'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [makeDataset('Accel', 'rgb(6, 182, 212)')],
            },
            options: {
                ...commonOptions,
                plugins: { legend: { display: false } },
                scales: {
                    ...commonOptions.scales,
                    y: { ...commonOptions.scales.y, min: 8, suggestedMax: 12 },
                },
            },
        });

        // Gyroscope Chart (Filtered)
        this.gyroChart = new Chart(document.getElementById('chart-gyro'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [makeDataset('Gyro', 'rgb(16, 185, 129)')],
            },
            options: {
                ...commonOptions,
                plugins: { legend: { display: false } },
                scales: {
                    ...commonOptions.scales,
                    y: { ...commonOptions.scales.y, min: 0, suggestedMax: 0.5 },
                },
            },
        });

        // Raw vs Filtered Accelerometer Chart
        const rawAccelEl = document.getElementById('chart-raw-accel');
        if (rawAccelEl) {
            this.rawAccelChart = new Chart(rawAccelEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        { ...makeDataset('Raw Accel', 'rgb(245, 158, 11)', false), borderDash: [3, 3] },
                        makeDataset('Filtered Accel', 'rgb(6, 182, 212)', true),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 7, suggestedMax: 14 },
                    },
                },
            });
        }

        // Raw vs Filtered Gyroscope Chart
        const rawGyroEl = document.getElementById('chart-raw-gyro');
        if (rawGyroEl) {
            this.rawGyroChart = new Chart(rawGyroEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        { ...makeDataset('Raw Gyro', 'rgb(239, 68, 68)', false), borderDash: [3, 3] },
                        makeDataset('Filtered Gyro', 'rgb(16, 185, 129)', true),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 0.6 },
                    },
                },
            });
        }

        // Step 4: DR Speed Chart (Reference Speed vs DR Speed)
        const drSpeedEl = document.getElementById('chart-dr-speed');
        if (drSpeedEl) {
            this.drSpeedChart = new Chart(drSpeedEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('GNSS Speed', 'rgb(245, 158, 11)', false),
                        makeDataset('DR Speed', 'rgb(6, 182, 212)', true),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 80 },
                    },
                },
            });
        }

        // Step 4: DR Position Drift Chart
        const drDriftEl = document.getElementById('chart-dr-drift');
        if (drDriftEl) {
            this.drDriftChart = new Chart(drDriftEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Drift Error (m)', 'rgb(239, 68, 68)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 30 },
                    },
                },
            });
        }

        // Step 4: DR Heading Chart
        const drHeadingEl = document.getElementById('chart-dr-heading');
        if (drHeadingEl) {
            this.drHeadingChart = new Chart(drHeadingEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Heading (°)', 'rgb(16, 185, 129)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, max: 360 },
                    },
                },
            });
        }

        // Step 5: DR Lateral Deviation Chart
        const drLatEl = document.getElementById('chart-dr-lateral');
        if (drLatEl) {
            this.drLateralChart = new Chart(drLatEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Lateral Dev (m)', 'rgb(245, 158, 11)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 20 },
                    },
                },
            });
        }

        // Step 5: Map Matching Correction Chart
        const mapCorrEl = document.getElementById('chart-map-correction');
        if (mapCorrEl) {
            this.mapCorrectionChart = new Chart(mapCorrEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Correction (m)', 'rgb(6, 182, 212)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 15 },
                    },
                },
            });
        }

        // Step 5: Raw DR vs Map-Matched Position Error Chart
        const rawVsMatchedEl = document.getElementById('chart-raw-vs-matched');
        if (rawVsMatchedEl) {
            this.rawVsMatchedChart = new Chart(rawVsMatchedEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('Raw DR Deviation', 'rgb(239, 68, 68)', false),
                        makeDataset('Map-Matched Dev', 'rgb(16, 185, 129)', true),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 25 },
                    },
                },
            });
        }

        // Step 6: Fusion Position Error Chart
        const sfErrEl = document.getElementById('chart-fusion-error');
        if (sfErrEl) {
            this.fusionErrorChart = new Chart(sfErrEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('GNSS Error', 'rgb(16, 185, 129)', false),
                        makeDataset('DR Error', 'rgb(239, 68, 68)', false),
                        makeDataset('Fused Error', 'rgb(168, 85, 247)', true),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 25 },
                    },
                },
            });
        }

        // Step 6: Fusion Confidence Chart
        const sfConfEl = document.getElementById('chart-fusion-conf');
        if (sfConfEl) {
            this.fusionConfChart = new Chart(sfConfEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Confidence Score', 'rgb(168, 85, 247)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, max: 100 },
                    },
                },
            });
        }

        // Step 6: Sensor Weights Chart
        const sfWeightsEl = document.getElementById('chart-sensor-weights');
        if (sfWeightsEl) {
            this.sensorWeightsChart = new Chart(sfWeightsEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('GNSS Weight %', 'rgb(16, 185, 129)', true),
                        makeDataset('INS Weight %', 'rgb(245, 158, 11)', false),
                        makeDataset('Map Weight %', 'rgb(6, 182, 212)', false),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, max: 100 },
                    },
                },
            });
        }

        // Step 6: GNSS Innovation Chart
        const sfInnovEl = document.getElementById('chart-gnss-innovation');
        if (sfInnovEl) {
            this.gnssInnovChart = new Chart(sfInnovEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Innovation (m)', 'rgb(239, 68, 68)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 50 },
                    },
                },
            });
        }

        // Step 7: AI Speed vs Reference Speed Chart
        const aiSpeedEl = document.getElementById('chart-ai-speed');
        if (aiSpeedEl) {
            this.aiSpeedChart = new Chart(aiSpeedEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('AI Estimated (km/h)', 'rgb(236, 72, 153)', true),
                        makeDataset('Ref Speed (km/h)', 'rgb(16, 185, 129)', false),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 80 },
                    },
                },
            });
        }

        // Step 7: Speed Estimation Error Chart
        const aiErrEl = document.getElementById('chart-ai-error');
        if (aiErrEl) {
            this.aiErrorChart = new Chart(aiErrEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Speed Error (m/s)', 'rgb(239, 68, 68)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 10 },
                    },
                },
            });
        }

        // Step 7: AI Model Confidence Chart
        const aiConfEl = document.getElementById('chart-ai-conf');
        if (aiConfEl) {
            this.aiConfChart = new Chart(aiConfEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Confidence Score', 'rgb(236, 72, 153)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, max: 100 },
                    },
                },
            });
        }

        // Step 7: Motion State Timeline Chart
        const aiMotionEl = document.getElementById('chart-ai-motion-state');
        if (aiMotionEl) {
            this.aiMotionChart = new Chart(aiMotionEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Motion State Code', 'rgb(168, 85, 247)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: {
                            ...commonOptions.scales.y,
                            min: 0,
                            max: 5,
                            ticks: {
                                callback: (val) => ['STAT', 'ACCEL', 'CRUISE', 'DECEL', 'ROUGH', 'TURN'][val] || val
                            }
                        },
                    },
                },
            });
        }
        // Step 8: Raw DR Error vs AI Corrected Error Chart
        const driftErrEl = document.getElementById('chart-drift-error');
        if (driftErrEl) {
            this.driftErrorChart = new Chart(driftErrEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('Raw DR Error (m)', 'rgb(239, 68, 68)', true),
                        makeDataset('AI Corrected Error (m)', 'rgb(168, 85, 247)', false),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 30 },
                    },
                },
            });
        }

        // Step 8: Estimated North/East Error Vector Chart
        const driftVecEl = document.getElementById('chart-drift-vector');
        if (driftVecEl) {
            this.driftVectorChart = new Chart(driftVecEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('Est North Error (m)', 'rgb(59, 130, 246)', true),
                        makeDataset('Est East Error (m)', 'rgb(245, 158, 11)', false),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: -25, max: 25 },
                    },
                },
            });
        }

        // Step 8: AI Drift Correction Confidence Chart
        const driftConfEl = document.getElementById('chart-drift-confidence');
        if (driftConfEl) {
            this.driftConfChart = new Chart(driftConfEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Confidence Score', 'rgb(168, 85, 247)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, max: 100 },
                    },
                },
            });
        }

        // Step 8: Applied Correction Magnitude Chart
        const driftCorrEl = document.getElementById('chart-drift-correction');
        if (driftCorrEl) {
            this.driftCorrChart = new Chart(driftCorrEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [makeDataset('Applied Correction (m)', 'rgb(16, 185, 129)', true)],
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 15 },
                    },
                },
            });
        }

        // Step 8: GNSS Outage Duration vs Estimated Error Chart
        const driftOutageEl = document.getElementById('chart-drift-outage');
        if (driftOutageEl) {
            this.driftOutageChart = new Chart(driftOutageEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('Outage Duration (s)', 'rgb(245, 158, 11)', true),
                        makeDataset('Est Error Mag (m)', 'rgb(236, 72, 153)', false),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 40 },
                    },
                },
            });
        }
        // Step 9: Raw DR Error vs AI-Corrected Error Chart (Benchmark)
        const benchErrEl = document.getElementById('chart-benchmark-error');
        if (benchErrEl) {
            this.benchErrorChart = new Chart(benchErrEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('Raw DR Error (m)', 'rgb(239, 68, 68)', true),
                        makeDataset('AI Corrected Error (m)', 'rgb(16, 185, 129)', false),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 50 },
                    },
                },
            });
        }

        // Step 9: Positional Drift (%) vs 10% SIH Target Line Chart
        const benchDriftEl = document.getElementById('chart-benchmark-drift');
        if (benchDriftEl) {
            this.benchDriftChart = new Chart(benchDriftEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('Raw Drift %', 'rgb(245, 158, 11)', true),
                        makeDataset('AI Corrected Drift %', 'rgb(6, 182, 212)', false),
                        { ...makeDataset('10% SIH Target', 'rgb(239, 68, 68)', false), borderDash: [4, 4] }
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 30 },
                    },
                },
            });
        }

        // Step 9: Position Error vs Outage Distance Chart
        const benchDistEl = document.getElementById('chart-benchmark-dist');
        if (benchDistEl) {
            this.benchDistChart = new Chart(benchDistEl, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        makeDataset('Raw Error (m)', 'rgb(239, 68, 68)', true),
                        makeDataset('AI Corrected Error (m)', 'rgb(168, 85, 247)', false),
                    ],
                },
                options: {
                    ...commonOptions,
                    scales: {
                        ...commonOptions.scales,
                        y: { ...commonOptions.scales.y, min: 0, suggestedMax: 50 },
                    },
                },
            });
        }
    },

    /**
     * Push new data to all charts.
     */
    update(speedKmh, errorM, accelMag, gyroMag, rawAccelMag = null, rawGyroMag = null, drState = null, mmState = null, sfState = null, aiState = null, aiDriftState = null, benchState = null) {
        this._tickCount++;
        const maxPts = IDRN.Config.CHART_MAX_POINTS;
        const label = this._tickCount.toString();

        this._pushData(this.speedChart, label, speedKmh, maxPts);
        this._pushData(this.errorChart, label, errorM, maxPts);
        this._pushData(this.accelChart, label, accelMag, maxPts);
        this._pushData(this.gyroChart, label, gyroMag, maxPts);

        if (this.rawAccelChart && rawAccelMag !== null) {
            this._pushMultiData(this.rawAccelChart, label, [rawAccelMag, accelMag], maxPts);
        }

        if (this.rawGyroChart && rawGyroMag !== null) {
            this._pushMultiData(this.rawGyroChart, label, [rawGyroMag, gyroMag], maxPts);
        }

        if (drState) {
            if (this.drSpeedChart) {
                this._pushMultiData(this.drSpeedChart, label, [speedKmh, drState.currentSpeedKmh], maxPts);
            }
            if (this.drDriftChart) {
                this._pushData(this.drDriftChart, label, drState.positionErrorMeters, maxPts);
            }
            if (this.drHeadingChart) {
                this._pushData(this.drHeadingChart, label, drState.heading, maxPts);
            }
        }

        if (mmState) {
            if (this.drLateralChart) {
                this._pushData(this.drLateralChart, label, mmState.lateralDeviationMeters, maxPts);
            }
            if (this.mapCorrectionChart) {
                this._pushData(this.mapCorrectionChart, label, mmState.mapMatchCorrectionMeters, maxPts);
            }
            if (this.rawVsMatchedChart) {
                this._pushMultiData(this.rawVsMatchedChart, label, [mmState.rawDRDeviationMeters, mmState.matchedDeviationMeters], maxPts);
            }
        }

        if (sfState) {
            if (this.fusionErrorChart) {
                this._pushMultiData(this.fusionErrorChart, label, [sfState.gnssDeviationMeters, sfState.rawDRDeviationMeters, sfState.fusedDeviationMeters], maxPts);
            }
            if (this.fusionConfChart) {
                this._pushData(this.fusionConfChart, label, sfState.fusionConfidence, maxPts);
            }
            if (this.sensorWeightsChart) {
                this._pushMultiData(this.sensorWeightsChart, label, [sfState.gnssWeight, sfState.insWeight, sfState.mapWeight], maxPts);
            }
            if (this.gnssInnovChart) {
                this._pushData(this.gnssInnovChart, label, sfState.innovationMeters, maxPts);
            }
        }

        if (aiState) {
            if (this.aiSpeedChart) {
                const aiSpeedKmh = Number.isFinite(aiState.estimatedSpeedKmh)
                    ? aiState.estimatedSpeedKmh
                    : (Number.isFinite(aiState.estimatedSpeedMps) ? parseFloat((aiState.estimatedSpeedMps * 3.6).toFixed(1)) : 0);

                const refSpeedKmh = (aiState.referenceAvailable !== false && Number.isFinite(aiState.referenceSpeedKmh))
                    ? aiState.referenceSpeedKmh
                    : (Number.isFinite(aiState.referenceSpeedMps)
                        ? parseFloat((aiState.referenceSpeedMps * 3.6).toFixed(1))
                        : (Number.isFinite(speedKmh) ? speedKmh : null));

                this._pushMultiData(this.aiSpeedChart, label, [aiSpeedKmh, refSpeedKmh], maxPts);
            }
            if (this.aiErrorChart) {
                const errVal = Number.isFinite(aiState.speedErrorMps) ? aiState.speedErrorMps : 0;
                this._pushData(this.aiErrorChart, label, errVal, maxPts);
            }
            if (this.aiConfChart) {
                const confVal = Number.isFinite(aiState.speedConfidence) ? aiState.speedConfidence : 0;
                this._pushData(this.aiConfChart, label, confVal, maxPts);
            }
            if (this.aiMotionChart) {
                const motionCodes = { 'STATIONARY': 0, 'ACCELERATING': 1, 'CRUISING': 2, 'DECELERATING': 3, 'ROUGH_ROAD': 4, 'TURNING': 5 };
                const code = (aiState.motionState && motionCodes[aiState.motionState] !== undefined) ? motionCodes[aiState.motionState] : 2;
                this._pushData(this.aiMotionChart, label, code, maxPts);
            }
        }

        if (aiDriftState) {
            if (this.driftErrorChart) {
                this._pushMultiData(this.driftErrorChart, label, [aiDriftState.rawDRDeviationMeters, aiDriftState.correctedDeviationMeters], maxPts);
            }
            if (this.driftVectorChart) {
                this._pushMultiData(this.driftVectorChart, label, [aiDriftState.estimatedErrorNorthMeters, aiDriftState.estimatedErrorEastMeters], maxPts);
            }
            if (this.driftConfChart) {
                this._pushData(this.driftConfChart, label, aiDriftState.errorConfidence, maxPts);
            }
            if (this.driftCorrChart) {
                this._pushData(this.driftCorrChart, label, aiDriftState.correctionMagnitudeMeters, maxPts);
            }
            if (this.driftOutageChart) {
                this._pushMultiData(this.driftOutageChart, label, [aiDriftState.outageDurationSeconds, aiDriftState.estimatedErrorMagnitudeMeters], maxPts);
            }
        }

        if (benchState) {
            if (this.benchErrorChart) {
                this._pushMultiData(this.benchErrorChart, label, [benchState.rawErrorMeters, benchState.correctedErrorMeters], maxPts);
            }
            if (this.benchDriftChart) {
                this._pushMultiData(this.benchDriftChart, label, [benchState.rawDriftPercent, benchState.correctedDriftPercent, 10.0], maxPts);
            }
            if (this.benchDistChart) {
                const distLabel = `${benchState.outageDistanceMeters.toFixed(0)}m`;
                this._pushMultiData(this.benchDistChart, distLabel, [benchState.rawErrorMeters, benchState.correctedErrorMeters], maxPts);
            }
        }

        // Batch update all active charts
        [
            this.speedChart, this.errorChart, this.accelChart, this.gyroChart,
            this.rawAccelChart, this.rawGyroChart,
            this.drSpeedChart, this.drDriftChart, this.drHeadingChart,
            this.drLateralChart, this.mapCorrectionChart, this.rawVsMatchedChart,
            this.fusionErrorChart, this.fusionConfChart, this.sensorWeightsChart, this.gnssInnovChart,
            this.aiSpeedChart, this.aiErrorChart, this.aiConfChart, this.aiMotionChart,
            this.driftErrorChart, this.driftVectorChart, this.driftConfChart, this.driftCorrChart, this.driftOutageChart,
            this.benchErrorChart, this.benchDriftChart, this.benchDistChart
        ].forEach(c => c && c.update('none'));
    },

    /**
     * Reset all charts.
     */
    reset() {
        this._tickCount = 0;
        [
            this.speedChart, this.errorChart, this.accelChart, this.gyroChart,
            this.rawAccelChart, this.rawGyroChart,
            this.drSpeedChart, this.drDriftChart, this.drHeadingChart,
            this.drLateralChart, this.mapCorrectionChart, this.rawVsMatchedChart,
            this.fusionErrorChart, this.fusionConfChart, this.sensorWeightsChart, this.gnssInnovChart,
            this.aiSpeedChart, this.aiErrorChart, this.aiConfChart, this.aiMotionChart,
            this.driftErrorChart, this.driftVectorChart, this.driftConfChart, this.driftCorrChart, this.driftOutageChart,
            this.benchErrorChart, this.benchDriftChart, this.benchDistChart
        ].forEach(chart => {
            if (chart) {
                chart.data.labels = [];
                chart.data.datasets.forEach(ds => ds.data = []);
                chart.update('none');
            }
        });
    },

    _pushData(chart, label, value, maxPts) {
        if (!chart) return;
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(value);
        if (chart.data.labels.length > maxPts) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
    },

    _pushMultiData(chart, label, values, maxPts) {
        if (!chart) return;
        chart.data.labels.push(label);
        values.forEach((v, idx) => {
            if (chart.data.datasets[idx]) chart.data.datasets[idx].data.push(v);
        });
        if (chart.data.labels.length > maxPts) {
            chart.data.labels.shift();
            chart.data.datasets.forEach(ds => ds.data.shift());
        }
        chart.update('none');
    }
};


// ════════════════════════════════════════════════════
// TELEMETRY UI MODULE
// Updates all sidebar DOM elements with live data.
// ════════════════════════════════════════════════════

IDRN.Telemetry = {
    /**
     * Update GNSS status display.
     */
    setGNSSStatus(available) {
        const indicator = document.getElementById('gnss-status-indicator');
        const text = document.getElementById('gnss-status-text');
        const card = document.getElementById('card-gnss');
        const headerBadge = document.getElementById('header-gnss-badge');
        const headerText = document.getElementById('header-gnss-text');

        if (available) {
            indicator.className = 'status-indicator active';
            text.textContent = 'GNSS AVAILABLE';
            card.classList.remove('gnss-lost');
            headerBadge.className = 'header-badge gnss-on';
            headerText.textContent = 'GNSS AVAILABLE';
        } else {
            indicator.className = 'status-indicator lost';
            text.textContent = 'GNSS SIGNAL LOST';
            card.classList.add('gnss-lost');
            headerBadge.className = 'header-badge gnss-off';
            headerText.textContent = 'GNSS SIGNAL LOST';
        }
    },

    /**
     * Update navigation mode display.
     */
    setNavMode(mode) {
        const display = document.getElementById('nav-mode-display');
        const headerBadge = document.getElementById('header-mode-badge');
        display.textContent = mode;
        headerBadge.textContent = mode;

        if (mode === 'AI DEAD RECKONING') {
            display.classList.add('dr-mode');
        } else {
            display.classList.remove('dr-mode');
        }
    },

    /**
     * Update speed display.
     */
    setSpeed(kmh) {
        document.getElementById('telem-speed').textContent = kmh.toFixed(1) + ' km/h';
    },

    /**
     * Update position display.
     */
    setPosition(lat, lng) {
        document.getElementById('telem-lat').textContent = lat.toFixed(6) + '°';
        document.getElementById('telem-lng').textContent = lng.toFixed(6) + '°';
    },

    /**
     * Update heading display.
     */
    setHeading(degrees) {
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const idx = Math.round(degrees / 45) % 8;
        document.getElementById('telem-heading').textContent =
            degrees.toFixed(1) + '° ' + dirs[idx];
    },

    /**
     * Update position error display.
     */
    setError(meters) {
        const el = document.getElementById('telem-error');
        el.textContent = meters.toFixed(1) + ' m';

        const row = el.closest('.telem-row');
        if (meters > 10) {
            row.classList.add('error-high');
        } else {
            row.classList.remove('error-high');
        }
    },

    /**
     * Update distance display.
     */
    setDistance(meters) {
        if (meters >= 1000) {
            document.getElementById('telem-distance').textContent =
                (meters / 1000).toFixed(2) + ' km';
        } else {
            document.getElementById('telem-distance').textContent =
                meters.toFixed(0) + ' m';
        }
    },

    /**
     * Update drift display.
     */
    setDrift(meters) {
        document.getElementById('telem-drift').textContent = meters.toFixed(1) + ' m';
    },

    /**
     * Update system health display.
     */
    setHealth(status) {
        const display = document.getElementById('health-display');
        const text = document.getElementById('health-text');
        text.textContent = status;
        if (status === 'WARNING') {
            display.classList.add('warn');
        } else {
            display.classList.remove('warn');
        }
    },

    /**
     * Update IMU sensor monitor values and bars.
     */
    updateIMU(sensors) {
        const a = sensors.accelerometer;
        const g = sensors.gyroscope;
        const m = sensors.magnetometer;

        // Accelerometer
        this._setAxis('accel-x', a.x, 5);
        this._setAxis('accel-y', a.y, 5);
        this._setAxis('accel-z', a.z, 15);

        // Gyroscope
        this._setAxis('gyro-x', g.x, 1);
        this._setAxis('gyro-y', g.y, 1);
        this._setAxis('gyro-z', g.z, 1);

        // Magnetometer
        this._setAxis('mag-x', m.x, 60);
        this._setAxis('mag-y', m.y, 60);
        this._setAxis('mag-z', m.z, 60);
    },

    _setAxis(id, value, maxVal) {
        document.getElementById('val-' + id).textContent = value.toFixed(2);
        // Bar width: map value from [-maxVal, maxVal] to [0%, 100%]
        const pct = Math.min(100, Math.max(0, ((value + maxVal) / (2 * maxVal)) * 100));
        document.getElementById('bar-' + id).style.width = pct + '%';
    },

    /**
     * Reset all telemetry displays.
     */
    reset() {
        this.setGNSSStatus(true);
        this.setNavMode('GNSS + INS');
        this.setSpeed(0);
        document.getElementById('telem-lat').textContent = '—';
        document.getElementById('telem-lng').textContent = '—';
        document.getElementById('telem-heading').textContent = '—';
        this.setError(0);
        this.setDistance(0);
        this.setDrift(0);
        this.setHealth('NORMAL');
    }
};


// ════════════════════════════════════════════════════
// NOTIFICATION MODULE
// Toast notifications for GNSS events.
// ════════════════════════════════════════════════════

IDRN.Notifications = {
    _timeout: null,

    /**
     * Show a notification toast.
     * @param {string} message - Notification text
     * @param {string} type - 'warning', 'success', or 'info'
     * @param {number} duration - Auto-hide delay in ms
     */
    show(message, type, duration = 4000) {
        const el = document.getElementById('notification');
        const iconEl = document.getElementById('notification-icon');
        const textEl = document.getElementById('notification-text');

        if (this._timeout) clearTimeout(this._timeout);

        const icons = { warning: '⚠️', success: '✅', info: 'ℹ️' };
        iconEl.textContent = icons[type] || 'ℹ️';
        textEl.textContent = message;
        el.className = 'notification ' + type;

        this._timeout = setTimeout(() => {
            el.classList.add('hidden');
        }, duration);
    },

    /**
     * Hide the notification immediately.
     */
    hide() {
        document.getElementById('notification').classList.add('hidden');
        if (this._timeout) clearTimeout(this._timeout);
    }
};


// ════════════════════════════════════════════════════
// TIMELINE MODULE
// Visualizes the GNSS outage phases.
// ════════════════════════════════════════════════════

IDRN.Timeline = {
    _currentPhase: 'idle',

    /**
     * Set the active timeline phase.
     * Phases: 'gnss-on', 'gnss-lost', 'dead-reckoning', 'gnss-restored', 'fusion'
     */
    setPhase(phase) {
        this._currentPhase = phase;

        const phases = [
            { id: 'tl-gnss-on',       phase: 'gnss-on' },
            { id: 'tl-gnss-lost',     phase: 'gnss-lost' },
            { id: 'tl-dr',            phase: 'dead-reckoning' },
            { id: 'tl-gnss-restored', phase: 'gnss-restored' },
            { id: 'tl-fusion',        phase: 'fusion' },
        ];

        let found = false;
        for (const p of phases) {
            const el = document.getElementById(p.id);
            if (p.phase === phase) {
                el.className = 'timeline-segment ' + this._getClass(p.phase) + ' active';
                found = true;
            } else if (!found) {
                el.className = 'timeline-segment ' + this._getClass(p.phase) + ' completed';
            } else {
                el.className = 'timeline-segment ' + this._getClass(p.phase);
            }
        }
    },

    /**
     * Reset timeline.
     */
    reset() {
        this._currentPhase = 'idle';
        const ids = ['tl-gnss-on', 'tl-gnss-lost', 'tl-dr', 'tl-gnss-restored', 'tl-fusion'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            // Keep the base class
            const classes = el.className.split(' ').filter(c =>
                c === 'timeline-segment' || c.startsWith('tl-'));
            el.className = classes.join(' ');
        });
    },

    _getClass(phase) {
        const map = {
            'gnss-on': 'tl-on',
            'gnss-lost': 'tl-lost',
            'dead-reckoning': 'tl-dr',
            'gnss-restored': 'tl-restored',
            'fusion': 'tl-fusion',
        };
        return map[phase] || '';
    }
};


// ════════════════════════════════════════════════════
// AI PIPELINE HIGHLIGHT MODULE
// Highlights active steps in the AI/ML Engine sidebar.
// ════════════════════════════════════════════════════

IDRN.PipelineUI = {
    /**
     * Highlight active steps in the AI pipeline.
     * @param {string[]} activeSteps - Array of step data-step values to highlight
     */
    setActiveSteps(activeSteps) {
        const steps = document.querySelectorAll('.pipe-step');
        steps.forEach(step => {
            if (activeSteps.includes(step.dataset.step)) {
                step.classList.add('active-step');
            } else {
                step.classList.remove('active-step');
            }
        });
    },

    /**
     * Reset all steps to inactive.
     */
    reset() {
        document.querySelectorAll('.pipe-step').forEach(s => s.classList.remove('active-step'));
    }
};


// ════════════════════════════════════════════════════
// SENSOR PROCESSING UI MODULE (STEP 3)
// Manages calibration, vibration, shock, quality DOM elements.
// ════════════════════════════════════════════════════

IDRN.SensorProcessingUI = {
    /**
     * Update all Step 3 DOM elements using processed sensor data.
     * @param {Object} data - Output of IDRN.SensorProcessor.getProcessedSensorData()
     */
    update(data) {
        const sp = IDRN.SensorProcessor;

        // 1. Calibration Progress & Status
        const bar = document.getElementById('calib-progress-bar');
        const pctText = document.getElementById('calib-progress-pct');
        const statusText = document.getElementById('calib-status-text');

        if (bar && pctText && statusText) {
            bar.style.width = sp.calibrationProgress + '%';
            pctText.textContent = sp.calibrationProgress + '%';

            if (sp.calibrationStatus === 'CALIBRATING') {
                statusText.textContent = 'Calibrating... Keep Steady';
                statusText.style.color = 'var(--status-amber)';
            } else if (sp.calibrationStatus === 'COMPLETE') {
                statusText.textContent = 'Calibration: Complete';
                statusText.style.color = 'var(--status-green)';
            } else {
                statusText.textContent = 'Calibration: Uninitialized';
                statusText.style.color = 'var(--text-muted)';
            }
        }

        // 2. Calibration Results
        const b = data.bias;
        const resAccel = document.getElementById('res-accel-bias');
        const resGyro = document.getElementById('res-gyro-bias');
        const resMag = document.getElementById('res-mag-offset');
        const resNoise = document.getElementById('res-noise-baseline');

        if (resAccel) resAccel.textContent = `X: ${b.accel.x} | Y: ${b.accel.y} | Z: ${b.accel.z}`;
        if (resGyro) resGyro.textContent = `X: ${b.gyro.x} | Y: ${b.gyro.y} | Z: ${b.gyro.z}`;
        if (resMag) resMag.textContent = `X: ${b.mag.x} | Y: ${b.mag.y} | Z: ${b.mag.z}`;
        if (resNoise) resNoise.textContent = `${b.noiseBaseline} m/s²`;

        // 3. Sensor Quality Score
        const scoreVal = document.getElementById('qs-score-val');
        const scoreBadge = document.getElementById('qs-score-badge');

        if (scoreVal && scoreBadge) {
            scoreVal.textContent = data.sensorQuality;
            scoreBadge.textContent = data.sensorQualityLabel;

            const lbl = data.sensorQualityLabel.toLowerCase();
            scoreBadge.className = `qs-badge ${lbl}`;
            if (lbl === 'good') scoreVal.style.color = 'var(--status-green)';
            else if (lbl === 'fair') scoreVal.style.color = 'var(--status-amber)';
            else scoreVal.style.color = 'var(--status-red)';
        }

        // 4. Vibration Level Indicator
        const vibBadge = document.getElementById('vib-level-badge');
        const vibVal = document.getElementById('vib-intensity-val');

        if (vibBadge && vibVal) {
            vibBadge.textContent = data.vibrationLevel;
            vibBadge.className = `vib-badge ${data.vibrationLevel.toLowerCase()}`;
            vibVal.textContent = `(${data.vibrationIntensity.toFixed(2)} m/s²)`;
        }

        // 5. Road Shock Alert Banner
        const shockBanner = document.getElementById('shock-alert-banner');
        const shockText = document.getElementById('shock-detail-text');

        if (shockBanner) {
            if (data.shockDetected && data.lastShock) {
                shockBanner.classList.remove('hidden');
                console.log('[SensorProcessingUI] Shock alert displayed');
                if (shockText) {
                    shockText.textContent = `Magnitude: ${data.lastShock.magnitude} m/s² | Intensity: ${data.lastShock.intensity} m/s² | Isolated from speed estimation`;
                }
            } else {
                shockBanner.classList.add('hidden');
            }
        }

        // 6. Device Alignment & Vehicle Frame Acceleration
        const o = data.orientation;
        const alignPitch = document.getElementById('align-pitch');
        const alignRoll = document.getElementById('align-roll');
        const alignYaw = document.getElementById('align-yaw');
        const vehAccelVal = document.getElementById('veh-accel-val');

        if (alignPitch) alignPitch.textContent = `${o.pitch}°`;
        if (alignRoll) alignRoll.textContent = `${o.roll}°`;
        if (alignYaw) alignYaw.textContent = `${o.yaw}°`;

        if (vehAccelVal) {
            const v = data.vehicleFrameAcceleration;
            vehAccelVal.textContent = `${v.forward} / ${v.lateral} / ${v.vertical} m/s²`;
        }

        // 7. Processing Status Panel Ticks
        const psCalib = document.getElementById('ps-calib');
        if (psCalib) {
            if (sp.calibrationStatus === 'COMPLETE') {
                psCalib.textContent = '✓ Complete';
                psCalib.className = 'proc-state check';
            } else if (sp.calibrationStatus === 'CALIBRATING') {
                psCalib.textContent = '⌛ Calibrating...';
                psCalib.className = 'proc-state warn';
            } else {
                psCalib.textContent = '⚠️ Uncalibrated';
                psCalib.className = 'proc-state warn';
            }
        }

        const psMag = document.getElementById('ps-mag');
        if (psMag) {
            const isDevice = IDRN.SensorManager.source === 'device';
            const magAvail = !isDevice || IDRN.DeviceSensors.available.orientation;
            if (magAvail) {
                psMag.textContent = '✓ Available';
                psMag.className = 'proc-state check';
            } else {
                psMag.textContent = '⚠️ Magnetometer Unavailable';
                psMag.className = 'proc-state warn';
            }
        }
    },

    /**
     * Reset DOM readouts
     */
    reset() {
        const bar = document.getElementById('calib-progress-bar');
        const pctText = document.getElementById('calib-progress-pct');
        const statusText = document.getElementById('calib-status-text');

        if (bar) bar.style.width = '0%';
        if (pctText) pctText.textContent = '0%';
        if (statusText) {
            statusText.textContent = 'Calibration: Uninitialized';
            statusText.style.color = 'var(--text-muted)';
        }

        const shockBanner = document.getElementById('shock-alert-banner');
        if (shockBanner) shockBanner.classList.add('hidden');
    }
};


// ════════════════════════════════════════════════════
// DEAD RECKONING UI MODULE (STEP 4)
// Manages Dead Reckoning dashboard metrics, indicators, and status.
// ════════════════════════════════════════════════════

IDRN.DeadReckoningUI = {
    /**
     * Update Step 4 Dead Reckoning Dashboard elements
     * @param {Object} state - Output of IDRN.DeadReckoningEngine.getState()
     */
    update(state) {
        if (!state) return;

        // 1. Navigation Mode Badge
        const navBadge = document.getElementById('dr-nav-mode');
        if (navBadge) {
            if (state.navigationMode === 'DEAD_RECKONING') {
                navBadge.textContent = 'DEAD RECKONING';
                navBadge.className = 'dr-nav-mode-badge dr';
            } else if (state.navigationMode === 'GNSS_RECOVERY') {
                navBadge.textContent = 'GNSS RECOVERY';
                navBadge.className = 'dr-nav-mode-badge recovery';
            } else {
                navBadge.textContent = 'GNSS';
                navBadge.className = 'dr-nav-mode-badge gnss';
            }
        }

        // 2. DR Confidence Score
        const confVal = document.getElementById('dr-conf-val');
        const confBadge = document.getElementById('dr-conf-badge');
        if (confVal && confBadge) {
            confVal.textContent = `${state.confidenceScore} / 100`;
            confBadge.textContent = state.confidenceScoreLabel;
            const lbl = state.confidenceScoreLabel.toLowerCase();
            confBadge.className = `qs-badge ${lbl}`;
        }

        // 3. Motion Quality & Stationary Constraint
        const motQual = document.getElementById('dr-motion-quality');
        const statConst = document.getElementById('dr-stat-constraint');
        if (motQual) motQual.textContent = state.motionQuality;
        if (statConst) {
            statConst.textContent = state.stationaryConstraintActive ? 'ACTIVE' : 'INACTIVE';
            statConst.style.color = state.stationaryConstraintActive ? 'var(--status-amber)' : 'var(--text-muted)';
        }

        // 4. Speed & Distance
        const speedVal = document.getElementById('dr-speed-val');
        const distVal = document.getElementById('dr-dist-val');
        if (speedVal) speedVal.innerHTML = `${state.currentSpeedKmh.toFixed(1)} <small>km/h</small>`;
        if (distVal) distVal.innerHTML = `${state.travelledDistanceM.toFixed(1)} <small>m</small>`;

        // 5. Heading & Source
        const headVal = document.getElementById('dr-heading-val');
        const headSrc = document.getElementById('dr-heading-source');
        if (headVal) headVal.textContent = `${state.heading.toFixed(1)}°`;
        if (headSrc) headSrc.textContent = state.headingSource;

        // 6. Drift & % Distance
        const driftVal = document.getElementById('dr-drift-val');
        if (driftVal) {
            driftVal.innerHTML = `${state.positionErrorMeters.toFixed(1)} m <small>(${state.driftPercentage.toFixed(1)}%)</small>`;
        }

        // 7. Coordinates
        const posLat = document.getElementById('dr-pos-lat');
        const posLon = document.getElementById('dr-pos-lon');
        const posErr = document.getElementById('dr-pos-error');
        if (posLat) posLat.textContent = state.position.lat.toFixed(6);
        if (posLon) posLon.textContent = state.position.lon.toFixed(6);
        if (posErr) posErr.textContent = `${state.positionErrorMeters.toFixed(1)} m`;
    },

    /**
     * Reset Step 4 DOM readouts
     */
    reset() {
        const navBadge = document.getElementById('dr-nav-mode');
        if (navBadge) {
            navBadge.textContent = 'GNSS';
            navBadge.className = 'dr-nav-mode-badge gnss';
        }
        const confVal = document.getElementById('dr-conf-val');
        if (confVal) confVal.textContent = '95 / 100';
    }
};


// ════════════════════════════════════════════════════
// OFFLINE MAP MATCHING UI MODULE (STEP 5)
// Manages Step 5 Map Matching dashboard readouts, toggle button, and indicators.
// ════════════════════════════════════════════════════

IDRN.MapMatchingUI = {
    /**
     * Update Step 5 Offline Map Matching Dashboard readouts
     * @param {Object} state - Output of IDRN.MapMatcher.getState()
     */
    update(state) {
        if (!state) return;

        // 1. Status Badge
        const statusBadge = document.getElementById('mm-status-badge');
        if (statusBadge) {
            statusBadge.textContent = state.status;
            statusBadge.className = `dr-nav-mode-badge ${state.status.toLowerCase()}`;
        }

        // 2. Constraint Badge & Toggle Button
        const constBadge = document.getElementById('mm-constraint-badge');
        if (constBadge) {
            const active = state.enabled && state.status === 'MATCHED';
            constBadge.textContent = active ? 'ACTIVE' : (state.enabled ? 'DEGRADED' : 'DISABLED');
            constBadge.className = `qs-badge ${active ? 'good' : (state.enabled ? 'fair' : 'poor')}`;
        }

        const toggleBtn = document.getElementById('btn-toggle-mm');
        const toggleLbl = document.getElementById('mm-toggle-label');
        if (toggleBtn && toggleLbl) {
            if (state.enabled) {
                toggleBtn.classList.add('active');
                toggleLbl.textContent = 'ENABLED';
            } else {
                toggleBtn.classList.remove('active');
                toggleLbl.textContent = 'DISABLED';
            }
        }

        // 3. Segment & Road Name
        const roadName = document.getElementById('mm-road-name');
        const segId = document.getElementById('mm-segment-id');
        if (roadName) roadName.textContent = state.roadName;
        if (segId) segId.textContent = state.segmentId;

        // 4. Geometry & Alignment
        const roadBearing = document.getElementById('mm-road-bearing');
        const headingDiff = document.getElementById('mm-heading-diff');
        if (roadBearing) roadBearing.textContent = `${state.segmentBearing.toFixed(1)}°`;
        if (headingDiff) headingDiff.textContent = `${state.headingDifferenceDegrees.toFixed(1)}°`;

        // 5. Deviation & Correction
        const distRoad = document.getElementById('mm-dist-road');
        const matchCorr = document.getElementById('mm-match-corr');
        if (distRoad) distRoad.innerHTML = `${state.distanceToRoadMeters.toFixed(1)} <small>m</small>`;
        if (matchCorr) matchCorr.innerHTML = `${state.mapMatchCorrectionMeters.toFixed(1)} <small>m</small>`;

        // 6. Diagnostic Benchmarking (Before / After)
        const rawDev = document.getElementById('mm-raw-dev');
        const matchedDev = document.getElementById('mm-matched-dev');
        const corrApplied = document.getElementById('mm-corr-applied');
        const routeProg = document.getElementById('mm-route-progress');

        if (rawDev) rawDev.textContent = `${state.rawDRDeviationMeters.toFixed(1)} m`;
        if (matchedDev) matchedDev.textContent = `${state.matchedDeviationMeters.toFixed(1)} m`;
        if (corrApplied) corrApplied.textContent = `${state.mapMatchCorrectionMeters.toFixed(1)} m (35%)`;
        if (routeProg) routeProg.textContent = `${state.routeProgressPercent.toFixed(1)}%`;
    },

    /**
     * Reset Step 5 DOM readouts
     */
    reset() {
        const statusBadge = document.getElementById('mm-status-badge');
        if (statusBadge) {
            statusBadge.textContent = 'MATCHED';
            statusBadge.className = 'dr-nav-mode-badge matched';
        }
    }
};

// ════════════════════════════════════════════════════
// STEP 6: SENSOR FUSION UI MODULE
// ════════════════════════════════════════════════════

IDRN.SensorFusionUI = {
    /**
     * Update Step 6 DOM readouts from SensorFusion state
     */
    update(state) {
        if (!state) return;

        // 1. Fusion Mode Badge
        const modeBadge = document.getElementById('sf-mode-badge');
        if (modeBadge) {
            modeBadge.textContent = state.fusionMode.replace('_', ' ');
            const cls = state.fusionMode === 'GNSS_DOMINANT' ? 'gnss' : (state.fusionMode === 'RECOVERY' ? 'fusion' : 'dr');
            modeBadge.className = `dr-nav-mode-badge ${cls}`;
        }

        // 2. Confidence & Outlier Status
        const confVal = document.getElementById('sf-conf-val');
        const confBadge = document.getElementById('sf-conf-badge');
        const outlierStatus = document.getElementById('sf-outlier-status');
        const navMode = document.getElementById('sf-nav-mode');

        if (confVal) confVal.textContent = `${state.fusionConfidence} / 100`;
        if (confBadge) {
            confBadge.textContent = state.fusionConfidenceLevel;
            confBadge.className = `qs-badge ${state.fusionConfidenceLevel === 'HIGH' ? 'good' : (state.fusionConfidenceLevel === 'MEDIUM' ? 'fair' : 'poor')}`;
        }
        if (outlierStatus) {
            outlierStatus.textContent = state.gnssOutlierDetected ? 'DETECTED' : 'NONE';
            outlierStatus.style.color = state.gnssOutlierDetected ? 'var(--status-red)' : 'var(--status-green)';
        }
        if (navMode) navMode.textContent = state.navigationMode;

        // 3. Fused Velocity & Heading
        const speedVal = document.getElementById('sf-speed-val');
        const headingVal = document.getElementById('sf-heading-val');
        const headingSrc = document.getElementById('sf-heading-src');

        if (speedVal) speedVal.innerHTML = `${state.fusedSpeedKmh.toFixed(1)} <small>km/h</small>`;
        if (headingVal) headingVal.textContent = `${state.fusedHeading.toFixed(1)}°`;
        if (headingSrc) headingSrc.textContent = state.headingSource;

        // 4. Innovation & Uncertainty
        const innovVal = document.getElementById('sf-innov-val');
        const uncertVal = document.getElementById('sf-uncert-val');

        if (innovVal) innovVal.innerHTML = `${state.innovationMeters.toFixed(1)} <small>m</small>`;
        if (uncertVal) uncertVal.innerHTML = `${state.positionUncertaintyMeters.toFixed(1)} <small>m</small>`;

        // 5. Weight Allocation Bar
        const barGnss = document.getElementById('sf-bar-gnss');
        const barIns = document.getElementById('sf-bar-ins');
        const barMap = document.getElementById('sf-bar-map');
        const wGnss = document.getElementById('sf-w-gnss');
        const wIns = document.getElementById('sf-w-ins');
        const wMap = document.getElementById('sf-w-map');

        if (barGnss) barGnss.style.width = `${state.gnssWeight}%`;
        if (barIns) barIns.style.width = `${state.insWeight}%`;
        if (barMap) barMap.style.width = `${state.mapWeight}%`;

        if (wGnss) wGnss.textContent = `${state.gnssWeight}%`;
        if (wIns) wIns.textContent = `${state.insWeight}%`;
        if (wMap) wMap.textContent = `${state.mapWeight}%`;

        // 6. Coordinates & Deviations
        const posLat = document.getElementById('sf-pos-lat');
        const posLon = document.getElementById('sf-pos-lon');
        const devDr = document.getElementById('sf-dev-dr');
        const devMap = document.getElementById('sf-dev-map');
        const devFused = document.getElementById('sf-dev-fused');

        if (posLat) posLat.textContent = state.fusedPosition.lat.toFixed(6);
        if (posLon) posLon.textContent = state.fusedPosition.lon.toFixed(6);
        if (devDr) devDr.textContent = `${state.rawDRDeviationMeters.toFixed(1)} m`;
        if (devMap) devMap.textContent = `${state.mapMatchedDeviationMeters.toFixed(1)} m`;
        if (devFused) devFused.textContent = `${state.fusedDeviationMeters.toFixed(1)} m`;

        // 7. Toggle Button State
        const toggleBtn = document.getElementById('btn-toggle-sf');
        const toggleLbl = document.getElementById('sf-toggle-label');
        if (toggleBtn && toggleLbl) {
            if (state.enabled) {
                toggleBtn.classList.add('active');
                toggleLbl.textContent = 'ENABLED';
            } else {
                toggleBtn.classList.remove('active');
                toggleLbl.textContent = 'DISABLED';
            }
        }
    },

    /**
     * Reset Step 6 DOM readouts
     */
    reset() {
        const modeBadge = document.getElementById('sf-mode-badge');
        if (modeBadge) {
            modeBadge.textContent = 'GNSS DOMINANT';
            modeBadge.className = 'dr-nav-mode-badge gnss';
        }
    }
};

// ════════════════════════════════════════════════════
// STEP 7: AI/ML MOTION ESTIMATION UI MODULE
// ════════════════════════════════════════════════════

IDRN.AIMotionUI = {
    /**
     * Update Step 7 DOM readouts from AIMotionEstimator state and live features
     */
    update(state, features = null) {
        if (!state) return;

        // 1. Model Status & Motion Badges
        const statusBadge = document.getElementById('ai-status-badge');
        const motionBadge = document.getElementById('ai-motion-badge');
        const modelName = document.getElementById('ai-model-name');

        if (statusBadge) {
            statusBadge.textContent = state.modelStatus;
            const cls = state.modelStatus === 'RUNNING' || state.modelStatus === 'READY' ? 'gnss' : (state.modelStatus === 'LOW_CONFIDENCE' ? 'degraded' : 'dr');
            statusBadge.className = `dr-nav-mode-badge ${cls}`;
        }
        if (motionBadge) {
            motionBadge.textContent = state.motionState.replace('_', ' ');
            const cls = state.motionState === 'ROUGH_ROAD' ? 'unavailable' : (state.motionState === 'TURNING' ? 'degraded' : 'matched');
            motionBadge.className = `dr-nav-mode-badge ${cls}`;
        }
        if (modelName) modelName.textContent = state.modelName;

        // 2. Speed & Reference Comparison
        const speedVal = document.getElementById('ai-speed-val');
        const refSpeedVal = document.getElementById('ai-ref-speed-val');
        if (speedVal) speedVal.innerHTML = `${state.estimatedSpeedKmh.toFixed(1)} <small>km/h</small>`;
        if (refSpeedVal) refSpeedVal.innerHTML = `${state.referenceSpeedKmh.toFixed(1)} <small>km/h</small>`;

        // 3. Confidence & Penalty Status
        const confVal = document.getElementById('ai-conf-val');
        const confBadge = document.getElementById('ai-conf-badge');
        const vibPenalty = document.getElementById('ai-vib-penalty');
        const shockStatus = document.getElementById('ai-shock-status');

        if (confVal) confVal.textContent = `${state.speedConfidence} / 100`;
        if (confBadge) {
            confBadge.textContent = state.speedConfidenceLevel;
            confBadge.className = `qs-badge ${state.speedConfidenceLevel === 'HIGH' ? 'good' : (state.speedConfidenceLevel === 'MEDIUM' ? 'fair' : 'poor')}`;
        }
        if (vibPenalty) vibPenalty.textContent = `${state.vibrationPenalty}%`;
        if (shockStatus) {
            shockStatus.textContent = state.shockAffected ? 'YES' : 'NO';
            shockStatus.style.color = state.shockAffected ? 'var(--status-red)' : 'var(--status-green)';
        }

        // 4. Inference Performance & Evaluation
        const inferTime = document.getElementById('ai-infer-time');
        const featCount = document.getElementById('ai-feat-count');
        const speedErr = document.getElementById('ai-speed-err');
        const maeVal = document.getElementById('ai-mae-val');
        const rmseVal = document.getElementById('ai-rmse-val');

        if (inferTime) inferTime.textContent = `${state.inferenceTimeMs.toFixed(1)} ms`;
        if (featCount) featCount.textContent = `${state.featureCount}`;
        if (speedErr) speedErr.textContent = `${(state.speedErrorMps * 3.6).toFixed(1)} km/h (${state.speedErrorPercentage.toFixed(1)}%)`;
        if (maeVal) maeVal.textContent = `${state.maeMps.toFixed(2)} m/s`;
        if (rmseVal) rmseVal.textContent = `${state.rmseMps.toFixed(2)} m/s`;

        // 5. Live Features Panel (7 selected features)
        if (features && features.length >= 14) {
            const fwdAcc = document.getElementById('feat-fwd');
            const latRms = document.getElementById('feat-lat-rms');
            const vertRms = document.getElementById('feat-vert-rms');
            const gyroMag = document.getElementById('feat-gyro-mag');
            const yawRate = document.getElementById('feat-yaw');
            const featVib = document.getElementById('feat-vib');
            const featQual = document.getElementById('feat-qual');

            if (fwdAcc) fwdAcc.textContent = `${features[0].toFixed(2)} m/s²`;
            if (latRms) latRms.textContent = `${features[3].toFixed(2)} m/s²`;
            if (vertRms) vertRms.textContent = `${features[4].toFixed(2)} m/s²`;
            if (gyroMag) gyroMag.textContent = `${features[6].toFixed(3)} rad/s`;
            if (yawRate) yawRate.textContent = `${(features[8] * 57.2958).toFixed(1)} deg/s`;
            if (featVib) featVib.textContent = `${state.vibrationPenalty}%`;
            if (featQual) featQual.textContent = `${features[13]}%`;
        }

        // 6. Toggle Button State
        const toggleBtn = document.getElementById('btn-toggle-ai');
        const toggleLbl = document.getElementById('ai-toggle-label');
        if (toggleBtn && toggleLbl) {
            if (state.enabled) {
                toggleBtn.classList.add('active');
                toggleLbl.textContent = 'ENABLED';
            } else {
                toggleBtn.classList.remove('active');
                toggleLbl.textContent = 'DISABLED';
            }
        }
    },

    /**
     * Reset Step 7 DOM readouts
     */
    reset() {
        const statusBadge = document.getElementById('ai-status-badge');
        if (statusBadge) {
            statusBadge.textContent = 'READY';
            statusBadge.className = 'dr-nav-mode-badge gnss';
        }
    }
};

// ════════════════════════════════════════════════════
// STEP 8: AI DRIFT CORRECTION UI MODULE
// ════════════════════════════════════════════════════

IDRN.AIDriftUI = {
    /**
     * Update Step 8 DOM readouts from AIDriftCorrection state
     */
    update(state) {
        if (!state) return;

        // 1. Model Status & Correction Status Badges
        const statusBadge = document.getElementById('drift-status-badge');
        const corrStatusBadge = document.getElementById('drift-corr-status-badge');
        const modelName = document.getElementById('drift-model-name');

        if (statusBadge) {
            statusBadge.textContent = state.modelStatus;
            const cls = state.modelStatus === 'RUNNING' || state.modelStatus === 'READY' ? 'gnss' : (state.modelStatus === 'LOW_CONFIDENCE' ? 'degraded' : 'dr');
            statusBadge.className = `dr-nav-mode-badge ${cls}`;
        }
        if (corrStatusBadge) {
            corrStatusBadge.textContent = state.correctionStatus;
            const cls = state.correctionStatus === 'CORRECTING' ? 'matched' : (state.correctionStatus === 'MONITORING' ? 'gnss' : 'unavailable');
            corrStatusBadge.className = `dr-nav-mode-badge ${cls}`;
        }
        if (modelName) modelName.textContent = state.modelName;

        // 2. Error Estimation
        const estMag = document.getElementById('drift-est-mag');
        const estVector = document.getElementById('drift-est-vector');
        const outageTime = document.getElementById('drift-outage-time');
        const confVal = document.getElementById('drift-conf-val');
        const confBadge = document.getElementById('drift-conf-badge');

        if (estMag) estMag.innerHTML = `${state.estimatedErrorMagnitudeMeters.toFixed(1)} <small>m</small>`;
        if (estVector) estVector.textContent = `N: ${state.estimatedErrorNorthMeters.toFixed(1)}m | E: ${state.estimatedErrorEastMeters.toFixed(1)}m`;
        if (outageTime) outageTime.textContent = `${state.outageDurationSeconds.toFixed(1)} s`;
        if (confVal) confVal.textContent = `${state.errorConfidence} / 100`;
        if (confBadge) {
            confBadge.textContent = state.errorConfidenceLevel;
            confBadge.className = `qs-badge ${state.errorConfidenceLevel === 'HIGH' ? 'good' : (state.errorConfidenceLevel === 'MEDIUM' ? 'fair' : 'poor')}`;
        }

        // 3. Correction Applied
        const corrMag = document.getElementById('drift-corr-mag');
        const corrStrength = document.getElementById('drift-corr-strength');

        if (corrMag) corrMag.innerHTML = `${state.correctionMagnitudeMeters.toFixed(1)} <small>m</small>`;
        if (corrStrength) corrStrength.innerHTML = `${state.correctionStrength} <small>%</small>`;

        // 4. Accuracy Comparison
        const rawErr = document.getElementById('drift-raw-err');
        const corrErr = document.getElementById('drift-corr-err');
        const improvement = document.getElementById('drift-improvement');
        const gnssErr = document.getElementById('drift-gnss-err');

        if (rawErr) rawErr.textContent = `${state.rawDRDeviationMeters.toFixed(1)} m`;
        if (corrErr) corrErr.textContent = `${state.correctedDeviationMeters.toFixed(1)} m`;
        if (improvement) {
            if (state.rawDRDeviationMeters > 0.1) {
                improvement.textContent = `+${state.improvementPercent.toFixed(1)}%`;
                improvement.style.color = 'var(--status-green)';
            } else {
                improvement.textContent = 'N/A';
                improvement.style.color = 'var(--text-secondary)';
            }
        }
        if (gnssErr) gnssErr.textContent = `${state.gnssReferenceErrorMeters.toFixed(1)} m`;

        // 5. Navigation Accuracy Card (SIH Benchmark Target)
        const sihDist = document.getElementById('sih-outage-dist');
        const sihRawPct = document.getElementById('sih-raw-drift-pct');
        const sihCorrPct = document.getElementById('sih-corr-drift-pct');
        const sihBadge = document.getElementById('sih-target-badge');

        if (sihDist) sihDist.textContent = `${state.outageDistanceMeters.toFixed(1)} m`;
        if (sihRawPct) sihRawPct.textContent = `${state.rawDRDriftPercent.toFixed(1)}%`;
        if (sihCorrPct) sihCorrPct.textContent = `${state.correctedDriftPercent.toFixed(1)}%`;
        if (sihBadge) {
            sihBadge.textContent = state.sihTargetStatus;
            sihBadge.className = `qs-badge ${state.correctedDriftPercent > 0 && state.correctedDriftPercent < 10.0 ? 'good' : 'fair'}`;
        }

        // 6. Toggle Button State
        const toggleBtn = document.getElementById('btn-toggle-drift');
        const toggleLbl = document.getElementById('drift-toggle-label');
        if (toggleBtn && toggleLbl) {
            if (state.enabled) {
                toggleBtn.classList.add('active');
                toggleLbl.textContent = 'ENABLED';
            } else {
                toggleBtn.classList.remove('active');
                toggleLbl.textContent = 'DISABLED';
            }
        }
    },

    /**
     * Reset Step 8 DOM readouts
     */
    reset() {
        const statusBadge = document.getElementById('drift-status-badge');
        if (statusBadge) {
            statusBadge.textContent = 'MONITORING';
            statusBadge.className = 'dr-nav-mode-badge gnss';
        }
    }
};

// ════════════════════════════════════════════════════
// STEP 9: ACCURACY & SIH BENCHMARK UI MODULE
// ════════════════════════════════════════════════════

IDRN.AccuracyUI = {
    /**
     * Update Step 9 DOM readouts from AccuracyBenchmark state
     */
    update(state) {
        if (!state) return;

        // 1. Scenario & Navigation Mode Readouts
        const scenarioName = document.getElementById('bench-scenario-name');
        const navMode = document.getElementById('bench-nav-mode');
        const statusBadge = document.getElementById('bench-status-badge');

        const C = IDRN.Config.ACCURACY_BENCHMARK ? IDRN.Config.ACCURACY_BENCHMARK.SCENARIOS : {};
        const scenarioObj = C[state.currentScenario];
        if (scenarioName) scenarioName.textContent = scenarioObj ? scenarioObj.name : 'Custom Scenario';
        if (navMode) navMode.textContent = state.currentNavMode;

        if (statusBadge) {
            statusBadge.textContent = state.benchmarkStatus;
            const cls = state.benchmarkStatus === 'PASS' ? 'good' : (state.benchmarkStatus === 'ABOVE TARGET' ? 'poor' : 'fair');
            statusBadge.className = `qs-badge ${cls}`;
        }

        // 2. Outage Duration & Distance Readouts
        const outageDur = document.getElementById('bench-outage-dur');
        const outageDist = document.getElementById('bench-outage-dist');

        if (outageDur) outageDur.innerHTML = `${state.gnssOutageDuration.toFixed(1)} <small>s</small>`;
        if (outageDist) outageDist.innerHTML = `${state.outageDistanceMeters.toFixed(1)} <small>m</small>`;

        // 3. Live Position Errors
        const rawErr = document.getElementById('bench-raw-err');
        const corrErr = document.getElementById('bench-corr-err');

        if (rawErr) rawErr.innerHTML = `${state.rawErrorMeters.toFixed(1)} <small>m</small>`;
        if (corrErr) corrErr.innerHTML = `${state.correctedErrorMeters.toFixed(1)} <small>m</small>`;

        // 4. Accuracy & Improvement
        const improvement = document.getElementById('bench-improvement');
        const corrDrift = document.getElementById('bench-corr-drift');

        if (improvement) {
            if (state.rawErrorMeters > 0.1) {
                improvement.textContent = `+${state.improvementPercent.toFixed(1)}%`;
                improvement.style.color = 'var(--status-green)';
            } else {
                improvement.textContent = 'N/A';
                improvement.style.color = 'var(--text-secondary)';
            }
        }
        if (corrDrift) corrDrift.innerHTML = `${state.correctedDriftPercent.toFixed(1)} <small>%</small>`;

        // 5. Demo Evaluation Mode Pipeline Chips Highlights
        const phaseMap = {
            'GNSS AVAILABLE': 'demo-chip-gnss',
            'GNSS OUTAGE DETECTED': 'demo-chip-outage',
            'DEAD RECKONING ACTIVE': 'demo-chip-dr',
            'MAP MATCHING ACTIVE': 'demo-chip-mm',
            'AI CORRECTION ACTIVE': 'demo-chip-ai',
            'GNSS RECOVERY': 'demo-chip-rec'
        };

        Object.keys(phaseMap).forEach(phase => {
            const chipEl = document.getElementById(phaseMap[phase]);
            if (chipEl) {
                if (state.pipelinePhase === phase) {
                    chipEl.classList.add('active');
                } else {
                    chipEl.classList.remove('active');
                }
            }
        });
    },

    /**
     * Update Scenario Dropdown Selection
     */
    updateScenarioSelection(scenarioKey) {
        const selectEl = document.getElementById('benchmark-scenario-select');
        if (selectEl) selectEl.value = scenarioKey;
    },

    /**
     * Render rows in #benchmark-history-table
     */
    updateHistoryTable(history) {
        const tableBody = document.querySelector('#benchmark-history-table tbody');
        if (!tableBody) return;

        if (!history || history.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-secondary); padding: 12px;">No benchmark runs recorded yet. Select a scenario and click <strong>Run Scenario Test</strong>.</td></tr>`;
            return;
        }

        tableBody.innerHTML = history.map(row => {
            const statusCls = row.status === 'PASS' ? 'color: var(--status-green); font-weight:700;' : (row.status === 'ABOVE TARGET' ? 'color: var(--status-red); font-weight:700;' : 'color: var(--text-secondary);');
            return `
                <tr>
                    <td>${row.id}</td>
                    <td>${row.timestamp}</td>
                    <td><strong style="color: var(--accent-cyan);">${row.scenario}</strong></td>
                    <td>${row.outageDuration.toFixed(1)} s</td>
                    <td>${row.distance.toFixed(1)} m</td>
                    <td>${row.rawError.toFixed(1)} m</td>
                    <td>${row.correctedError.toFixed(1)} m</td>
                    <td style="color: var(--status-green);">+${row.improvement.toFixed(1)}%</td>
                    <td>${row.correctedDriftPct.toFixed(1)}%</td>
                    <td><span style="${statusCls}">${row.status}</span></td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Reset Step 9 DOM readouts
     */
    reset() {
        const statusBadge = document.getElementById('bench-status-badge');
        if (statusBadge) {
            statusBadge.textContent = 'INSUFFICIENT DATA';
            statusBadge.className = 'qs-badge fair';
        }
    }
};


// ════════════════════════════════════════════════════
// HANDHELD MOTION COMPENSATION UI MODULE
// Manages Motion Reference / Handheld Compensation sidebar card.
// ════════════════════════════════════════════════════

IDRN.HandheldUI = {
    /**
     * Update Motion Reference UI card with current Handheld Compensation state
     * @param {Object} state - Result of IDRN.HandheldCompensation.getState()
     */
    update(state) {
        if (!state) return;

        const vehFrameEl = document.getElementById('handheld-veh-frame');
        const devOrientEl = document.getElementById('handheld-dev-orient');
        const statusTextEl = document.getElementById('handheld-status-text');
        const protectionTextEl = document.getElementById('handheld-protection-text');
        const confidencePctEl = document.getElementById('handheld-confidence-pct');

        if (vehFrameEl) vehFrameEl.textContent = state.vehicleFrameStatus;
        if (devOrientEl) devOrientEl.textContent = state.deviceOrientationStatus;

        if (statusTextEl) {
            statusTextEl.textContent = state.status.replace('_', ' ');
            if (state.status === 'HANDHELD_DETECTED') {
                statusTextEl.style.color = 'var(--status-red)';
            } else if (state.status === 'POSSIBLE_HANDHELD') {
                statusTextEl.style.color = '#f59e0b';
            } else {
                statusTextEl.style.color = 'var(--status-green)';
            }
        }

        if (protectionTextEl) {
            protectionTextEl.textContent = state.headingProtectionStatus;
            if (state.headingProtectionStatus === 'ACTIVE') {
                protectionTextEl.style.color = 'var(--status-red)';
                protectionTextEl.style.fontWeight = '700';
            } else {
                protectionTextEl.style.color = 'var(--text-secondary)';
                protectionTextEl.style.fontWeight = '400';
            }
        }

        if (confidencePctEl) {
            confidencePctEl.textContent = `${state.handheldConfidencePct}%`;
            if (state.handheldConfidencePct > 60) {
                confidencePctEl.style.color = 'var(--status-red)';
            } else if (state.handheldConfidencePct > 30) {
                confidencePctEl.style.color = '#f59e0b';
            } else {
                confidencePctEl.style.color = 'var(--status-green)';
            }
        }
    },

    reset() {
        if (IDRN.HandheldCompensation) {
            IDRN.HandheldCompensation.reset();
            this.update(IDRN.HandheldCompensation.getState());
        }
    }
};








