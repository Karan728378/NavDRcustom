/* ═══════════════════════════════════════════════════════
   IDRN — Offline Map Matching & Road Network Constraints
   SIH 2026 Problem Statement 26168
   ═══════════════════════════════════════════════════════ */

window.IDRN = window.IDRN || {};

IDRN.MapMatcher = {
    // ── Module State ──
    enabled: true,
    status: 'UNAVAILABLE', // 'MATCHED' | 'DEGRADED' | 'UNAVAILABLE'
    nonHolonomicConstraint: true, // "Non-Holonomic Motion Constraint"

    // Road Network & Segments
    roadNetwork: null,
    segments: [],
    currentSegment: null,

    // Coordinates & Distance Readouts
    rawDRPosition: { lat: 28.6139, lon: 77.2090 },
    matchedPosition: { lat: 28.6139, lon: 77.2090 },
    smoothedMatchedPosition: { lat: 28.6139, lon: 77.2090 },

    // Metrics
    distanceToRoadMeters: 0,
    lateralDeviationMeters: 0,
    mapMatchCorrectionMeters: 0,
    segmentBearing: 0,
    headingDifferenceDegrees: 0,
    distanceAlongSegmentMeters: 0,
    routeProgressMeters: 0,
    routeProgressPercent: 0,

    // Comparison Diagnostics
    rawDRDeviationMeters: 0,
    matchedDeviationMeters: 0,
    mapConstraintImprovementMeters: 0,

    // Trajectory Storage
    mapMatchedTrajectory: [],
    _lastTrajectoryTime: 0,

    /**
     * Initialize MapMatcher engine & load offline road network
     */
    initialize() {
        try {
            this.enabled = IDRN.Config.MAP_MATCHING ? IDRN.Config.MAP_MATCHING.ENABLED : true;
            this.reset();
            this.loadRoadNetwork();
            console.log('[MapMatcher] Initialized offline road network with', this.segments.length, 'road segments.');
        } catch (err) {
            console.error('[MapMatcher] Initialization error — falling back to raw DR:', err);
            this.status = 'UNAVAILABLE';
            if (IDRN.Notifications) {
                IDRN.Notifications.show('Map Matching Unavailable — Dead Reckoning Fallback Active', 'warning', 4000);
            }
        }
    },

    /**
     * Reset MapMatcher state
     */
    reset() {
        const startLat = 28.6139;
        const startLon = 77.2090;
        this.status = 'UNAVAILABLE';
        this.currentSegment = null;
        this.rawDRPosition = { lat: startLat, lon: startLon };
        this.matchedPosition = { lat: startLat, lon: startLon };
        this.smoothedMatchedPosition = { lat: startLat, lon: startLon };
        this.distanceToRoadMeters = 0;
        this.lateralDeviationMeters = 0;
        this.mapMatchCorrectionMeters = 0;
        this.segmentBearing = 0;
        this.headingDifferenceDegrees = 0;
        this.distanceAlongSegmentMeters = 0;
        this.routeProgressMeters = 0;
        this.routeProgressPercent = 0;
        this.rawDRDeviationMeters = 0;
        this.matchedDeviationMeters = 0;
        this.mapConstraintImprovementMeters = 0;
        this.mapMatchedTrajectory = [];
        this._lastTrajectoryTime = performance.now();
    },

    /**
     * Enable or Disable Map Matching road constraint
     */
    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) {
            this.status = 'UNAVAILABLE';
        }
        if (IDRN.Notifications) {
            IDRN.Notifications.show(`Offline Map Matching: ${this.enabled ? 'ENABLED' : 'DISABLED'}`, 'info', 2000);
        }
    },

    /**
     * Load Offline Road Network from IDRN.Route or custom geometry
     */
    loadRoadNetwork(customNetwork = null) {
        let rawPoints = customNetwork;
        if (!rawPoints) {
            if (IDRN.Route && typeof IDRN.Route.getLatLngs === 'function') {
                rawPoints = IDRN.Route.getLatLngs();
            } else if (IDRN.Route && Array.isArray(IDRN.Route.points)) {
                rawPoints = IDRN.Route.points;
            } else if (IDRN.RouteData && Array.isArray(IDRN.RouteData.keyWaypoints)) {
                rawPoints = IDRN.RouteData.keyWaypoints;
            } else {
                rawPoints = [];
            }
        }

        if (!rawPoints || rawPoints.length < 2) {
            this.segments = [];
            return;
        }

        this.segments = [];
        let cumulativeLength = 0;

        for (let i = 0; i < rawPoints.length - 1; i++) {
            const p1 = this._parsePoint(rawPoints[i]);
            const p2 = this._parsePoint(rawPoints[i + 1]);

            if (!p1 || !p2) continue;

            const length = IDRN.Geo ? IDRN.Geo.haversine(p1.lat, p1.lon, p2.lat, p2.lon) : 100;
            const bearing = IDRN.Geo ? IDRN.Geo.bearingToDegrees(IDRN.Geo.bearing(p1.lat, p1.lon, p2.lat, p2.lon)) : 90;

            this.segments.push({
                id: `seg-${String(i + 1).padStart(3, '0')}`,
                roadName: `Kartavya Path Seg ${i + 1}`,
                start: p1,
                end: p2,
                lengthMeters: length,
                cumulativeStartMeters: cumulativeLength,
                bearing: parseFloat(bearing.toFixed(1))
            });

            cumulativeLength += length;
        }

        this.roadNetwork = {
            id: 'net-delhi-01',
            name: 'Kartavya Path Corridor (Offline)',
            totalLengthMeters: cumulativeLength,
            segments: this.segments
        };
    },

    _parsePoint(p) {
        if (!p) return null;
        if (Array.isArray(p)) {
            return { lat: Number(p[0]), lon: Number(p[1]) };
        }
        if (typeof p === 'object') {
            const lat = Number(p.lat);
            const lon = p.lng !== undefined ? Number(p.lng) : Number(p.lon);
            if (!isNaN(lat) && !isNaN(lon)) {
                return { lat, lon };
            }
        }
        return null;
    },

    /**
     * Perform Map Matching for a given DR position, heading, and speed
     */
    matchPosition(drPosition, headingDeg = 90, speedKmh = 0) {
        if (!drPosition || this.segments.length === 0) {
            return this.getState();
        }

        const C = IDRN.Config;
        const MM = C.MAP_MATCHING || {
            ENABLED: true,
            MAP_MATCH_MAX_DISTANCE_M: 30,
            MAP_MATCH_HEADING_TOLERANCE_DEG: 45,
            MAP_MATCH_STRENGTH: 0.35,
            MAX_TRAJECTORY_POINTS: 3000,
            TRAJECTORY_INTERVAL_MS: 100
        };

        this.rawDRPosition = { lat: drPosition.lat, lon: drPosition.lng || drPosition.lon };

        if (!this.enabled) {
            this.status = 'UNAVAILABLE';
            this.matchedPosition = { ...this.rawDRPosition };
            this.smoothedMatchedPosition = { ...this.rawDRPosition };
            this.mapMatchCorrectionMeters = 0;
            return this.getState();
        }

        // Search nearest road segment with local coordinate projection & heading compatibility
        let bestMatch = null;
        let minScore = Infinity;

        for (const seg of this.segments) {
            const projResult = this._projectPointToSegment(this.rawDRPosition, seg.start, seg.end);
            
            // Calculate heading difference (|heading - bearing| mod 360)
            let headDiff = Math.abs(headingDeg - seg.bearing) % 360;
            if (headDiff > 180) headDiff = 360 - headDiff;

            const maxHeadTol = MM.MAP_MATCH_HEADING_TOLERANCE_DEG || 45;
            
            // Score penalty for directionally incompatible segments
            let penalty = 0;
            if (headDiff > maxHeadTol) {
                penalty = 60.0; // 60-meter penalty for incompatible heading
            }

            const totalScore = projResult.distanceMeters + penalty;

            if (totalScore < minScore) {
                minScore = totalScore;
                bestMatch = {
                    segment: seg,
                    projected: projResult.projectedPoint,
                    distanceMeters: projResult.distanceMeters,
                    distAlongSeg: projResult.t * seg.lengthMeters,
                    headingDiff: parseFloat(headDiff.toFixed(1))
                };
            }
        }

        if (bestMatch) {
            this.currentSegment = bestMatch.segment;
            this.matchedPosition = bestMatch.projected;
            this.distanceToRoadMeters = parseFloat(bestMatch.distanceMeters.toFixed(1));
            this.lateralDeviationMeters = this.distanceToRoadMeters;
            this.segmentBearing = bestMatch.segment.bearing;
            this.headingDifferenceDegrees = bestMatch.headingDiff;
            this.distanceAlongSegmentMeters = parseFloat(bestMatch.distAlongSeg.toFixed(1));

            // Route progress
            const totalNetLen = this.roadNetwork ? this.roadNetwork.totalLengthMeters : 1;
            this.routeProgressMeters = parseFloat((bestMatch.segment.cumulativeStartMeters + bestMatch.distAlongSeg).toFixed(1));
            this.routeProgressPercent = parseFloat(Math.min(100, (this.routeProgressMeters / totalNetLen) * 100).toFixed(1));

            const maxDistThresh = MM.MAP_MATCH_MAX_DISTANCE_M || 30;

            if (bestMatch.distanceMeters <= maxDistThresh && bestMatch.headingDiff <= 60) {
                this.status = 'MATCHED';
            } else if (bestMatch.distanceMeters <= maxDistThresh * 2) {
                this.status = 'DEGRADED';
            } else {
                this.status = 'UNAVAILABLE';
            }

            // Soft Correction Blending (MAP_MATCH_STRENGTH = 0.35)
            const alpha = MM.MAP_MATCH_STRENGTH || 0.35;
            const targetLat = this.status === 'MATCHED' ? this.matchedPosition.lat : this.rawDRPosition.lat;
            const targetLon = this.status === 'MATCHED' ? this.matchedPosition.lon : this.rawDRPosition.lon;

            this.smoothedMatchedPosition.lat += alpha * (targetLat - this.smoothedMatchedPosition.lat);
            this.smoothedMatchedPosition.lon += alpha * (targetLon - this.smoothedMatchedPosition.lon);

            // Compute map match correction distance
            this.mapMatchCorrectionMeters = IDRN.Geo ? parseFloat(IDRN.Geo.haversine(
                this.rawDRPosition.lat, this.rawDRPosition.lon,
                this.smoothedMatchedPosition.lat, this.smoothedMatchedPosition.lon
            ).toFixed(1)) : 0;

            // Diagnostic comparison metrics
            this.rawDRDeviationMeters = this.distanceToRoadMeters;
            this.matchedDeviationMeters = IDRN.Geo ? parseFloat(IDRN.Geo.haversine(
                this.smoothedMatchedPosition.lat, this.smoothedMatchedPosition.lon,
                bestMatch.projected.lat, bestMatch.projected.lon
            ).toFixed(1)) : 0;
            this.mapConstraintImprovementMeters = parseFloat(Math.max(0, this.rawDRDeviationMeters - this.matchedDeviationMeters).toFixed(1));
        }

        // Record Matched Trajectory
        const now = performance.now();
        const trajInterval = MM.TRAJECTORY_INTERVAL_MS || 100;
        if (now - this._lastTrajectoryTime >= trajInterval) {
            this._lastTrajectoryTime = now;
            this.mapMatchedTrajectory.push({
                lat: this.smoothedMatchedPosition.lat,
                lon: this.smoothedMatchedPosition.lon,
                timestamp: Date.now(),
                segmentId: this.currentSegment ? this.currentSegment.id : 'none',
                distanceToRoadMeters: this.distanceToRoadMeters
            });

            const maxPts = MM.MAX_TRAJECTORY_POINTS || 3000;
            if (this.mapMatchedTrajectory.length > maxPts) {
                this.mapMatchedTrajectory.shift();
            }
        }

        return this.getState();
    },

    /**
     * Update map matching from DR State object
     */
    update(drState, mapData = null) {
        if (!drState || !drState.position) return this.getState();
        return this.matchPosition(drState.position, drState.heading, drState.currentSpeedKmh);
    },

    /**
     * Project point P onto segment AB using local (x,y) meter approximation
     */
    _projectPointToSegment(P, A, B) {
        const C = IDRN.Config;
        const R = C.EARTH_RADIUS_M || 6371000;
        const degToRad = C.DEG_TO_RAD || (Math.PI / 180);
        const radToDeg = C.RAD_TO_DEG || (180 / Math.PI);

        const meanLatRad = A.lat * degToRad;

        // Convert local lat/lon offset to meters
        const xB = (B.lon - A.lon) * degToRad * R * Math.cos(meanLatRad);
        const yB = (B.lat - A.lat) * degToRad * R;

        const xP = (P.lon - A.lon) * degToRad * R * Math.cos(meanLatRad);
        const yP = (P.lat - A.lat) * degToRad * R;

        const dx = xB;
        const dy = yB;
        const lenSq = dx * dx + dy * dy;

        let t = 0;
        if (lenSq > 0) {
            t = (xP * dx + yP * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
        }

        const xProj = t * dx;
        const yProj = t * dy;

        const distMeters = Math.sqrt((xP - xProj) ** 2 + (yP - yProj) ** 2);

        // Convert (xProj, yProj) back to Lat/Lon
        const latProj = A.lat + (yProj / R) * radToDeg;
        const lonProj = A.lon + (xProj / (R * Math.cos(meanLatRad))) * radToDeg;

        return {
            t,
            distanceMeters: distMeters,
            projectedPoint: {
                lat: parseFloat(latProj.toFixed(6)),
                lon: parseFloat(lonProj.toFixed(6))
            }
        };
    },

    /**
     * Get Map-Matched Navigation Position (for map display)
     */
    getMatchedPosition() {
        return this.enabled && this.status === 'MATCHED' ? this.smoothedMatchedPosition : this.rawDRPosition;
    },

    /**
     * Get Current Matched Segment
     */
    getRoadSegment() {
        return this.currentSegment;
    },

    /**
     * Get Offline Road Network Data
     */
    getRoadNetwork() {
        return this.roadNetwork;
    },

    /**
     * Get Complete State Object adhering to requirement #15
     */
    getState() {
        return {
            enabled: this.enabled,
            status: this.status,
            segmentId: this.currentSegment ? this.currentSegment.id : 'none',
            roadName: this.currentSegment ? this.currentSegment.roadName : 'Unknown Road',
            rawDRPosition: { ...this.rawDRPosition },
            matchedPosition: { ...this.matchedPosition },
            smoothedMatchedPosition: { ...this.smoothedMatchedPosition },
            distanceToRoadMeters: this.distanceToRoadMeters,
            lateralDeviationMeters: this.lateralDeviationMeters,
            mapMatchCorrectionMeters: this.mapMatchCorrectionMeters,
            segmentBearing: this.segmentBearing,
            headingDifferenceDegrees: this.headingDifferenceDegrees,
            distanceAlongSegmentMeters: this.distanceAlongSegmentMeters,
            routeProgressMeters: this.routeProgressMeters,
            routeProgressPercent: this.routeProgressPercent,
            rawDRDeviationMeters: this.rawDRDeviationMeters,
            matchedDeviationMeters: this.matchedDeviationMeters,
            mapConstraintImprovementMeters: this.mapConstraintImprovementMeters,
            nonHolonomicConstraint: this.nonHolonomicConstraint
        };
    }
};
