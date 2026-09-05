/* ═══════════════════════════════════════════════════════
   IDRN — Deterministic GNSS + INS Sensor Fusion Engine
   SIH 2026 Problem Statement 26168
   ═══════════════════════════════════════════════════════ */

window.IDRN = window.IDRN || {};

IDRN.SensorFusion = {
    // ── Module State ──
    enabled: true,
    _running: true,
    fusionMode: 'GNSS_DOMINANT', // 'GNSS_DOMINANT' | 'BALANCED' | 'INS_DOMINANT' | 'GNSS_OUTAGE' | 'RECOVERY'
    navigationMode: 'GNSS',      // 'GNSS' | 'DEAD_RECKONING' | 'GNSS_RECOVERY'

    // Fused Coordinates & Kinematics
    fusedPosition: { lat: 28.6139, lon: 77.2090 },
    fusedSpeedMps: 0,
    fusedSpeedKmh: 0,
    fusedHeading: 90,
    headingSource: 'FUSED',

    // Weights (sum = 1.0)
    gnssWeight: 0.70,
    insWeight: 0.20,
    mapWeight: 0.10,

    // Metrics & Diagnostics
    positionUncertaintyMeters: 2.5,
    innovationMeters: 0,
    correctionMeters: 0,
    fusionConfidence: 95,
    fusionConfidenceLevel: 'HIGH', // 'HIGH' | 'MEDIUM' | 'LOW'

    // Outage, Recovery, & Outlier State
    gnssAvailable: true,
    gnssConfidence: 95,
    gnssOutlierDetected: false,
    _outlierEndTime: 0,
    _manualOutlierOffset: null,
    _recoveryStartTime: 0,
    _outageDurationMs: 0,
    _prevGnssAvail: true,

    // Comparison Deviations
    rawDRDeviationMeters: 0,
    mapMatchedDeviationMeters: 0,
    fusedDeviationMeters: 0,

    // Trajectory History
    fusedTrajectory: [],
    _lastTrajectoryTime: 0,

    /**
     * Initialize SensorFusion engine
     */
    initialize() {
        this.enabled = IDRN.Config.SENSOR_FUSION ? IDRN.Config.SENSOR_FUSION.ENABLED : true;
        this.reset();
        console.log('[SensorFusion] Engine initialized with adaptive weighted fusion baseline.');
    },

    /**
     * Start fusion engine
     */
    start() {
        this._running = true;
    },

    /**
     * Stop fusion engine
     */
    stop() {
        this._running = false;
    },

    /**
     * Reset SensorFusion state
     */
    reset() {
        const startLat = 28.6139;
        const startLon = 77.2090;
        this.fusionMode = 'GNSS_DOMINANT';
        this.navigationMode = 'GNSS';
        this.fusedPosition = { lat: startLat, lon: startLon };
        this.fusedSpeedMps = 0;
        this.fusedSpeedKmh = 0;
        this.fusedHeading = 90;
        this.headingSource = 'FUSED';
        this.gnssWeight = 0.70;
        this.insWeight = 0.20;
        this.mapWeight = 0.10;
        this.positionUncertaintyMeters = 2.5;
        this.innovationMeters = 0;
        this.correctionMeters = 0;
        this.fusionConfidence = 95;
        this.fusionConfidenceLevel = 'HIGH';
        this.gnssAvailable = true;
        this.gnssConfidence = 95;
        this.gnssOutlierDetected = false;
        this._outlierEndTime = 0;
        this._manualOutlierOffset = null;
        this._recoveryStartTime = 0;
        this._outageDurationMs = 0;
        this._prevGnssAvail = true;
        this.rawDRDeviationMeters = 0;
        this.mapMatchedDeviationMeters = 0;
        this.fusedDeviationMeters = 0;
        this.fusedTrajectory = [];
        this._lastTrajectoryTime = performance.now();
    },

    /**
     * Enable or Disable Sensor Fusion
     */
    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (IDRN.Notifications) {
            IDRN.Notifications.show(`GNSS + INS Sensor Fusion: ${this.enabled ? 'ENABLED' : 'DISABLED'}`, 'info', 2000);
        }
    },

    /**
     * Inject an artificial GNSS position outlier for testing protection logic
     */
    injectOutlier(magnitudeMeters = 120) {
        this.gnssOutlierDetected = true;
        this._outlierEndTime = performance.now() + 4000; // Active for 4 seconds
        this._manualOutlierOffset = magnitudeMeters;
        if (IDRN.Notifications) {
            IDRN.Notifications.show('GNSS Position Outlier Detected — INS Protection Active', 'warning', 4000);
        }
        console.log('[SensorFusion] Injected GNSS outlier of', magnitudeMeters, 'meters');
    },

    /**
     * Main Sensor Fusion Update Cycle (called every tick from app.js)
     */
    update(gnssData, drState, mapMatchState, sensorData, dt) {
        if (!this._running || !dt || dt <= 0) return this.getState();

        const C = IDRN.Config;
        const SF = C.SENSOR_FUSION || {
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
        };

        const now = performance.now();
        const isGnssAvail = gnssData && gnssData.available;
        this.gnssAvailable = isGnssAvail;

        // ── 1. Outlier Expiration Check ──
        if (this.gnssOutlierDetected && now > this._outlierEndTime) {
            this.gnssOutlierDetected = false;
            this._manualOutlierOffset = null;
            if (IDRN.Notifications && isGnssAvail) {
                IDRN.Notifications.show('GNSS Signal Consistent — Outlier Cleared', 'info', 2500);
            }
        }

        // Apply temporary outlier offset if injected
        let effectiveGnssPos = gnssData ? { lat: gnssData.lat, lon: gnssData.lon } : { ...this.fusedPosition };
        if (this.gnssOutlierDetected && this._manualOutlierOffset) {
            const earthR = C.EARTH_RADIUS_M || 6371000;
            const latOffsetDeg = (this._manualOutlierOffset / earthR) * (180 / Math.PI);
            effectiveGnssPos.lat += latOffsetDeg; // Perturb GNSS latitude
        }

        // Extract DR & Map-Matched Position
        const drPos = drState ? drState.position : { ...this.fusedPosition };
        const mapPos = mapMatchState ? mapMatchState.smoothedMatchedPosition : { ...drPos };
        const mapMatched = mapMatchState && mapMatchState.enabled && mapMatchState.status === 'MATCHED';

        // Compute GNSS Innovation (discrepancy between GNSS and INS/fused position)
        if (isGnssAvail && IDRN.Geo) {
            this.innovationMeters = parseFloat(IDRN.Geo.haversine(
                effectiveGnssPos.lat, effectiveGnssPos.lon,
                drPos.lat, drPos.lon
            ).toFixed(1));
        } else {
            this.innovationMeters = 0;
        }

        // Automatic Innovation-based Outlier Detection
        const maxInnov = SF.MAX_POSITION_INNOVATION_M || 100;
        if (isGnssAvail && this.innovationMeters > maxInnov && !this.gnssOutlierDetected) {
            this.injectOutlier(this.innovationMeters);
        }

        // ── 2. Navigation & Fusion Mode State Machine ──
        if (!isGnssAvail) {
            // ── GNSS OUTAGE ──
            if (this._prevGnssAvail) {
                this.fusionMode = 'GNSS_OUTAGE';
                this.navigationMode = 'DEAD_RECKONING';
                this._outageDurationMs = 0;
                if (IDRN.Notifications) {
                    IDRN.Notifications.show('GNSS Signal Lost — INS Fusion Active', 'warning', 3500);
                }
            }
            this._outageDurationMs += dt * 1000;

            // Outage Weights: 0% GNSS, 80% INS, 20% Map (if matched)
            this.gnssWeight = 0.0;
            if (mapMatched) {
                this.insWeight = SF.GNSS_OUTAGE_INS_WEIGHT || 0.80;
                this.mapWeight = SF.GNSS_OUTAGE_MAP_WEIGHT || 0.20;
            } else if (mapMatchState && mapMatchState.enabled && mapMatchState.status === 'DEGRADED') {
                this.insWeight = 0.90;
                this.mapWeight = 0.10;
            } else {
                this.insWeight = 1.0;
                this.mapWeight = 0.0;
            }
        } else if (this.gnssOutlierDetected) {
            // ── OUTLIER PROTECTION ──
            this.fusionMode = 'INS_DOMINANT';
            this.gnssWeight = 0.0; // Suspend GNSS weight
            if (mapMatched) {
                this.insWeight = SF.GNSS_OUTAGE_INS_WEIGHT || 0.80; // 80% INS
                this.mapWeight = SF.GNSS_OUTAGE_MAP_WEIGHT || 0.20; // 20% Map
            } else if (mapMatchState && mapMatchState.enabled && mapMatchState.status === 'DEGRADED') {
                this.insWeight = 0.90;
                this.mapWeight = 0.10;
            } else {
                this.insWeight = 1.0; // 100% INS
                this.mapWeight = 0.0;
            }
        } else if (!this._prevGnssAvail) {
            // ── RECOVERY TRIGGER ──
            this.fusionMode = 'RECOVERY';
            this.navigationMode = 'GNSS_RECOVERY';
            this._recoveryStartTime = now;
            if (IDRN.Notifications) {
                IDRN.Notifications.show('GNSS Signal Restored — Fusion Recovery Active', 'info', 3500);
            }
        }

        // Handle RECOVERY Duration Blending (3000ms smooth transition)
        if (isGnssAvail && !this.gnssOutlierDetected && this.fusionMode === 'RECOVERY') {
            const recoveryDuration = SF.RECOVERY_DURATION_MS || 3000;
            const elapsed = now - this._recoveryStartTime;
            const progress = Math.min(1.0, elapsed / recoveryDuration);

            const initialGnss = SF.RECOVERY_INITIAL_GNSS_WEIGHT || 0.20;
            const finalGnss = SF.RECOVERY_FINAL_GNSS_WEIGHT || 0.80;

            this.gnssWeight = parseFloat((initialGnss + progress * (finalGnss - initialGnss)).toFixed(2));
            const remWeight = 1.0 - this.gnssWeight;

            if (mapMatched) {
                this.insWeight = parseFloat((remWeight * 0.80).toFixed(2));
                this.mapWeight = parseFloat((remWeight * 0.20).toFixed(2));
            } else {
                this.insWeight = parseFloat(remWeight.toFixed(2));
                this.mapWeight = 0.0;
            }

            if (progress >= 1.0) {
                this.fusionMode = 'GNSS_DOMINANT';
                this.navigationMode = 'GNSS';
                if (IDRN.Notifications) {
                    IDRN.Notifications.show('GNSS Fusion Recovery Complete', 'success', 3000);
                }
            }
        } else if (isGnssAvail && !this.gnssOutlierDetected && this.fusionMode !== 'RECOVERY') {
            // ── GNSS DOMINANT (Normal Healthy GNSS) ──
            this.fusionMode = 'GNSS_DOMINANT';
            this.navigationMode = 'GNSS';
            this.gnssWeight = SF.GNSS_BASE_WEIGHT || 0.70;
            if (mapMatched) {
                this.insWeight = SF.INS_BASE_WEIGHT || 0.20;
                this.mapWeight = SF.MAP_BASE_WEIGHT || 0.10;
            } else {
                this.insWeight = parseFloat(((1.0 - this.gnssWeight)).toFixed(2));
                this.mapWeight = 0.0;
            }
        }

        this._prevGnssAvail = isGnssAvail;

        // Normalize weights so sum === 1.0 exactly
        const totalW = this.gnssWeight + this.insWeight + this.mapWeight;
        if (totalW > 0) {
            this.gnssWeight = parseFloat((this.gnssWeight / totalW).toFixed(2));
            this.insWeight = parseFloat((this.insWeight / totalW).toFixed(2));
            this.mapWeight = parseFloat((1.0 - this.gnssWeight - this.insWeight).toFixed(2));
        }

        // ── 3. Local North/East Weighted Position Fusion ──
        if (!this.enabled) {
            // Fallback when fusion is disabled
            this.fusedPosition = isGnssAvail ? { ...effectiveGnssPos } : { ...drPos };
            this.correctionMeters = 0;
        } else {
            const R = C.EARTH_RADIUS_M || 6371000;
            const degToRad = C.DEG_TO_RAD || (Math.PI / 180);
            const radToDeg = C.RAD_TO_DEG || (180 / Math.PI);

            const originLat = isGnssAvail ? effectiveGnssPos.lat : drPos.lat;
            const originLon = isGnssAvail ? effectiveGnssPos.lon : drPos.lon;
            const originLatRad = originLat * degToRad;

            // Convert candidate positions to local meter offsets (x, y) relative to origin
            const xGnss = (effectiveGnssPos.lon - originLon) * degToRad * R * Math.cos(originLatRad);
            const yGnss = (effectiveGnssPos.lat - originLat) * degToRad * R;

            const xIns = (drPos.lon - originLon) * degToRad * R * Math.cos(originLatRad);
            const yIns = (drPos.lat - originLat) * degToRad * R;

            const xMap = (mapPos.lon - originLon) * degToRad * R * Math.cos(originLatRad);
            const yMap = (mapPos.lat - originLat) * degToRad * R;

            // Compute weighted fused offset
            const xFused = this.gnssWeight * xGnss + this.insWeight * xIns + this.mapWeight * xMap;
            const yFused = this.gnssWeight * yGnss + this.insWeight * yIns + this.mapWeight * yMap;

            // Convert fused offset back to geodetic lat/lon
            const fusedLat = originLat + (yFused / R) * radToDeg;
            const fusedLon = originLon + (xFused / (R * Math.cos(originLatRad))) * radToDeg;

            const prevFused = { ...this.fusedPosition };
            this.fusedPosition = { lat: parseFloat(fusedLat.toFixed(6)), lon: parseFloat(fusedLon.toFixed(6)) };

            this.correctionMeters = IDRN.Geo ? parseFloat(IDRN.Geo.haversine(
                prevFused.lat, prevFused.lon,
                this.fusedPosition.lat, this.fusedPosition.lon
            ).toFixed(1)) : 0;
        }

        // ── 4. Kinematic Speed & Heading Fusion ──
        const drSpeed = drState ? drState.currentSpeedMps : (gnssData ? gnssData.speedMps : 0);
        const gnssSpeed = gnssData ? gnssData.speedMps : drSpeed;

        if (isGnssAvail && !this.gnssOutlierDetected) {
            this.fusedSpeedMps = this.gnssWeight * gnssSpeed + (1 - this.gnssWeight) * drSpeed;
        } else {
            this.fusedSpeedMps = drSpeed;
        }
        this.fusedSpeedKmh = parseFloat((this.fusedSpeedMps * 3.6).toFixed(1));

        // Heading Fusion
        const drHeading = drState ? drState.heading : (gnssData ? gnssData.heading : 90);
        if (isGnssAvail && !this.gnssOutlierDetected && gnssData && gnssData.heading !== undefined) {
            // Handle angle wrap-around for circular interpolation
            const diff = (gnssData.heading - drHeading + 540) % 360 - 180;
            this.fusedHeading = parseFloat(((drHeading + this.gnssWeight * diff + 360) % 360).toFixed(1));
            this.headingSource = this.fusionMode === 'RECOVERY' ? 'RECOVERY' : 'FUSED';
        } else {
            this.fusedHeading = parseFloat(((drHeading + 360) % 360).toFixed(1));
            this.headingSource = 'INS';
        }

        // ── 5. Position Uncertainty & Confidence Metrics ──
        if (isGnssAvail && !this.gnssOutlierDetected) {
            if (this.fusionMode === 'RECOVERY') {
                this.positionUncertaintyMeters = parseFloat(Math.max(2.5, 12.0 - (this.gnssWeight * 12)).toFixed(1));
            } else {
                this.positionUncertaintyMeters = 2.5;
            }
        } else {
            // Grow uncertainty during outage (+0.25m/s), mitigated by map matching
            let growthRate = 0.25;
            if (mapMatched) growthRate = 0.08;
            this.positionUncertaintyMeters = parseFloat(Math.min(60.0, 2.5 + (this._outageDurationMs / 1000) * growthRate).toFixed(1));
        }

        // Compute Fusion Confidence (0-100)
        let conf = 95;
        if (!isGnssAvail) {
            conf = mapMatched ? 78 : 58;
            conf = Math.max(30, conf - Math.floor(this._outageDurationMs / 4000));
        } else if (this.gnssOutlierDetected) {
            conf = 60;
        } else if (this.fusionMode === 'RECOVERY') {
            conf = 85;
        }

        this.fusionConfidence = conf;
        this.fusionConfidenceLevel = conf >= 90 ? 'HIGH' : (conf >= 70 ? 'MEDIUM' : 'LOW');

        // Deviations comparison from ground-truth reference position
        const refLat = gnssData ? gnssData.lat : this.fusedPosition.lat;
        const refLon = gnssData ? gnssData.lon : this.fusedPosition.lon;

        this.gnssDeviationMeters = IDRN.Geo ? parseFloat(IDRN.Geo.haversine(refLat, refLon, effectiveGnssPos.lat, effectiveGnssPos.lon).toFixed(1)) : 0;
        this.rawDRDeviationMeters = IDRN.Geo ? parseFloat(IDRN.Geo.haversine(refLat, refLon, drPos.lat, drPos.lon).toFixed(1)) : 0;
        this.mapMatchedDeviationMeters = IDRN.Geo ? parseFloat(IDRN.Geo.haversine(refLat, refLon, mapPos.lat, mapPos.lon).toFixed(1)) : 0;
        this.fusedDeviationMeters = IDRN.Geo ? parseFloat(IDRN.Geo.haversine(refLat, refLon, this.fusedPosition.lat, this.fusedPosition.lon).toFixed(1)) : 0;

        // ── 6. Record Fused Trajectory ──
        const trajInterval = SF.TRAJECTORY_INTERVAL_MS || 100;
        if (now - this._lastTrajectoryTime >= trajInterval) {
            this._lastTrajectoryTime = now;
            this.fusedTrajectory.push({
                lat: this.fusedPosition.lat,
                lon: this.fusedPosition.lon,
                timestamp: Date.now(),
                speedMps: this.fusedSpeedMps,
                heading: this.fusedHeading,
                fusionMode: this.fusionMode,
                fusionConfidence: this.fusionConfidence
            });

            const maxPts = SF.MAX_TRAJECTORY_POINTS || 3000;
            if (this.fusedTrajectory.length > maxPts) {
                this.fusedTrajectory.shift();
            }
        }

        return this.getState();
    },

    /**
     * Get Current Fused Navigation Position
     */
    getFusedPosition() {
        return { ...this.fusedPosition };
    },

    /**
     * Get Fused Trajectory History
     */
    getTrajectory() {
        return this.fusedTrajectory;
    },

    /**
     * Get Complete State Object adhering to requirement #3 & #23
     */
    getState() {
        return {
            enabled: this.enabled,
            fusionMode: this.fusionMode,
            navigationMode: this.navigationMode,
            fusedPosition: { ...this.fusedPosition },
            fusedSpeedMps: this.fusedSpeedMps,
            fusedSpeedKmh: this.fusedSpeedKmh,
            fusedHeading: this.fusedHeading,
            headingSource: this.headingSource,
            positionUncertaintyMeters: this.positionUncertaintyMeters,
            gnssWeight: parseFloat((this.gnssWeight * 100).toFixed(0)),
            insWeight: parseFloat((this.insWeight * 100).toFixed(0)),
            mapWeight: parseFloat((this.mapWeight * 100).toFixed(0)),
            gnssWeightRaw: this.gnssWeight,
            insWeightRaw: this.insWeight,
            mapWeightRaw: this.mapWeight,
            innovationMeters: this.innovationMeters,
            correctionMeters: this.correctionMeters,
            fusionConfidence: this.fusionConfidence,
            fusionConfidenceLevel: this.fusionConfidenceLevel,
            gnssAvailable: this.gnssAvailable,
            gnssConfidence: this.gnssConfidence,
            gnssOutlierDetected: this.gnssOutlierDetected,
            gnssDeviationMeters: this.gnssDeviationMeters || 0,
            rawDRDeviationMeters: this.rawDRDeviationMeters,
            mapMatchedDeviationMeters: this.mapMatchedDeviationMeters,
            fusedDeviationMeters: this.fusedDeviationMeters
        };
    }
};
