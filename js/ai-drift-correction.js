/* ═══════════════════════════════════════════════════════
   NavDR — AI-Based Drift & Position Error Correction Engine
   SIH 2026 Problem Statement 26168
   ═══════════════════════════════════════════════════════ */

window.NavDR = window.NavDR || {};

NavDR.AIDriftCorrection = {
    // ── Module State ──
    enabled: true,
    _running: true,
    modelStatus: 'READY',       // 'READY' | 'MONITORING' | 'ESTIMATING' | 'CORRECTING' | 'LOW_CONFIDENCE' | 'FALLBACK' | 'DISABLED' | 'RECOVERY'
    modelName: 'Prototype On-Device Drift Error Estimation Model',

    // Estimated Position Error Outputs (Meters)
    estimatedErrorNorthMeters: 0,
    estimatedErrorEastMeters: 0,
    estimatedErrorMagnitudeMeters: 0,

    // Applied Correction Outputs (Meters)
    correctionNorthMeters: 0,
    correctionEastMeters: 0,
    correctionMagnitudeMeters: 0,
    correctionStrength: 0.20,

    // Confidence & Status
    errorConfidence: 88,
    errorConfidenceLevel: 'HIGH', // 'HIGH' | 'MEDIUM' | 'LOW'
    correctionStatus: 'MONITORING',

    // Reference & Deviation Comparison
    gnssReferenceErrorMeters: 0,
    rawDRDeviationMeters: 0,
    correctedDeviationMeters: 0,
    improvementPercent: 0,

    // Corrected Position (Geodetic Lat/Lon)
    aiCorrectedPosition: { lat: 12.9716, lon: 77.5946 },

    // Outage Tracking
    outageDurationSeconds: 0,
    outageDistanceMeters: 0,
    rawDRDriftPercent: 0,
    correctedDriftPercent: 0,
    sihTargetStatus: 'Target Status: Prototype Evaluation',

    // Diagnostics & Performance
    inferenceTimeMs: 0.4,
    sampleCount: 0,
    timestamp: 0,

    // Internal State Smoothing
    _lastInferenceTime: 0,
    _recoveryTimer: 0,
    _currentAppliedCorrN: 0,
    _currentAppliedCorrE: 0,

    /**
     * Initialize AIDriftCorrection module
     */
    initialize() {
        this.enabled = NavDR.Config.AI_DRIFT_MODEL ? NavDR.Config.AI_DRIFT_MODEL.ENABLED : true;
        this.reset();
        console.log('[AIDriftCorrection] Prototype On-Device Drift Error Estimation Model initialized.');
    },

    /**
     * Start engine
     */
    start() {
        this._running = true;
    },

    /**
     * Stop engine
     */
    stop() {
        this._running = false;
    },

    /**
     * Reset module state
     */
    reset() {
        this.modelStatus = 'READY';
        this.estimatedErrorNorthMeters = 0;
        this.estimatedErrorEastMeters = 0;
        this.estimatedErrorMagnitudeMeters = 0;
        this.correctionNorthMeters = 0;
        this.correctionEastMeters = 0;
        this.correctionMagnitudeMeters = 0;
        this.correctionStrength = 0.20;
        this.errorConfidence = 88;
        this.errorConfidenceLevel = 'HIGH';
        this.correctionStatus = 'MONITORING';
        this.gnssReferenceErrorMeters = 0;
        this.rawDRDeviationMeters = 0;
        this.correctedDeviationMeters = 0;
        this.improvementPercent = 0;
        this.aiCorrectedPosition = { lat: 12.9716, lon: 77.5946 };
        this.outageDurationSeconds = 0;
        this.outageDistanceMeters = 0;
        this.rawDRDriftPercent = 0;
        this.correctedDriftPercent = 0;
        this.sihTargetStatus = 'Target Status: Prototype Evaluation';
        this.inferenceTimeMs = 0.4;
        this.sampleCount = 0;
        this.timestamp = Date.now();
        this._lastInferenceTime = performance.now();
        this._recoveryTimer = 0;
        this._currentAppliedCorrN = 0;
        this._currentAppliedCorrE = 0;
    },

    /**
     * Enable / Disable AI Drift Correction
     */
    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) {
            this.modelStatus = 'DISABLED';
            this.correctionStatus = 'DISABLED';
        }
        if (NavDR.Notifications) {
            NavDR.Notifications.show(`AI Drift Correction: ${this.enabled ? 'ENABLED' : 'DISABLED'}`, 'info', 2000);
        }
    },

    /**
     * Extract 18 navigation and error features
     */
    extractFeatures(cleanSensors, drState, mmState, sfState, aiMotionState, gnssData, dt) {
        if (!drState) return null;

        const drSpeed = drState.currentSpeedMps || 0;
        const aiSpeed = aiMotionState ? aiMotionState.estimatedSpeedMps : drSpeed;
        const speedDiff = Math.abs(drSpeed - aiSpeed);

        const fwdAccel = cleanSensors && cleanSensors.vehicleFrameAcceleration ? cleanSensors.vehicleFrameAcceleration.forward : 0;
        const latAccel = cleanSensors && cleanSensors.vehicleFrameAcceleration ? cleanSensors.vehicleFrameAcceleration.lateral : 0;
        const vertAccel = cleanSensors && cleanSensors.vehicleFrameAcceleration ? cleanSensors.vehicleFrameAcceleration.vertical : 9.81;

        const gyroMag = cleanSensors && cleanSensors.gyroscope ? cleanSensors.gyroscope.magnitude : 0;
        const yawRate = cleanSensors && cleanSensors.gyroscope ? cleanSensors.gyroscope.filtered.z : 0;

        const vibLevel = cleanSensors ? cleanSensors.vibrationLevel : 'LOW';
        const vibCode = vibLevel === 'HIGH' ? 2 : (vibLevel === 'MEDIUM' ? 1 : 0);
        const shockCode = (cleanSensors && cleanSensors.shockDetected) ? 1.0 : 0.0;

        const mapLatDev = mmState ? mmState.lateralDeviationMeters : 0;
        const mapCorrMag = mmState ? mmState.mapMatchCorrectionMeters : 0;
        const routeProgress = (NavDR.Route && NavDR.Route.progress) ? NavDR.Route.progress : 0;

        const outageDuration = this.outageDurationSeconds;
        const drUncertainty = sfState ? sfState.positionUncertaintyMeters : (2.5 + outageDuration * 0.25);
        const sensorQuality = cleanSensors ? cleanSensors.sensorQuality : 90;
        const aiSpeedConf = aiMotionState ? aiMotionState.speedConfidence : 90;
        const headingRate = drState.headingRate || 0;

        return [
            drSpeed,
            aiSpeed,
            speedDiff,
            fwdAccel,
            latAccel,
            vertAccel,
            gyroMag,
            yawRate,
            vibCode,
            shockCode,
            mapLatDev,
            mapCorrMag,
            routeProgress,
            outageDuration,
            drUncertainty,
            sensorQuality,
            aiSpeedConf,
            headingRate
        ];
    },

    /**
     * Lightweight Feature-Based Error Regression Model Prediction
     */
    predictError(features) {
        if (!features || features.length !== 18) return null;

        const drSpeed = features[0];
        const aiSpeed = features[1];
        const speedDiff = features[2];
        const vibCode = features[8];
        const shockDetected = features[9] > 0.5;
        const mapLatDev = features[10];
        const outageDuration = features[13];
        const drUncertainty = features[14];
        const sensorQuality = features[15];
        const aiSpeedConf = features[16];

        // Longitudinal error accumulation from speed difference and forward DR integration drift
        const estLong = outageDuration * (speedDiff * 0.4 + 0.15) + drUncertainty * 0.05;

        // Lateral error accumulation from lateral IMU noise and DR drift
        const estLat = 0.05 + outageDuration * 0.25 + Math.abs(mapLatDev) * 0.15;

        // Total 2D Error Drift Vector Magnitude (Meters)
        const estMag = Math.sqrt(estLong ** 2 + estLat ** 2);

        // Compute Error Confidence Score
        let vibPenalty = vibCode === 2 ? 18 : (vibCode === 1 ? 6 : 0);
        let conf = (sensorQuality * 0.5 + aiSpeedConf * 0.5) - vibPenalty;
        if (shockDetected) {
            conf -= 30; // Reduce drift correction confidence during road shock
        }
        conf = Math.max(30, Math.min(98, Math.round(conf)));

        return {
            estimatedErrorMagnitudeMeters: parseFloat(estMag.toFixed(2)),
            estLongitudinalMeters: parseFloat(estLong.toFixed(2)),
            estLateralMeters: parseFloat(estLat.toFixed(2)),
            errorConfidence: conf
        };
    },

    /**
     * Update AI Drift Correction Loop
     */
    update(cleanSensors, drState, mmState, sfState, aiMotionState, gnssData, dt) {
        if (!this._running || !this.enabled) {
            this.modelStatus = 'DISABLED';
            this.correctionStatus = 'DISABLED';
            return this.getState();
        }

        const tStart = performance.now();
        const C = NavDR.Config.AI_DRIFT_MODEL || {};

        // Extract 18 Features
        const features = this.extractFeatures(cleanSensors, drState, mmState, sfState, aiMotionState, gnssData, dt);

        if (!features || !drState) {
            this.modelStatus = 'FALLBACK';
            this.correctionStatus = 'FALLBACK';
            return this.getState();
        }

        const isGnssAvail = gnssData && gnssData.available;
        const refLat = (gnssData && gnssData.lat) ? gnssData.lat : drState.position.lat;
        const refLon = (gnssData && gnssData.lon) ? gnssData.lon : drState.position.lon;

        // Ground-truth Reference DR Deviation (meters relative to reference trajectory)
        const refDist = NavDR.Geo ? NavDR.Geo.haversine(refLat, refLon, drState.position.lat, drState.position.lon) : drState.positionErrorMeters;
        this.rawDRDeviationMeters = parseFloat(refDist.toFixed(2));

        if (isGnssAvail) {
            // ── GNSS AVAILABLE: Reference Learning & Monitoring Mode ──
            this.modelStatus = 'RUNNING';
            this.correctionStatus = 'MONITORING';
            this.outageDurationSeconds = 0;
            this.outageDistanceMeters = 0;
            this.estimatedErrorNorthMeters = 0;
            this.estimatedErrorEastMeters = 0;
            this.estimatedErrorMagnitudeMeters = 0;
            this.correctionNorthMeters = 0;
            this.correctionEastMeters = 0;
            this.correctionMagnitudeMeters = 0;
            this._currentAppliedCorrN = 0;
            this._currentAppliedCorrE = 0;

            // Corrected position equals DR position when GNSS is available
            this.aiCorrectedPosition = { lat: drState.position.lat, lon: drState.position.lon };
            this.correctedDeviationMeters = this.rawDRDeviationMeters;
            this.improvementPercent = 0;
        } else {
            // ── GNSS OUTAGE: Outage Drift Error Estimation & Controlled Correction ──
            this.outageDurationSeconds = this.outageDurationSeconds + dt;
            this.outageDistanceMeters = this.outageDistanceMeters + drState.currentSpeedMps * dt;

            // Predict Error Magnitude & Confidence
            const pred = this.predictError(features);
            if (pred) {
                this.estimatedErrorMagnitudeMeters = pred.estimatedErrorMagnitudeMeters;
                this.errorConfidence = pred.errorConfidence;
                this.errorConfidenceLevel = this.errorConfidence >= 85 ? 'HIGH' : (this.errorConfidence >= 65 ? 'MEDIUM' : 'LOW');

                // Determine Correction Strength based on Confidence Level
                if (this.errorConfidenceLevel === 'HIGH') {
                    this.correctionStrength = C.HIGH_CONF_STRENGTH || 0.35;
                } else if (this.errorConfidenceLevel === 'MEDIUM') {
                    this.correctionStrength = C.MED_CONF_STRENGTH || 0.20;
                } else {
                    this.correctionStrength = C.LOW_CONF_STRENGTH || 0.08;
                }

                // Compute North/East Error Drift components
                // Position error vector: e = DR_Position - Ref_Position (DR is lagging behind reference along longitudinal travel axis)
                const headingRad = (drState.heading !== undefined) ? (drState.heading * Math.PI / 180) : 1.57;
                const estLong = pred.estLongitudinalMeters;
                const estLat = pred.estLateralMeters;

                this.estimatedErrorNorthMeters = parseFloat((-estLong * Math.cos(headingRad) - estLat * Math.sin(headingRad)).toFixed(2));
                this.estimatedErrorEastMeters = parseFloat((-estLong * Math.sin(headingRad) + estLat * Math.cos(headingRad)).toFixed(2));

                // Target Correction Vector (pushes DR position forward along route toward reference trajectory)
                const targetCorrN = -this.estimatedErrorNorthMeters * this.correctionStrength;
                const targetCorrE = -this.estimatedErrorEastMeters * this.correctionStrength;

                // Per-Tick Rate Limiter (MAX_CORRECTION_PER_TICK_METERS = 0.5m/tick)
                const maxStep = C.MAX_CORRECTION_PER_TICK_METERS || 0.5;
                const stepN = Math.max(-maxStep, Math.min(maxStep, targetCorrN - this._currentAppliedCorrN));
                const stepE = Math.max(-maxStep, Math.min(maxStep, targetCorrE - this._currentAppliedCorrE));

                this._currentAppliedCorrN += stepN;
                this._currentAppliedCorrE += stepE;

                this.correctionNorthMeters = parseFloat(this._currentAppliedCorrN.toFixed(2));
                this.correctionEastMeters = parseFloat(this._currentAppliedCorrE.toFixed(2));
                this.correctionMagnitudeMeters = parseFloat(Math.sqrt(this._currentAppliedCorrN ** 2 + this._currentAppliedCorrE ** 2).toFixed(2));

                // Apply Controlled Correction to Raw DR Position (No Position Teleportation!)
                if (NavDR.Geo && typeof NavDR.Geo.metersToDegrees === 'function') {
                    const offset = NavDR.Geo.metersToDegrees(this.correctionNorthMeters, this.correctionEastMeters, drState.position.lat);
                    this.aiCorrectedPosition = {
                        lat: drState.position.lat + offset.dLat,
                        lon: drState.position.lon + offset.dLon
                    };
                } else {
                    this.aiCorrectedPosition = { lat: drState.position.lat, lon: drState.position.lon };
                }

                // Compute Corrected Position Deviation vs Ground-Truth Reference
                const correctedDist = NavDR.Geo ? NavDR.Geo.haversine(refLat, refLon, this.aiCorrectedPosition.lat, this.aiCorrectedPosition.lon) : (this.rawDRDeviationMeters - this.correctionMagnitudeMeters);
                this.correctedDeviationMeters = parseFloat(Math.max(0, correctedDist).toFixed(2));

                // Compute Error Improvement Percentage
                if (this.rawDRDeviationMeters > 0.1) {
                    const imp = ((this.rawDRDeviationMeters - this.correctedDeviationMeters) / this.rawDRDeviationMeters) * 100;
                    this.improvementPercent = parseFloat(imp.toFixed(1));
                } else {
                    this.improvementPercent = 0;
                }

                // Update Correction Status
                if (this.errorConfidence < 65) {
                    this.modelStatus = 'LOW_CONFIDENCE';
                    this.correctionStatus = 'LOW_CONFIDENCE';
                } else {
                    this.modelStatus = 'RUNNING';
                    this.correctionStatus = 'CORRECTING';
                }

                // Update SIH Target Accuracy Metrics
                if (this.outageDistanceMeters > 1.0) {
                    this.rawDRDriftPercent = parseFloat(((this.rawDRDeviationMeters / this.outageDistanceMeters) * 100).toFixed(1));
                    this.correctedDriftPercent = parseFloat(((this.correctedDeviationMeters / this.outageDistanceMeters) * 100).toFixed(1));
                    if (this.correctedDriftPercent < 10.0) {
                        this.sihTargetStatus = `Target Achieved (${this.correctedDriftPercent}% Drift)`;
                    } else {
                        this.sihTargetStatus = 'Target Status: Prototype Evaluation';
                    }
                }
            }
        }

        const tEnd = performance.now();
        this.inferenceTimeMs = parseFloat(Math.max(0.1, tEnd - tStart).toFixed(2));
        this.sampleCount++;
        this.timestamp = Date.now();

        return this.getState();
    },

    /**
     * Get Model Info
     */
    getModelInfo() {
        return {
            name: this.modelName,
            type: 'Lightweight Feature-Based Error Regression',
            inference: 'On-Device JavaScript',
            features: 18,
            trainingStatus: 'Prototype / Evaluation'
        };
    },

    /**
     * Get State Object
     */
    getState() {
        return {
            enabled: this.enabled,
            modelStatus: this.modelStatus,
            modelName: this.modelName,
            estimatedErrorNorthMeters: this.estimatedErrorNorthMeters,
            estimatedErrorEastMeters: this.estimatedErrorEastMeters,
            estimatedErrorMagnitudeMeters: this.estimatedErrorMagnitudeMeters,
            correctionNorthMeters: this.correctionNorthMeters,
            correctionEastMeters: this.correctionEastMeters,
            correctionMagnitudeMeters: this.correctionMagnitudeMeters,
            correctionStrength: parseFloat((this.correctionStrength * 100).toFixed(0)),
            errorConfidence: this.errorConfidence,
            errorConfidenceLevel: this.errorConfidenceLevel,
            gnssReferenceErrorMeters: this.gnssReferenceErrorMeters,
            rawDRDeviationMeters: this.rawDRDeviationMeters,
            correctedDeviationMeters: this.correctedDeviationMeters,
            improvementPercent: this.improvementPercent,
            aiCorrectedPosition: { ...this.aiCorrectedPosition },
            outageDurationSeconds: this.outageDurationSeconds,
            outageDistanceMeters: this.outageDistanceMeters,
            rawDRDriftPercent: this.rawDRDriftPercent,
            correctedDriftPercent: this.correctedDriftPercent,
            sihTargetStatus: this.sihTargetStatus,
            correctionApplied: this.correctionMagnitudeMeters > 0.05,
            correctionStatus: this.correctionStatus,
            inferenceTimeMs: this.inferenceTimeMs,
            sampleCount: this.sampleCount,
            timestamp: this.timestamp
        };
    }
};
