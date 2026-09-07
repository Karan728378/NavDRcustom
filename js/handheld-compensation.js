/* ═══════════════════════════════════════════════════════
   NavDR — Handheld Phone Motion Compensation Module
   Detects device-only motion (rotation, tilt, handling)
   and protects vehicle-frame heading during GNSS outage.
   ═══════════════════════════════════════════════════════ */

NavDR.HandheldCompensation = {
    // Configuration parameters
    config: {
        CONFIDENCE_ALPHA: 0.15,           // EMA smoothing factor for confidence
        CONF_POSSIBLE_THRESHOLD: 0.30,   // Threshold for POSSIBLE_HANDHELD (30%)
        CONF_DETECTED_THRESHOLD: 0.60,   // Threshold for HANDHELD_DETECTED (60%)
        CONF_CLEAR_THRESHOLD: 0.20,      // Threshold to return to NORMAL (20%)
        DEBOUNCE_HOLD_MS: 1500,          // Hold state for at least 1.5s
        MAX_VEHICLE_YAW_RATE_RAD: 0.35,  // Max realistic vehicle yaw rate (~20 deg/s)
        GYRO_NON_YAW_WEIGHT: 0.40,       // Weight of roll/pitch gyro in handheld detection
        GYRO_YAW_JUMP_WEIGHT: 0.35,      // Weight of sudden yaw rate discrepancy
        ACCEL_JITTER_WEIGHT: 0.25,       // Weight of linear acceleration jitter
    },

    // Module State
    enabled: true,
    handheldConfidence: 0,             // 0.0 to 1.0 (0% to 100%)
    status: 'NORMAL',                   // NORMAL | POSSIBLE_HANDHELD | HANDHELD_DETECTED
    headingProtectionStatus: 'STANDBY',// STANDBY | ACTIVE
    vehicleFrameStatus: 'LOCKED',      // LOCKED | TRACKING
    deviceOrientationStatus: 'MOUNTED',// MOUNTED | INDEPENDENT

    // Orientation & Reference tracking
    vehicleHeadingRad: 0,              // Established vehicle heading in world frame (0=N, CW rad)
    deviceYawRad: 0,                   // Raw device yaw heading
    deviceToVehicleOffsetRad: 0,       // Current offset: deviceYaw - vehicleHeading
    compensatedYawRateRad: 0,          // Compensated yaw rate passed to Dead Reckoning

    // Internal metrics & history
    lastStateChangeTime: 0,
    simulatedRotationDeg: 0,           // Injection offset for testing
    rotationalEnergy: 0,
    linearJitter: 0,
    yawRateDiff: 0,

    /**
     * Initialize the module
     */
    initialize() {
        this.reset();
        console.log('[HandheldCompensation] Handheld Phone Motion Compensation Module initialized.');
    },

    /**
     * Reset module state
     */
    reset() {
        this.handheldConfidence = 0;
        this.status = 'NORMAL';
        this.headingProtectionStatus = 'STANDBY';
        this.vehicleFrameStatus = 'LOCKED';
        this.deviceOrientationStatus = 'MOUNTED';
        this.vehicleHeadingRad = 0;
        this.deviceYawRad = 0;
        this.deviceToVehicleOffsetRad = 0;
        this.compensatedYawRateRad = 0;
        this.lastStateChangeTime = 0;
        this.simulatedRotationDeg = 0;
        this.rotationalEnergy = 0;
        this.linearJitter = 0;
        this.yawRateDiff = 0;
    },

    /**
     * Inject simulated phone rotation (in degrees) for testing.
     * @param {number} deg - Degrees of phone rotation to simulate
     */
    injectPhoneRotation(deg) {
        this.simulatedRotationDeg = deg;
        console.log(`[HandheldCompensation] Injected test phone rotation: ${deg}°`);
    },

    /**
     * Update handheld motion analysis and vehicle-frame heading protection.
     * @param {Object} sensorData - Processed sensor data from NavDR.SensorProcessor
     * @param {Object} navState - Current navigation state (gnssAvailable, refHeading, speedKmh, etc.)
     * @param {number} dt - Time delta in seconds
     * @returns {Object} Compensation result containing compensatedYawRate and protectedVehicleHeading
     */
    update(sensorData, navState, dt = 0.1) {
        if (!this.enabled || !sensorData) {
            return {
                compensatedYawRate: sensorData ? (sensorData.gyroscope ? sensorData.gyroscope.z : 0) : 0,
                protectedVehicleHeading: navState ? navState.refHeading : 0,
                handheldConfidence: this.handheldConfidence
            };
        }

        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const gyro = (sensorData.gyroscope && sensorData.gyroscope.filtered) ? sensorData.gyroscope.filtered : (sensorData.gyroscope || { x: 0, y: 0, z: 0 });
        const accel = (sensorData.accelerometer && sensorData.accelerometer.filtered) ? sensorData.accelerometer.filtered : (sensorData.accelerometer || { x: 0, y: 0, z: 9.81 });
        const accelMag = sensorData.accelerometer ? (sensorData.accelerometer.magnitude || 9.81) : 9.81;
        const speedMs = navState ? (navState.speedKmh / 3.6) : 0;
        const gnssAvailable = navState ? navState.gnssAvailable : true;

        // Initialize vehicleHeadingRad if not set
        if (this.vehicleHeadingRad === 0 && navState && navState.refHeading) {
            this.vehicleHeadingRad = navState.refHeading;
        }

        // ── 1. Calculate Rotational Energy & Motion Signals ──
        // Roll & pitch angular rates (wx, wy) represent device tilt/handling rotation that vehicles rarely experience.
        const gyroX = gyro.x || 0;
        const gyroY = gyro.y || 0;
        const gyroZ = gyro.z || 0;
        const nonYawGyro = Math.sqrt(gyroX * gyroX + gyroY * gyroY);

        // Account for injected test phone rotation
        let effectiveYawRate = gyroZ;
        if (Math.abs(this.simulatedRotationDeg) > 0.01) {
            const injectedYawRate = (this.simulatedRotationDeg * Math.PI / 180) / Math.max(0.05, dt);
            effectiveYawRate += injectedYawRate;
            this.simulatedRotationDeg *= 0.82;
            if (Math.abs(this.simulatedRotationDeg) < 0.1) this.simulatedRotationDeg = 0;
        }

        // Expected vehicle yaw rate (from MapMatcher road curvature or GNSS heading rate)
        let expectedVehicleYawRate = 0;
        if (NavDR.MapMatcher && NavDR.MapMatcher.enabled) {
            const mmState = NavDR.MapMatcher.getState();
            if (mmState && mmState.isMatched && mmState.segmentHeading !== null) {
                expectedVehicleYawRate = 0; // Road segments are locally piecewise linear
            }
        }

        // Yaw rate discrepancy between phone reading and expected vehicle motion
        this.yawRateDiff = Math.abs(effectiveYawRate - expectedVehicleYawRate);

        // Linear acceleration jitter (non-gravitational fluctuation)
        const accelJitter = Math.abs(accelMag - 9.81);
        this.rotationalEnergy = nonYawGyro;
        this.linearJitter = accelJitter;

        // ── 2. Calculate Handheld Motion Confidence ──
        // Combine multiple non-single-threshold signals:
        // - Non-yaw gyro (roll/pitch tilt)
        // - Yaw rate jump discrepancy
        // - Acceleration jitter / handling motion
        const nonYawScore = Math.min(1.0, nonYawGyro / 0.6);
        const yawJumpScore = Math.min(1.0, this.yawRateDiff / 0.4);
        const jitterScore = Math.min(1.0, accelJitter / 2.0);

        const rawConfidence = (
            this.config.GYRO_NON_YAW_WEIGHT * nonYawScore +
            this.config.GYRO_YAW_JUMP_WEIGHT * yawJumpScore +
            this.config.ACCEL_JITTER_WEIGHT * jitterScore
        );

        // Smooth confidence using Exponential Moving Average
        this.handheldConfidence += this.config.CONFIDENCE_ALPHA * (rawConfidence - this.handheldConfidence);
        this.handheldConfidence = Math.max(0.0, Math.min(1.0, this.handheldConfidence));

        // ── 3. State Transition with Hysteresis & Debounce ──
        const timeInState = now - this.lastStateChangeTime;

        if (this.handheldConfidence >= this.config.CONF_DETECTED_THRESHOLD) {
            if (this.status !== 'HANDHELD_DETECTED') {
                this.status = 'HANDHELD_DETECTED';
                this.headingProtectionStatus = 'ACTIVE';
                this.deviceOrientationStatus = 'INDEPENDENT';
                this.lastStateChangeTime = now;
                if (NavDR.Notifications) {
                    NavDR.Notifications.show('Handheld Motion Detected — Vehicle Heading Protected', 'warning', 3000);
                }
            }
        } else if (this.handheldConfidence >= this.config.CONF_POSSIBLE_THRESHOLD) {
            if (this.status === 'NORMAL' && timeInState > 200) {
                this.status = 'POSSIBLE_HANDHELD';
                this.headingProtectionStatus = 'STANDBY';
                this.lastStateChangeTime = now;
            }
        } else if (this.handheldConfidence < this.config.CONF_CLEAR_THRESHOLD) {
            if (this.status !== 'NORMAL' && timeInState > this.config.DEBOUNCE_HOLD_MS) {
                this.status = 'NORMAL';
                this.headingProtectionStatus = 'STANDBY';
                this.deviceOrientationStatus = 'MOUNTED';
                this.lastStateChangeTime = now;
            }
        }

        // ── 4. Vehicle Frame Alignment & Heading Protection ──
        if (gnssAvailable && speedMs > 1.5 && this.status === 'NORMAL') {
            // When GNSS is reliable and phone is mounted, align Vehicle Frame to GNSS course
            this.vehicleHeadingRad = navState.refHeading;
            this.vehicleFrameStatus = 'LOCKED';
            this.deviceToVehicleOffsetRad = 0; // Device aligned with vehicle
        } else {
            this.vehicleFrameStatus = 'TRACKING';
        }

        // Calculate compensated yaw rate
        if (this.headingProtectionStatus === 'ACTIVE') {
            // Phone is being handled/rotated: REJECT phone-only rotation!
            if (NavDR.MapMatcher && NavDR.MapMatcher.enabled) {
                const mmState = NavDR.MapMatcher.getState();
                if (mmState && mmState.isMatched && mmState.segmentHeading !== undefined) {
                    const roadHeadingRad = NavDR.Geo ? NavDR.Geo.degreesToRadians(mmState.segmentHeading) : navState.refHeading;
                    const headingError = NavDR.Geo ? NavDR.Geo.normalizeAngleRad(roadHeadingRad - this.vehicleHeadingRad) : 0;
                    this.compensatedYawRateRad = Math.sign(headingError) * Math.min(Math.abs(headingError) / 0.5, 0.08);
                } else {
                    this.compensatedYawRateRad = 0; // Lock heading straight
                }
            } else {
                this.compensatedYawRateRad = 0; // Lock heading straight
            }
        } else {
            // Normal mounted operation: pass actual sensor yaw rate
            this.compensatedYawRateRad = gyro.z;
        }

        // Update protected vehicle heading
        if (NavDR.Geo) {
            this.vehicleHeadingRad = NavDR.Geo.normalizeAngleRad(this.vehicleHeadingRad + this.compensatedYawRateRad * dt);
        }

        return {
            compensatedYawRate: this.compensatedYawRateRad,
            protectedVehicleHeading: this.vehicleHeadingRad,
            handheldConfidence: this.handheldConfidence,
            status: this.status,
            headingProtection: this.headingProtectionStatus
        };
    },

    /**
     * Get current module state for UI & Telemetry
     */
    getState() {
        return {
            enabled: this.enabled,
            handheldConfidence: this.handheldConfidence,
            handheldConfidencePct: Math.round(this.handheldConfidence * 100),
            status: this.status,
            headingProtectionStatus: this.headingProtectionStatus,
            vehicleFrameStatus: this.vehicleFrameStatus,
            deviceOrientationStatus: this.deviceOrientationStatus,
            vehicleHeadingRad: this.vehicleHeadingRad,
            compensatedYawRateRad: this.compensatedYawRateRad,
            rotationalEnergy: this.rotationalEnergy,
            linearJitter: this.linearJitter,
            yawRateDiff: this.yawRateDiff
        };
    }
};
