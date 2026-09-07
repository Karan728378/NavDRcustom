/* ═══════════════════════════════════════════════════════
   NavDR — Configuration, Constants & Route Data
   ═══════════════════════════════════════════════════════ */

window.NavDR = window.NavDR || {};

// ── Simulation Constants ──
NavDR.Config = {
    UPDATE_INTERVAL_MS: 50,          // Simulation tick rate (20 fps)
    DEFAULT_SPEED_KMH: 40,          // Default vehicle speed
    SPEED_INCREMENT_KMH: 10,        // Speed button step
    MIN_SPEED_KMH: 10,
    MAX_SPEED_KMH: 120,

    // Dead Reckoning drift parameters
    DR_HEADING_DRIFT_RATE: 0.0015,  // Radians per tick max heading noise
    DR_HEADING_BIAS: 0.0004,        // Small constant heading bias
    DR_SPEED_BIAS: 0.03,            // Fractional speed estimation error
    DR_SPEED_NOISE: 0.02,           // Speed noise fraction

    // Map matching
    MAP_MATCH_STRENGTH: 0.4,        // How strongly to pull toward road (0-1)
    MAP_MATCH_MAX_DIST: 50,         // Max distance (m) for map matching

    // Fusion
    FUSION_CORRECTION_RATE: 0.06,   // How fast to correct after GNSS restore

    // Sensor noise parameters (base defaults)
    ACCEL_NOISE: 0.3,               // m/s² base noise
    GYRO_NOISE: 0.02,               // rad/s base noise
    MAG_NOISE: 1.5,                 // µT base noise
    VIBRATION_AMPLITUDE: 0.15,      // Vehicle vibration

    // Noise Level Presets (LOW / MEDIUM / HIGH)
    currentNoiseLevel: 'MEDIUM',
    NOISE_PRESETS: {
        LOW: { accel: 0.1, gyro: 0.008, mag: 0.5, vibration: 0.05, shockChance: 0.0001 },
        MEDIUM: { accel: 0.35, gyro: 0.03, mag: 1.5, vibration: 0.2, shockChance: 0.0005 },
        HIGH: { accel: 0.85, gyro: 0.08, mag: 3.5, vibration: 0.55, shockChance: 0.002 }
    },

    // Step 3: Sensor Processing & Calibration Constants
    CALIBRATION_DURATION_MS: 3000,   // Calibration sample window (ms)
    FILTER_ALPHA: 0.22,              // Exponential Moving Average alpha (smoothing)
    SHOCK_THRESHOLD: 6.5,            // Sudden accel delta threshold (m/s²) for pothole/shock
    VIBRATION_THRESHOLD_LOW: 0.3,    // High-freq accel noise threshold for LOW vibration
    VIBRATION_THRESHOLD_HIGH: 0.9,   // High-freq accel noise threshold for HIGH vibration
    SENSOR_QUALITY_THRESHOLDS: { GOOD: 90, FAIR: 70 },

    // Step 4: Dead Reckoning Engine Constants
    DEAD_RECKONING: {
        EARTH_RADIUS_M: 6371000,
        MAX_SPEED_MPS: 60,
        MAX_ACCELERATION_MPS2: 8,
        ACCEL_DEADBAND_MPS2: 0.05,
        VELOCITY_DAMPING: 0.995,
        MAX_TRAJECTORY_POINTS: 3000,
        TRAJECTORY_INTERVAL_MS: 100,
        DR_SIMULATION_LATERAL_DRIFT_MPS: 0.25 // Simulated lateral drift rate (m/s) during GNSS outage
    },

    // Step 5: Offline Map Matching & Road Network Constants
    MAP_MATCHING: {
        ENABLED: true,
        MAP_MATCH_MAX_DISTANCE_M: 30,       // Max distance threshold (m) to snap to road
        MAP_MATCH_HEADING_TOLERANCE_DEG: 45, // Max heading difference threshold (deg)
        MAP_MATCH_STRENGTH: 0.35,             // Soft correction factor per tick (0.0 to 1.0)
        MAX_TRAJECTORY_POINTS: 3000,
        TRAJECTORY_INTERVAL_MS: 100
    },

    // Step 6: GNSS + INS Sensor Fusion Constants
    SENSOR_FUSION: {
        ENABLED: true,
        GNSS_BASE_WEIGHT: 0.70,
        INS_BASE_WEIGHT: 0.20,
        MAP_BASE_WEIGHT: 0.10,
        GNSS_OUTAGE_INS_WEIGHT: 0.80,
        GNSS_OUTAGE_MAP_WEIGHT: 0.20,
        RECOVERY_INITIAL_GNSS_WEIGHT: 0.20,
        RECOVERY_FINAL_GNSS_WEIGHT: 0.80,
        RECOVERY_DURATION_MS: 3000,
        MAX_POSITION_INNOVATION_M: 100,
        MAX_TRAJECTORY_POINTS: 3000,
        TRAJECTORY_INTERVAL_MS: 100
    },

    // Step 7: AI/ML Speed & Motion Estimation Constants
    AI_MODEL: {
        ENABLED: true,
        MODEL_NAME: 'Prototype On-Device Speed Estimation Model',
        MODEL_TYPE: 'Lightweight Feature Regression',
        AI_FEATURE_WINDOW_MS: 1500,     // 1.5-second sliding window
        AI_INFERENCE_INTERVAL_MS: 150,  // ~6.7 Hz inference rate
        AI_SPEED_SMOOTHING: 0.25,        // Confidence-aware smoothing factor
        MAX_SPEED_MPS: 60,
        FEATURE_WEIGHTS: [0.85, -0.15, 0.40, -0.20, -0.10, 0.30, -0.25, -0.15, -0.05, -0.10, -0.30, 0.90, 0.20, 0.15],
        FEATURE_BIAS: 0.12,
        NORM_MEAN: [0.0, 0.05, 0.2, 0.1, 9.81, 9.81, 0.02, 0.001, 0.0, 0.5, 0.0, 5.0, 0.0, 85.0],
        NORM_STD:  [1.5, 0.20, 0.5, 0.4, 1.50, 1.50, 0.10, 0.010, 0.2, 0.8, 0.5, 8.0, 1.0, 15.0]
    },

    // Step 8: AI Drift / Position Error Correction Constants
    AI_DRIFT_MODEL: {
        ENABLED: true,
        MODEL_NAME: 'Prototype On-Device Drift Error Estimation Model',
        MODEL_TYPE: 'Lightweight Feature-Based Error Regression',
        MAX_CORRECTION_PER_TICK_METERS: 0.5, // Max correction rate limit (m/tick)
        HIGH_CONF_STRENGTH: 0.35,
        MED_CONF_STRENGTH: 0.20,
        LOW_CONF_STRENGTH: 0.08,
        FEATURE_WEIGHTS: [0.05, 0.04, 0.02, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.05, 0.03, 0.03, 0.01, 0.25, 0.30, -0.05, -0.05, 0.02],
        FEATURE_BIAS: 0.05
    },

    // Step 9: Accuracy Testing & SIH Benchmark Constants
    ACCURACY_BENCHMARK: {
        ENABLED: true,
        TITLE: 'Accuracy & SIH Benchmark',
        SIH_TARGET_DRIFT_PCT: 10.0, // 10% drift target threshold
        SCENARIOS: {
            SHORT_TUNNEL: { name: 'Short Tunnel', targetDurationSec: 5, expectedDistM: 50 },
            URBAN_CANYON: { name: 'Urban Canyon', targetDurationSec: 10, expectedDistM: 100 },
            LONG_TUNNEL: { name: 'Long Tunnel', targetDurationSec: 30, expectedDistM: 300 },
            EXTENDED_OUTAGE: { name: 'Extended GNSS Outage', targetDurationSec: 60, expectedDistM: 1000 }
        }
    },

    // Step 10: Final SIH 2026 Demo Mode & Judge-Ready Polish Constants
    SIH_DEMO: {
        ENABLED: true,
        TITLE: 'INTELLIGENT DEAD RECKONING',
        SUBTITLE: 'AI-Enhanced GNSS-Denied Navigation System',
        PHASES: [
            { id: 1, name: 'PHASE 1 — GNSS AVAILABLE', navMode: 'GNSS', gnssStatus: 'AVAILABLE', aiStatus: 'Standby' },
            { id: 2, name: 'PHASE 2 — GNSS OUTAGE DETECTED', navMode: 'Dead Reckoning', gnssStatus: 'LOST', aiStatus: 'Initializing' },
            { id: 3, name: 'PHASE 3 — AI NAVIGATION', navMode: 'AI_CORRECTED', gnssStatus: 'LOST', aiStatus: 'ACTIVE' },
            { id: 4, name: 'PHASE 4 — GNSS RECOVERY', navMode: 'GNSS + INS', gnssStatus: 'RESTORED', aiStatus: 'RECOVERY' },
            { id: 5, name: 'PHASE 5 — FINAL RESULT', navMode: 'GNSS', gnssStatus: 'AVAILABLE', aiStatus: 'COMPLETED' }
        ]
    },

    // Chart
    CHART_MAX_POINTS: 120,          // Rolling window for charts

    // Earth
    EARTH_RADIUS_M: 6371000,
    DEG_TO_RAD: Math.PI / 180,
    RAD_TO_DEG: 180 / Math.PI,
    METERS_PER_DEG_LAT: 111320,
};

// ── Route Definition ──
// Predefined route through central New Delhi (Kartavya Path → India Gate area)
// with a clearly marked GNSS Denied Zone in the middle section.

NavDR.RouteData = {
    // Key waypoints defining the route path
    keyWaypoints: [
        // ── Section 1: Start — GNSS Available ──
        [28.61480, 77.20250],   // 0  Start: Near Vijay Chowk
        [28.61500, 77.20450],   // 1  East on Kartavya Path
        [28.61510, 77.20650],   // 2
        [28.61505, 77.20850],   // 3
        [28.61480, 77.21000],   // 4
        [28.61440, 77.21120],   // 5  Approaching curve

        // ── Section 2: GNSS DENIED ZONE ──
        [28.61380, 77.21220],   // 6  *** GNSS Denied Zone START ***
        [28.61300, 77.21300],   // 7  Curve south-east
        [28.61220, 77.21370],   // 8
        [28.61150, 77.21420],   // 9
        [28.61100, 77.21500],   // 10
        [28.61070, 77.21620],   // 11 *** GNSS Denied Zone END ***

        // ── Section 3: GNSS Restored ──
        [28.61080, 77.21780],   // 12 Turning east
        [28.61120, 77.21920],   // 13
        [28.61180, 77.22050],   // 14 Heading northeast
        [28.61240, 77.22170],   // 15
        [28.61280, 77.22300],   // 16
        [28.61300, 77.22500],   // 17
        [28.61290, 77.22700],   // 18
        [28.61290, 77.22950],   // 19 End: Near India Gate
    ],

    // Indices (into keyWaypoints) that define the GNSS denied zone boundaries
    gnssBlockedStartIdx: 6,
    gnssBlockedEndIdx: 11,

    // Number of interpolated points between each pair of key waypoints
    interpolationDensity: 12,
};

// ── Route Processing ──
NavDR.Route = {
    points: [],               // Interpolated route [{lat, lng}, ...]
    cumulativeDist: [],       // Cumulative distance at each point (meters)
    totalLength: 0,           // Total route length (meters)
    gnssBlockedDistStart: 0,  // Distance along route where GNSS denied starts
    gnssBlockedDistEnd: 0,    // Distance along route where GNSS denied ends

    /**
     * Initialize route: interpolate waypoints, compute distances.
     */
    initialize() {
        const kw = NavDR.RouteData.keyWaypoints;
        const density = NavDR.RouteData.interpolationDensity;
        this.points = [];

        // Interpolate between consecutive key waypoints
        for (let i = 0; i < kw.length - 1; i++) {
            for (let j = 0; j < density; j++) {
                const t = j / density;
                this.points.push({
                    lat: kw[i][0] + t * (kw[i + 1][0] - kw[i][0]),
                    lng: kw[i][1] + t * (kw[i + 1][1] - kw[i][1]),
                });
            }
        }
        // Add final point
        this.points.push({
            lat: kw[kw.length - 1][0],
            lng: kw[kw.length - 1][1],
        });

        // Compute cumulative distances
        this.cumulativeDist = [0];
        for (let i = 1; i < this.points.length; i++) {
            const d = NavDR.Geo.haversine(
                this.points[i - 1].lat, this.points[i - 1].lng,
                this.points[i].lat, this.points[i].lng
            );
            this.cumulativeDist.push(this.cumulativeDist[i - 1] + d);
        }
        this.totalLength = this.cumulativeDist[this.cumulativeDist.length - 1];

        // Compute GNSS blocked zone distance boundaries
        const blockedStartPtIdx = NavDR.RouteData.gnssBlockedStartIdx * density;
        const blockedEndPtIdx = NavDR.RouteData.gnssBlockedEndIdx * density;
        this.gnssBlockedDistStart = this.cumulativeDist[Math.min(blockedStartPtIdx, this.points.length - 1)];
        this.gnssBlockedDistEnd = this.cumulativeDist[Math.min(blockedEndPtIdx, this.points.length - 1)];
    },

    /**
     * Get position and heading at a given distance along the route.
     */
    getAtDistance(distance) {
        const pts = this.points;
        const cd = this.cumulativeDist;

        if (distance <= 0) {
            return {
                lat: pts[0].lat, lng: pts[0].lng,
                heading: NavDR.Geo.bearing(pts[0].lat, pts[0].lng, pts[1].lat, pts[1].lng),
                index: 0, finished: false
            };
        }

        if (distance >= this.totalLength) {
            const n = pts.length;
            return {
                lat: pts[n - 1].lat, lng: pts[n - 1].lng,
                heading: NavDR.Geo.bearing(pts[n - 2].lat, pts[n - 2].lng, pts[n - 1].lat, pts[n - 1].lng),
                index: n - 1, finished: true
            };
        }

        // Binary search for the right segment
        let lo = 0, hi = cd.length - 2;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cd[mid + 1] < distance) lo = mid + 1;
            else hi = mid;
        }

        const segLen = cd[lo + 1] - cd[lo];
        const t = segLen > 0 ? (distance - cd[lo]) / segLen : 0;

        return {
            lat: pts[lo].lat + t * (pts[lo + 1].lat - pts[lo].lat),
            lng: pts[lo].lng + t * (pts[lo + 1].lng - pts[lo].lng),
            heading: NavDR.Geo.bearing(pts[lo].lat, pts[lo].lng, pts[lo + 1].lat, pts[lo + 1].lng),
            index: lo,
            finished: false
        };
    },

    /**
     * Find the nearest point on the route to a given lat/lng.
     * Returns {lat, lng, distance, segmentIndex}.
     */
    nearestPointOnRoute(lat, lng) {
        const pts = this.points;
        let bestDist = Infinity;
        let bestLat = lat, bestLng = lng, bestIdx = 0;

        for (let i = 0; i < pts.length - 1; i++) {
            const proj = NavDR.Geo.projectOnSegment(
                lat, lng,
                pts[i].lat, pts[i].lng,
                pts[i + 1].lat, pts[i + 1].lng
            );
            if (proj.dist < bestDist) {
                bestDist = proj.dist;
                bestLat = proj.lat;
                bestLng = proj.lng;
                bestIdx = i;
            }
        }

        return { lat: bestLat, lng: bestLng, distance: bestDist, segmentIndex: bestIdx };
    },

    /**
     * Get the lat/lng arrays for the route path (for Leaflet polyline).
     */
    getLatLngs() {
        return this.points.map(p => [p.lat, p.lng]);
    },

    /**
     * Get the GNSS denied zone boundary polygon (for map overlay).
     */
    getGNSSZoneBounds() {
        const kw = NavDR.RouteData.keyWaypoints;
        const si = NavDR.RouteData.gnssBlockedStartIdx;
        const ei = NavDR.RouteData.gnssBlockedEndIdx;
        // Create a bounding box around the denied zone waypoints
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (let i = si; i <= ei; i++) {
            minLat = Math.min(minLat, kw[i][0]);
            maxLat = Math.max(maxLat, kw[i][0]);
            minLng = Math.min(minLng, kw[i][1]);
            maxLng = Math.max(maxLng, kw[i][1]);
        }
        const pad = 0.0008; // ~90m padding
        return [
            [minLat - pad, minLng - pad],
            [minLat - pad, maxLng + pad],
            [maxLat + pad, maxLng + pad],
            [maxLat + pad, minLng - pad],
        ];
    },

    /**
     * Get the denied zone section of the route (for drawing on map).
     */
    getGNSSZoneRouteLatLngs() {
        const density = NavDR.RouteData.interpolationDensity;
        const si = NavDR.RouteData.gnssBlockedStartIdx * density;
        const ei = Math.min(NavDR.RouteData.gnssBlockedEndIdx * density, this.points.length - 1);
        return this.points.slice(si, ei + 1).map(p => [p.lat, p.lng]);
    }
};

// ── Geodesic Utilities ──
NavDR.Geo = {
    /**
     * Haversine distance between two lat/lng points in meters.
     */
    haversine(lat1, lng1, lat2, lng2) {
        const R = NavDR.Config.EARTH_RADIUS_M;
        const dLat = (lat2 - lat1) * NavDR.Config.DEG_TO_RAD;
        const dLng = (lng2 - lng1) * NavDR.Config.DEG_TO_RAD;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * NavDR.Config.DEG_TO_RAD) *
                  Math.cos(lat2 * NavDR.Config.DEG_TO_RAD) *
                  Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    /**
     * Bearing from point 1 to point 2 in radians (0 = North, clockwise).
     */
    bearing(lat1, lng1, lat2, lng2) {
        const dLng = (lng2 - lng1) * NavDR.Config.DEG_TO_RAD;
        const y = Math.sin(dLng) * Math.cos(lat2 * NavDR.Config.DEG_TO_RAD);
        const x = Math.cos(lat1 * NavDR.Config.DEG_TO_RAD) * Math.sin(lat2 * NavDR.Config.DEG_TO_RAD) -
                  Math.sin(lat1 * NavDR.Config.DEG_TO_RAD) * Math.cos(lat2 * NavDR.Config.DEG_TO_RAD) * Math.cos(dLng);
        return Math.atan2(y, x);
    },

    /**
     * Move a lat/lng point by distance (m) along a bearing (rad).
     */
    movePoint(lat, lng, distM, bearingRad) {
        const dLat = distM * Math.cos(bearingRad) / NavDR.Config.METERS_PER_DEG_LAT;
        const dLng = distM * Math.sin(bearingRad) /
                     (NavDR.Config.METERS_PER_DEG_LAT * Math.cos(lat * NavDR.Config.DEG_TO_RAD));
        return { lat: lat + dLat, lng: lng + dLng };
    },

    /**
     * Convert North/East displacement meters into latitude and longitude degree offsets.
     */
    metersToDegrees(northM, eastM, lat) {
        const dLat = northM / NavDR.Config.METERS_PER_DEG_LAT;
        const dLon = eastM / (NavDR.Config.METERS_PER_DEG_LAT * Math.cos(lat * NavDR.Config.DEG_TO_RAD));
        return { dLat, dLon };
    },

    /**
     * Project point P onto line segment AB. Returns closest point and distance.
     */
    projectOnSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
        const dx = bLng - aLng;
        const dy = bLat - aLat;
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) {
            return { lat: aLat, lng: aLng, dist: this.haversine(pLat, pLng, aLat, aLng) };
        }

        let t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projLat = aLat + t * dy;
        const projLng = aLng + t * dx;

        return {
            lat: projLat,
            lng: projLng,
            dist: this.haversine(pLat, pLng, projLat, projLng)
        };
    },

    /**
     * Convert bearing (radians) to compass degrees string.
     */
    bearingToDegrees(bearingRad) {
        let deg = bearingRad * NavDR.Config.RAD_TO_DEG;
        deg = ((deg % 360) + 360) % 360;
        return deg;
    },

    /**
     * Normalize angle in radians to [-PI, PI].
     */
    normalizeAngleRad(angleRad) {
        let a = angleRad;
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
    }
};
