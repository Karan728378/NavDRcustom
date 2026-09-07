/* ═══════════════════════════════════════════════════════
   NavDR — Dead Reckoning Engine (Deterministic Baseline)
   SIH 2026 Problem Statement 26168
   ═══════════════════════════════════════════════════════ */

window.NavDR = window.NavDR || {};

NavDR.DeadReckoningEngine = {
    // ── Navigation State ──
    navigationMode: 'GNSS', // 'GNSS' | 'DEAD_RECKONING' | 'GNSS_RECOVERY'
    
    // Position
    position: { lat: 28.6139, lon: 77.2090 },
    referencePosition: { lat: 28.6139, lon: 77.2090 },
    _lastKnownGnssPosition: null,

    // Velocity & Motion
    currentSpeedMps: 0,
    currentSpeedKmh: 0,
    travelledDistanceM: 0,
    travelledDistanceKm: 0,
    isStationary: false,
    stationaryConstraintActive: false,
    motionQuality: 'GOOD', // 'GOOD' | 'DEGRADED' | 'SHOCK_SUPPRESSED'

    // Heading
    heading: 90, // Degrees 0-360
    headingRate: 0, // deg/s
    headingSource: 'INITIALIZED', // 'INITIALIZED' | 'GNSS' | 'IMU' | 'UNAVAILABLE'

    // Metrics & Confidence
    positionErrorMeters: 0,
    driftPercentage: 0,
    confidenceScore: 95,
    confidenceScoreLabel: 'GOOD', // 'GOOD' | 'FAIR' | 'POOR'

    // Trajectory Storage
    drTrajectory: [],
    _lastTrajectoryTime: 0,
    _outageStartTime: 0,
    _running: false,

    /**
     * Initialize Dead Reckoning Engine with starting coordinates and heading
     */
    initialize(lat = 28.6139, lon = 77.2090, headingDeg = 90, initialSpeedMps = 0) {
        this.position = { lat, lon };
        this.referencePosition = { lat, lon };
        this._lastKnownGnssPosition = { lat, lon };
        this.heading = (headingDeg + 360) % 360;
        this.headingSource = 'INITIALIZED';
        this.currentSpeedMps = initialSpeedMps;
        this.currentSpeedKmh = initialSpeedMps * 3.6;
        this.travelledDistanceM = 0;
        this.travelledDistanceKm = 0;
        this.positionErrorMeters = 0;
        this.driftPercentage = 0;
        this.confidenceScore = 95;
        this.confidenceScoreLabel = 'GOOD';
        this.navigationMode = 'GNSS';
        this.isStationary = false;
        this.stationaryConstraintActive = false;
        this.motionQuality = 'GOOD';
        this.drTrajectory = [{ lat, lon, timestamp: Date.now(), speedMps: initialSpeedMps, heading: this.heading }];
        this._lastTrajectoryTime = performance.now();
        this._running = true;

        console.log('[DeadReckoningEngine] Initialized at:', lat.toFixed(6), lon.toFixed(6), 'Heading:', headingDeg.toFixed(1) + '°');
    },

    /**
     * Start the DR Engine
     */
    start() {
        this._running = true;
    },

    /**
     * Stop the DR Engine
     */
    stop() {
        this._running = false;
    },

    /**
     * Reset DR Engine state
     */
    reset() {
        const startLat = 28.6139;
        const startLon = 77.2090;
        this.initialize(startLat, startLon, 90, 0);
    },

    /**
     * Set Reference GNSS Position
     */
    setReferencePosition(lat, lon) {
        this.referencePosition = { lat, lon };
        if (this.navigationMode === 'GNSS') {
            this.position = { lat, lon };
            this._lastKnownGnssPosition = { lat, lon };
        }
    },

    /**
     * Set Reference Heading (degrees)
     */
    setReferenceHeading(heading) {
        this.heading = (heading + 360) % 360;
        this.headingSource = 'GNSS';
    },

    /**
     * Set Initial Speed (m/s)
     */
    setInitialVelocity(speedMps) {
        this.currentSpeedMps = Math.max(0, speedMps);
        this.currentSpeedKmh = this.currentSpeedMps * 3.6;
    },

    /**
     * Main Dead Reckoning Update Loop (called every tick from app.js)
     * @param {number} dt - Time delta in seconds
     * @param {Object} processedData - Clean output from NavDR.SensorProcessor.getProcessedSensorData()
     * @param {Object} gnssData - { available: boolean, lat: number, lon: number, heading: number, speedMps: number }
     */
    update(dt, processedData, gnssData) {
        if (!this._running || !dt || dt <= 0) return;

        const C = NavDR.Config;
        const DR = C.DEAD_RECKONING || {
            EARTH_RADIUS_M: 6371000,
            MAX_SPEED_MPS: 60,
            MAX_ACCELERATION_MPS2: 8,
            ACCEL_DEADBAND_MPS2: 0.05,
            VELOCITY_DAMPING: 0.995,
            MAX_TRAJECTORY_POINTS: 3000,
            TRAJECTORY_INTERVAL_MS: 100
        };

        const isGnssAvail = gnssData && gnssData.available;

        // 1. Navigation State Machine Transitions
        if (isGnssAvail) {
            if (this.navigationMode === 'DEAD_RECKONING') {
                this.navigationMode = 'GNSS_RECOVERY';
                if (NavDR.Notifications) {
                    NavDR.Notifications.show('GNSS Signal Restored — Recovery Pending', 'success', 3500);
                }
            } else if (this.navigationMode !== 'GNSS_RECOVERY') {
                this.navigationMode = 'GNSS';
            }

            this.referencePosition = { lat: gnssData.lat, lon: gnssData.lon };
            this._lastKnownGnssPosition = { lat: gnssData.lat, lon: gnssData.lon };
            if (gnssData.speedMps > 1.0) {
                this.headingSource = 'GNSS';
            }
        } else {
            if (this.navigationMode !== 'DEAD_RECKONING') {
                this.navigationMode = 'DEAD_RECKONING';
                this._outageStartTime = performance.now();
                this.headingSource = 'IMU';
                if (NavDR.Notifications) {
                    NavDR.Notifications.show('GNSS Signal Lost — Dead Reckoning Active', 'warning', 3500);
                }
            }
        }

        // 2. Shock Suppression Handling
        const isShock = processedData && processedData.shockDetected;
        if (isShock) {
            this.motionQuality = 'SHOCK_SUPPRESSED';
        } else if (processedData && processedData.vibrationLevel === 'HIGH') {
            this.motionQuality = 'DEGRADED';
        } else {
            this.motionQuality = 'GOOD';
        }

        // 3. Stationary Vehicle Detection ("Stationary Motion Constraint")
        const fwdAccelRaw = processedData ? processedData.vehicleFrameAcceleration.forward : 0;
        const gyroZ = processedData ? processedData.gyroscope.filtered.z : 0;
        const gyroMag = processedData ? processedData.gyroscope.magnitude : 0;

        if (Math.abs(fwdAccelRaw) < DR.ACCEL_DEADBAND_MPS2 && gyroMag < 0.05 && this.currentSpeedMps < 0.3) {
            this.isStationary = true;
            this.stationaryConstraintActive = true;
            this.currentSpeedMps *= 0.9; // Fast zero dampening
            if (this.currentSpeedMps < 0.01) this.currentSpeedMps = 0;
        } else {
            this.isStationary = false;
            this.stationaryConstraintActive = false;
        }

        // 4. Longitudinal Velocity Integration (Only when NOT shock suppressed & NOT stationary)
        let fwdAccel = fwdAccelRaw;
        if (isShock) {
            fwdAccel = 0; // Suppress shock acceleration spike
        } else if (Math.abs(fwdAccel) < DR.ACCEL_DEADBAND_MPS2) {
            fwdAccel = 0; // Apply deadband
        }

        // Clamp forward acceleration contribution
        fwdAccel = Math.max(-DR.MAX_ACCELERATION_MPS2, Math.min(DR.MAX_ACCELERATION_MPS2, fwdAccel));

        if (!this.isStationary && !isShock) {
            // Integration: v_new = v_old + a_forward * dt
            let newSpeed = this.currentSpeedMps + fwdAccel * dt;
            // Apply velocity damping
            newSpeed *= DR.VELOCITY_DAMPING;

            // AI Speed Estimation Integration (Requirement 21 & 22)
            if (NavDR.AIMotionEstimator && NavDR.AIMotionEstimator.enabled) {
                const aiState = NavDR.AIMotionEstimator.getState();
                if (aiState && (aiState.modelStatus === 'RUNNING' || aiState.modelStatus === 'READY' || aiState.modelStatus === 'LOW_CONFIDENCE')) {
                    let aiWeight = 0.50;
                    if (aiState.speedConfidence >= 85) aiWeight = 0.75;
                    else if (aiState.speedConfidence >= 65) aiWeight = 0.50;
                    else aiWeight = 0.20;

                    // Confidence-aware blending of AI estimated speed and kinematic DR speed
                    newSpeed = aiWeight * aiState.estimatedSpeedMps + (1.0 - aiWeight) * newSpeed;
                }
            }

            // Clamp speed: [0, MAX_SPEED_MPS]
            this.currentSpeedMps = Math.max(0, Math.min(DR.MAX_SPEED_MPS, newSpeed));
        }

        // Keep simulated/external speed synchronized when GNSS is available and vehicle is driven by simulation route
        if (gnssData && gnssData.speedMps !== undefined && isGnssAvail && this.navigationMode === 'GNSS') {
            this.currentSpeedMps = gnssData.speedMps;
        }

        this.currentSpeedKmh = this.currentSpeedMps * 3.6;

        // Compute displacement increment
        const distanceIncrement = this.currentSpeedMps * dt; // meters
        this.travelledDistanceM += distanceIncrement;
        this.travelledDistanceKm = this.travelledDistanceM / 1000;

        // 5. Heading Propagation
        if (processedData) {
            this.headingRate = parseFloat((gyroZ * C.RAD_TO_DEG).toFixed(2));
            if (!isGnssAvail || this.currentSpeedMps < 1.0) {
                // Inertial propagation: heading += rate * dt
                this.heading += this.headingRate * dt;
                this.heading = (this.heading + 360) % 360;
                this.headingSource = 'IMU';
            } else if (gnssData && gnssData.heading !== undefined) {
                // Smooth GNSS heading tracking when available
                const diff = (gnssData.heading - this.heading + 540) % 360 - 180;
                this.heading += diff * 0.1; // Smooth 10% blending
                this.heading = (this.heading + 360) % 360;
                this.headingSource = 'GNSS';
            }
        }

        // 6. Geographic Position Integration (North/East displacement -> Lat/Lon)
        const headingRad = this.heading * C.DEG_TO_RAD;

        // Apply realistic simulated lateral drift during GNSS outage
        const isDeviceMode = NavDR.SensorManager && NavDR.SensorManager.source === 'device';
        let lateralDriftM = 0;
        if (this.navigationMode === 'DEAD_RECKONING' && !isDeviceMode) {
            const driftRate = DR.DR_SIMULATION_LATERAL_DRIFT_MPS !== undefined ? DR.DR_SIMULATION_LATERAL_DRIFT_MPS : 0.25;
            lateralDriftM = driftRate * dt; // meters
        }

        // Forward displacement (longitudinal) + Perpendicular lateral drift (-sin, cos)
        const northDisplacement = distanceIncrement * Math.cos(headingRad) - lateralDriftM * Math.sin(headingRad);
        const eastDisplacement = distanceIncrement * Math.sin(headingRad) + lateralDriftM * Math.cos(headingRad);

        const earthRadius = DR.EARTH_RADIUS_M || 6371000;
        const deltaLatDeg = (northDisplacement / earthRadius) * C.RAD_TO_DEG;
        const latRad = this.position.lat * C.DEG_TO_RAD;
        const deltaLonDeg = (eastDisplacement / (earthRadius * Math.cos(latRad))) * C.RAD_TO_DEG;

        if (this.navigationMode === 'DEAD_RECKONING') {
            // Pure dead reckoning propagation with accumulated drift
            this.position.lat += deltaLatDeg;
            this.position.lon += deltaLonDeg;
        } else if (isGnssAvail) {
            // When GNSS available: update position to GNSS
            this.position.lat = gnssData.lat;
            this.position.lon = gnssData.lon;
        } else {
            this.position.lat += deltaLatDeg;
            this.position.lon += deltaLonDeg;
        }

        // 7. DR vs GNSS Error & Drift Calculation
        if (isGnssAvail && this.referencePosition) {
            this.positionErrorMeters = NavDR.Geo ? NavDR.Geo.haversine(this.position.lat, this.position.lon, this.referencePosition.lat, this.referencePosition.lon) : 0;
        } else if (this._lastKnownGnssPosition) {
            this.positionErrorMeters = NavDR.Geo ? NavDR.Geo.haversine(this.position.lat, this.position.lon, this._lastKnownGnssPosition.lat, this._lastKnownGnssPosition.lon) : 0;
        }

        if (this.travelledDistanceM > 0) {
            this.driftPercentage = parseFloat(((this.positionErrorMeters / this.travelledDistanceM) * 100).toFixed(2));
        } else {
            this.driftPercentage = 0;
        }

        // 8. Confidence Score Calculation (0-100)
        this._calculateConfidence(processedData);

        // 9. Trajectory Recording
        const now = performance.now();
        const trajInterval = DR.TRAJECTORY_INTERVAL_MS || 100;
        if (now - this._lastTrajectoryTime >= trajInterval) {
            this._lastTrajectoryTime = now;
            this.drTrajectory.push({
                lat: this.position.lat,
                lon: this.position.lon,
                timestamp: Date.now(),
                speedMps: this.currentSpeedMps,
                heading: this.heading
            });

            const maxPoints = DR.MAX_TRAJECTORY_POINTS || 3000;
            if (this.drTrajectory.length > maxPoints) {
                this.drTrajectory.shift();
            }
        }
    },

    /**
     * Compute DR Confidence Score (0-100)
     */
    _calculateConfidence(processedData) {
        let score = 100;

        if (processedData) {
            // Quality deduction
            score -= (100 - processedData.sensorQuality) * 0.35;

            // Calibration deduction
            if (processedData.calibrationStatus !== 'COMPLETE') score -= 15;

            // Shock deduction
            if (processedData.shockDetected) score -= 10;
        }

        // Outage duration deduction
        if (this.navigationMode === 'DEAD_RECKONING') {
            const outageSec = (performance.now() - this._outageStartTime) / 1000;
            score -= Math.min(40, outageSec * 1.2);
        }

        score = Math.max(0, Math.min(100, Math.round(score)));
        this.confidenceScore = score;

        if (score >= 90) this.confidenceScoreLabel = 'GOOD';
        else if (score >= 70) this.confidenceScoreLabel = 'FAIR';
        else this.confidenceScoreLabel = 'POOR';
    },

    /**
     * Get Complete State Object adhering to requirement #15
     */
    getState() {
        return {
            navigationMode: this.navigationMode,
            position: {
                lat: parseFloat(this.position.lat.toFixed(6)),
                lon: parseFloat(this.position.lon.toFixed(6))
            },
            currentSpeedMps: parseFloat(this.currentSpeedMps.toFixed(2)),
            currentSpeedKmh: parseFloat(this.currentSpeedKmh.toFixed(1)),
            heading: parseFloat(this.heading.toFixed(1)),
            headingRate: parseFloat(this.headingRate.toFixed(2)),
            travelledDistanceM: parseFloat(this.travelledDistanceM.toFixed(1)),
            travelledDistanceKm: parseFloat(this.travelledDistanceKm.toFixed(3)),
            positionErrorMeters: parseFloat(this.positionErrorMeters.toFixed(1)),
            driftPercentage: parseFloat(this.driftPercentage.toFixed(2)),
            confidenceScore: this.confidenceScore,
            confidenceScoreLabel: this.confidenceScoreLabel,
            isStationary: this.isStationary,
            stationaryConstraintActive: this.stationaryConstraintActive,
            motionQuality: this.motionQuality,
            headingSource: this.headingSource,
            gnssAvailable: this.navigationMode === 'GNSS' || this.navigationMode === 'GNSS_RECOVERY'
        };
    },

    /**
     * Get Recorded DR Trajectory
     */
    getTrajectory() {
        return this.drTrajectory;
    }
};
