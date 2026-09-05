/* ═══════════════════════════════════════════════════════
   IDRN — Navigation Engine
   Sensor Simulation, Dead Reckoning, Map Matching, Fusion
   ═══════════════════════════════════════════════════════ */

// ════════════════════════════════════════════════════
// SENSOR SIMULATION MODULE
// Generates realistic simulated IMU data.
// Designed to be replaceable with real smartphone sensors.
// ════════════════════════════════════════════════════

IDRN.Sensors = {
    // Current sensor readings
    accelerometer: { x: 0, y: 0, z: 9.81 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 25, y: 5, z: -40 },

    // Internal state
    _vibrationPhase: 0,
    _prevSpeed: 0,
    _prevHeading: 0,

    // Manual shock trigger for demo
    _pendingShock: 0,
    triggerShock(magnitude = 8.5) {
        console.log('[Sensors] Manual road shock triggered with magnitude:', magnitude.toFixed(2));
        this._pendingShock = magnitude;
        this.accelerometer.z = 9.81 + magnitude;
        this.accelerometer.x += (Math.random() - 0.5) * 3.0;

        if (IDRN.SensorProcessor && typeof IDRN.SensorProcessor.triggerManualShock === 'function') {
            IDRN.SensorProcessor.triggerManualShock(magnitude);
        }
    },

    /**
     * Update sensor readings based on current vehicle state.
     * @param {number} speedMs - Vehicle speed in m/s
     * @param {number} heading - Vehicle heading in radians
     * @param {number} dt - Time step in seconds
     */
    update(speedMs, heading, dt) {
        const C = IDRN.Config;
        const preset = C.NOISE_PRESETS[C.currentNoiseLevel] || C.NOISE_PRESETS.MEDIUM;

        const accelNoise = preset.accel;
        const gyroNoise = preset.gyro;
        const magNoise = preset.mag;
        const vibAmp = preset.vibration;

        // Compute acceleration (speed change)
        const accelForward = (speedMs - this._prevSpeed) / dt;
        this._prevSpeed = speedMs;

        // Compute turn rate (heading change)
        let headingDelta = heading - this._prevHeading;
        // Normalize to [-PI, PI]
        while (headingDelta > Math.PI) headingDelta -= 2 * Math.PI;
        while (headingDelta < -Math.PI) headingDelta += 2 * Math.PI;
        const turnRate = headingDelta / dt;
        this._prevHeading = heading;

        // Vehicle vibration (speed-dependent)
        this._vibrationPhase += (speedMs + 2) * dt * 15;
        const vibX = vibAmp * Math.sin(this._vibrationPhase) * (speedMs / 15 + 0.2);
        const vibY = vibAmp * Math.cos(this._vibrationPhase * 1.3) * (speedMs / 15 + 0.2);
        const vibZ = vibAmp * Math.sin(this._vibrationPhase * 0.7) * (speedMs / 15 + 0.2) * 0.5;

        // Simulated road shock / pothole check
        let shockZ = 0;
        let shockX = 0;
        if (this._pendingShock > 0) {
            shockZ = this._pendingShock;
            shockX = (Math.random() - 0.5) * (this._pendingShock * 0.5);
            this._pendingShock = 0;
        } else if (speedMs > 2 && Math.random() < preset.shockChance) {
            shockZ = 5.0 + Math.random() * 6.0; // 5 - 11 m/s² spike
            shockX = (Math.random() - 0.5) * 4.0;
        }

        // ── Accelerometer (Vehicle Body Frame) ──
        // X = Longitudinal (forward acceleration), Y = Transverse (lateral turning acceleration), Z = Vertical (gravity + shock)
        const centrifugalLat = turnRate * speedMs * 0.5;
        this.accelerometer.x = accelForward + this._noise(accelNoise) + vibX + shockX;
        this.accelerometer.y = centrifugalLat + this._noise(accelNoise) + vibY;
        this.accelerometer.z = 9.81 + this._noise(accelNoise * 0.4) + vibZ + shockZ;

        // ── Gyroscope ──
        // Angular velocity around Z axis (yaw rate in rad/s) from turning + noise
        this.gyroscope.x = this._noise(gyroNoise) + vibX * 0.05;
        this.gyroscope.y = this._noise(gyroNoise) + vibY * 0.05;
        this.gyroscope.z = turnRate + this._noise(gyroNoise);

        // ── Magnetometer ──
        // Simulated Earth's magnetic field rotated by heading + noise
        const magBase = 47; // µT total field strength (India approx)
        const inclination = -0.7; // Radians (magnetic inclination)
        this.magnetometer.x = magBase * Math.cos(inclination) * Math.cos(heading) +
                              this._noise(magNoise);
        this.magnetometer.y = magBase * Math.cos(inclination) * Math.sin(heading) +
                              this._noise(magNoise);
        this.magnetometer.z = magBase * Math.sin(inclination) +
                              this._noise(magNoise * 0.5);
    },

    /**
     * Get the magnitude of the accelerometer reading.
     */
    getAccelMagnitude() {
        const a = this.accelerometer;
        return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    },

    /**
     * Get the magnitude of the gyroscope reading.
     */
    getGyroMagnitude() {
        const g = this.gyroscope;
        return Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    },

    /**
     * Reset sensors to idle state.
     */
    reset() {
        this.accelerometer = { x: 0, y: 0, z: 9.81 };
        this.gyroscope = { x: 0, y: 0, z: 0 };
        this.magnetometer = { x: 25, y: 5, z: -40 };
        this._vibrationPhase = 0;
        this._prevSpeed = 0;
        this._prevHeading = 0;
    },

    /** Generate Gaussian-like noise */
    _noise(amplitude) {
        // Box-Muller approximation using sum of uniform randoms
        return (Math.random() + Math.random() + Math.random() - 1.5) * amplitude * 1.15;
    }
};


// ════════════════════════════════════════════════════
// DEAD RECKONING MODULE
// Estimates vehicle position from IMU-derived speed/heading
// when GNSS is unavailable.
// ════════════════════════════════════════════════════

IDRN.DeadReckoning = {
    // Estimated state
    lat: 0,
    lng: 0,
    heading: 0,         // radians
    speed: 0,           // m/s
    cumulativeDrift: 0,  // meters total accumulated error
    distanceTravelled: 0,

    // Internal drift accumulators
    _headingBias: 0,
    _speedBias: 0,
    _initialized: false,

    /**
     * Initialize dead reckoning from a known position.
     */
    initialize(lat, lng, heading, speed) {
        this.lat = lat;
        this.lng = lng;
        this.heading = heading;
        this.speed = speed;
        this.cumulativeDrift = 0;
        this.distanceTravelled = 0;
        this._headingBias = (Math.random() - 0.5) * IDRN.Config.DR_HEADING_BIAS * 2;
        this._speedBias = (Math.random() - 0.5) * IDRN.Config.DR_SPEED_BIAS * 2;
        this._initialized = true;
    },

    /**
     * Update dead reckoning estimate.
     * @param {number} refHeading - Reference heading (from route) used as base
     * @param {number} refSpeed - Reference speed in m/s
     * @param {number} dt - Time step in seconds
     */
    update(refHeading, refSpeed, dt) {
        if (!this._initialized) return;

        const C = IDRN.Config;

        // AI Speed Estimation (simulated): reference speed + bias + noise
        this.speed = refSpeed * (1 + this._speedBias) +
                     (Math.random() - 0.5) * refSpeed * C.DR_SPEED_NOISE;
        this.speed = Math.max(0, this.speed);

        // Heading estimation: reference heading + accumulated drift + bias + noise
        this._headingBias += (Math.random() - 0.5) * C.DR_HEADING_DRIFT_RATE;
        // Clamp bias to prevent extreme drift
        this._headingBias = Math.max(-0.05, Math.min(0.05, this._headingBias));

        this.heading = refHeading + this._headingBias +
                       (Math.random() - 0.5) * C.DR_HEADING_DRIFT_RATE * 0.5;

        // Compute displacement
        const dist = this.speed * dt;
        this.distanceTravelled += dist;

        // Update position
        const newPos = IDRN.Geo.movePoint(this.lat, this.lng, dist, this.heading);
        this.lat = newPos.lat;
        this.lng = newPos.lng;
    },

    /**
     * Get current estimated position.
     */
    getPosition() {
        return { lat: this.lat, lng: this.lng };
    },

    /**
     * Correct position (for fusion).
     */
    correctPosition(lat, lng) {
        this.lat = lat;
        this.lng = lng;
    },

    /**
     * Reset state.
     */
    reset() {
        this.lat = 0;
        this.lng = 0;
        this.heading = 0;
        this.speed = 0;
        this.cumulativeDrift = 0;
        this.distanceTravelled = 0;
        this._headingBias = 0;
        this._speedBias = 0;
        this._initialized = false;
    }
};


// ════════════════════════════════════════════════════
// MAP MATCHING MODULE
// Constrains estimated position to the road network.
// ════════════════════════════════════════════════════

IDRN.MapMatching = {
    /**
     * Constrain a position toward the nearest road point.
     * @param {number} lat - Estimated latitude
     * @param {number} lng - Estimated longitude
     * @returns {{lat, lng, corrected: boolean, distFromRoad: number}}
     */
    constrain(lat, lng) {
        const C = IDRN.Config;
        const nearest = IDRN.Route.nearestPointOnRoute(lat, lng);

        if (nearest.distance > C.MAP_MATCH_MAX_DIST) {
            // Too far from any road — return uncorrected
            return { lat, lng, corrected: false, distFromRoad: nearest.distance };
        }

        // Blend toward the road with configurable strength
        const strength = C.MAP_MATCH_STRENGTH;
        const corrLat = lat + (nearest.lat - lat) * strength;
        const corrLng = lng + (nearest.lng - lng) * strength;

        return {
            lat: corrLat,
            lng: corrLng,
            corrected: true,
            distFromRoad: IDRN.Geo.haversine(corrLat, corrLng, nearest.lat, nearest.lng)
        };
    }
};


// ════════════════════════════════════════════════════
// GNSS + INS FUSION MODULE
// Combines GNSS reference with dead reckoning estimate.
// ════════════════════════════════════════════════════

IDRN.Fusion = {
    // Fused position output
    lat: 0,
    lng: 0,

    // Internal state
    _correctionProgress: 0,    // 0 to 1 during post-GNSS-restore correction
    _errorAtRestore: 0,        // Position error when GNSS was restored
    _restoreLat: 0,            // DR position at GNSS restore moment
    _restoreLng: 0,
    _isCorrepting: false,

    /**
     * Update fused position.
     * @param {boolean} gnssAvailable - Is GNSS currently available?
     * @param {number} gnssLat - GNSS/reference latitude
     * @param {number} gnssLng - GNSS/reference longitude
     * @param {number} drLat - Dead reckoning latitude
     * @param {number} drLng - Dead reckoning longitude
     * @param {number} dt - Time step in seconds
     */
    update(gnssAvailable, gnssLat, gnssLng, drLat, drLng, dt) {
        if (gnssAvailable) {
            if (this._isCorrepting) {
                // Gradual correction phase after GNSS restore
                this._correctionProgress += IDRN.Config.FUSION_CORRECTION_RATE;
                if (this._correctionProgress >= 1) {
                    this._correctionProgress = 1;
                    this._isCorrepting = false;
                }

                // Smooth interpolation from DR position at restore toward GNSS position
                const t = this._easeInOut(this._correctionProgress);
                this.lat = drLat + (gnssLat - drLat) * t;
                this.lng = drLng + (gnssLng - drLng) * t;
            } else {
                // Normal GNSS mode: use GNSS with slight INS smoothing
                const alpha = 0.85; // GNSS weight
                this.lat = gnssLat * alpha + drLat * (1 - alpha);
                this.lng = gnssLng * alpha + drLng * (1 - alpha);
            }
        } else {
            // No GNSS: rely entirely on dead reckoning (after map matching)
            this.lat = drLat;
            this.lng = drLng;
        }
    },

    /**
     * Called when GNSS is restored — begins correction phase.
     */
    onGNSSRestore(drLat, drLng, gnssLat, gnssLng) {
        this._correctionProgress = 0;
        this._isCorrepting = true;
        this._errorAtRestore = IDRN.Geo.haversine(drLat, drLng, gnssLat, gnssLng);
        this._restoreLat = drLat;
        this._restoreLng = drLng;
    },

    /**
     * Check if still in correction phase.
     */
    isCorrecting() {
        return this._isCorrepting;
    },

    /**
     * Get the correction progress (0-1).
     */
    getCorrectionProgress() {
        return this._correctionProgress;
    },

    /**
     * Reset state.
     */
    reset() {
        this.lat = 0;
        this.lng = 0;
        this._correctionProgress = 0;
        this._errorAtRestore = 0;
        this._isCorrepting = false;
    },

    /** Ease in-out function for smooth correction */
    _easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
};
