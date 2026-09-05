/* ═══════════════════════════════════════════════════════
   IDRN — AI/ML Speed & Motion Estimator
   SIH 2026 Problem Statement 26168
   ═══════════════════════════════════════════════════════ */

window.IDRN = window.IDRN || {};

IDRN.AIMotionEstimator = {
    // ── Module State ──
    enabled: true,
    _running: true,
    modelStatus: 'READY', // 'READY' | 'RUNNING' | 'LOW_CONFIDENCE' | 'FALLBACK' | 'DISABLED'
    modelName: 'Prototype On-Device Speed Estimation Model',

    // Estimated Output
    estimatedSpeedMps: 0,
    estimatedSpeedKmh: 0,
    speedConfidence: 92,
    speedConfidenceLevel: 'HIGH', // 'HIGH' | 'MEDIUM' | 'LOW'
    motionState: 'STATIONARY',    // 'STATIONARY' | 'ACCELERATING' | 'CRUISING' | 'DECELERATING' | 'ROUGH_ROAD' | 'TURNING'

    // Diagnostics & Performance
    referenceSpeedMps: 0,
    referenceAvailable: false,
    speedErrorMps: 0,
    speedErrorPercentage: 0,
    inferenceTimeMs: 0.5,
    vibrationPenalty: 0,
    shockAffected: false,
    featureCount: 14,
    timestamp: 0,

    // Cumulative Evaluation Metrics (Simulation Evaluation)
    sampleCount: 0,
    _sumAbsError: 0,
    _sumSqError: 0,
    maeMps: 0,
    rmseMps: 0,

    // Sliding Window & Buffer
    sensorWindow: [],
    datasetBuffer: [],
    _lastInferenceTime: 0,
    _prevEstimatedSpeed: 0,

    /**
     * Initialize AIMotionEstimator engine
     */
    initialize() {
        this.enabled = IDRN.Config.AI_MODEL ? IDRN.Config.AI_MODEL.ENABLED : true;
        this.reset();
        console.log('[AIMotionEstimator] Prototype On-Device Speed Estimation Model initialized.');
    },

    /**
     * Start model inference
     */
    start() {
        this._running = true;
    },

    /**
     * Stop model inference
     */
    stop() {
        this._running = false;
    },

    /**
     * Reset estimator state
     */
    reset() {
        this.modelStatus = 'READY';
        this.estimatedSpeedMps = 0;
        this.estimatedSpeedKmh = 0;
        this.speedConfidence = 92;
        this.speedConfidenceLevel = 'HIGH';
        this.motionState = 'STATIONARY';
        this.referenceSpeedMps = 0;
        this.referenceAvailable = false;
        this.speedErrorMps = 0;
        this.speedErrorPercentage = 0;
        this.inferenceTimeMs = 0.4;
        this.vibrationPenalty = 0;
        this.shockAffected = false;
        this.sampleCount = 0;
        this._sumAbsError = 0;
        this._sumSqError = 0;
        this.maeMps = 0;
        this.rmseMps = 0;
        this.sensorWindow = [];
        this.datasetBuffer = [];
        this._lastInferenceTime = performance.now();
        this._prevEstimatedSpeed = 0;
    },

    /**
     * Enable or Disable AI Speed Estimator
     */
    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) {
            this.modelStatus = 'DISABLED';
        }
        if (IDRN.Notifications) {
            IDRN.Notifications.show(`AI Speed Estimation: ${this.enabled ? 'ENABLED' : 'DISABLED'}`, 'info', 2000);
        }
    },

    /**
     * Extract 14 statistical features from sliding sample window
     */
    extractFeatures(processedSensorData, drState, gnssData) {
        if (!processedSensorData) return null;

        const windowMs = IDRN.Config.AI_MODEL ? IDRN.Config.AI_MODEL.AI_FEATURE_WINDOW_MS : 1500;
        const now = performance.now();

        // Push current sample into sliding window
        const fwdAccel = processedSensorData.vehicleFrameAcceleration ? processedSensorData.vehicleFrameAcceleration.forward : 0;
        const latAccel = processedSensorData.vehicleFrameAcceleration ? processedSensorData.vehicleFrameAcceleration.lateral : 0;
        const vertAccel = processedSensorData.vehicleFrameAcceleration ? processedSensorData.vehicleFrameAcceleration.vertical : 9.81;
        const gyroZ = processedSensorData.gyroscope ? processedSensorData.gyroscope.filtered.z : 0;

        this.sensorWindow.push({
            timestamp: now,
            fwdAccel,
            latAccel,
            vertAccel,
            gyroZ,
            accelMag: processedSensorData.accelerometer ? processedSensorData.accelerometer.magnitude : 9.81,
            gyroMag: processedSensorData.gyroscope ? processedSensorData.gyroscope.magnitude : 0
        });

        // Evict samples older than windowMs
        while (this.sensorWindow.length > 0 && (now - this.sensorWindow[0].timestamp) > windowMs) {
            this.sensorWindow.shift();
        }

        const N = this.sensorWindow.length;
        if (N < 3) return null; // Require at least 3 samples

        // 1. Forward Acceleration Mean, Variance, RMS
        let sumFwd = 0, sumFwdSq = 0, sumLatSq = 0, sumVertSq = 0;
        let sumGyroMag = 0, sumGyroSq = 0, sumAccelMag = 0;

        for (let i = 0; i < N; i++) {
            const s = this.sensorWindow[i];
            sumFwd += s.fwdAccel;
            sumFwdSq += s.fwdAccel * s.fwdAccel;
            sumLatSq += s.latAccel * s.latAccel;
            sumVertSq += s.vertAccel * s.vertAccel;
            sumGyroMag += s.gyroMag;
            sumGyroSq += s.gyroMag * s.gyroMag;
            sumAccelMag += s.accelMag;
        }

        const fwdAccelMean = sumFwd / N;
        const fwdAccelVar = Math.max(0, (sumFwdSq / N) - (fwdAccelMean * fwdAccelMean));
        const fwdAccelRMS = Math.sqrt(sumFwdSq / N);

        const latAccelRMS = Math.sqrt(sumLatSq / N);
        const vertAccelRMS = Math.sqrt(sumVertSq / N);

        const accelMag = sumAccelMag / N;
        const gyroMag = sumGyroMag / N;
        const gyroVar = Math.max(0, (sumGyroSq / N) - (gyroMag * gyroMag));

        const yawRate = this.sensorWindow[N - 1].gyroZ;

        // Categorical & Indicator Features
        const vibLevel = processedSensorData.vibrationLevel;
        const vibCode = vibLevel === 'HIGH' ? 2 : (vibLevel === 'MEDIUM' ? 1 : 0);
        const shockCode = processedSensorData.shockDetected ? 1.0 : 0.0;

        const prevSpeed = this._prevEstimatedSpeed;
        const prevAccel = N >= 2 ? (this.sensorWindow[N - 1].fwdAccel - this.sensorWindow[N - 2].fwdAccel) : 0;
        const quality = processedSensorData.sensorQuality || 90;

        // Return feature array of 14 elements
        this._latestFeatures = [
            fwdAccelMean,
            fwdAccelVar,
            fwdAccelRMS,
            latAccelRMS,
            vertAccelRMS,
            accelMag,
            gyroMag,
            gyroVar,
            yawRate,
            vibCode,
            shockCode,
            prevSpeed,
            prevAccel,
            quality
        ];
        return this._latestFeatures;
    },

    /**
     * Perform Model Inference (Speed Regression & Motion Classification)
     */
    predict(features, dt = 0.15) {
        if (!features || features.length !== 14) return null;

        const C = IDRN.Config.AI_MODEL || {};
        const weights = C.FEATURE_WEIGHTS || [0.85, -0.15, 0.40, -0.20, -0.10, 0.30, -0.25, -0.15, -0.05, -0.10, -0.30, 0.90, 0.20, 0.15];
        const bias = C.FEATURE_BIAS || 0.12;
        const mean = C.NORM_MEAN || [0.0, 0.05, 0.2, 0.1, 9.81, 9.81, 0.02, 0.001, 0.0, 0.5, 0.0, 5.0, 0.0, 85.0];
        const std = C.NORM_STD || [1.5, 0.20, 0.5, 0.4, 1.50, 1.50, 0.10, 0.010, 0.2, 0.8, 0.5, 8.0, 1.0, 15.0];

        // 1. Z-Score Feature Normalization
        const zFeatures = new Array(14);
        for (let i = 0; i < 14; i++) {
            zFeatures[i] = (features[i] - mean[i]) / (std[i] + 1e-5);
        }

        const fwdAccel = features[0];
        const prevSpeed = features[11];
        const gyroZ = Math.abs(features[8]);
        const vibCode = features[9];
        const shockDetected = features[10] > 0.5;
        const sensorQuality = features[13];

        // Kinematic forward velocity integration from IMU forward acceleration mean
        const dtSafe = Math.max(0.02, Math.min(0.5, dt));
        let kinSpeed = prevSpeed + fwdAccel * dtSafe;
        if (kinSpeed < 0) kinSpeed = 0;

        // Linear feature dot product
        let rawOutput = bias;
        for (let i = 0; i < 14; i++) {
            rawOutput += zFeatures[i] * weights[i];
        }

        // Combine kinematic integration and ML regression feature
        let predSpeed = 0.75 * kinSpeed + 0.25 * Math.max(0, kinSpeed + rawOutput * 0.2);

        // Stationarity hard constraint: stationary when accel mean < 0.08, gyroZ < 0.04, prevSpeed < 0.2
        if (Math.abs(fwdAccel) < 0.08 && gyroZ < 0.04 && prevSpeed < 0.2) {
            predSpeed = 0;
        }

        const maxSpeed = C.MAX_SPEED_MPS || 60;
        predSpeed = Math.max(0, Math.min(maxSpeed, predSpeed));

        // 4. Motion State Classification
        let motionState = 'CRUISING';

        if (shockDetected || vibCode === 2) {
            motionState = 'ROUGH_ROAD';
        } else if (predSpeed < 0.3 && Math.abs(fwdAccel) < 0.1) {
            motionState = 'STATIONARY';
        } else if (gyroZ > 0.12) { // Yaw rate > ~7 deg/s
            motionState = 'TURNING';
        } else if (fwdAccel > 0.35) {
            motionState = 'ACCELERATING';
        } else if (fwdAccel < -0.35) {
            motionState = 'DECELERATING';
        } else {
            motionState = 'CRUISING';
        }

        // 5. Confidence Score Calculation
        let vibPenalty = vibCode === 2 ? 18 : (vibCode === 1 ? 6 : 0);
        this.vibrationPenalty = vibPenalty;
        this.shockAffected = shockDetected;

        let conf = sensorQuality - vibPenalty;
        if (shockDetected) {
            conf -= 30; // Reduce confidence during road shock
        }
        conf = Math.max(30, Math.min(98, Math.round(conf)));

        return {
            estimatedSpeedMps: parseFloat(predSpeed.toFixed(2)),
            speedConfidence: conf,
            motionState
        };
    },

    /**
     * Main AI Estimator Update Loop (called every tick from app.js)
     */
    update(processedSensorData, drState, gnssData, dt) {
        if (!this._running || !this.enabled) {
            this.modelStatus = 'DISABLED';
            return this.getState();
        }

        const tStart = performance.now();
        const C = IDRN.Config.AI_MODEL || {};
        const intervalMs = C.AI_INFERENCE_INTERVAL_MS || 150;

        // Check if inference interval elapsed
        const dtInference = (tStart - this._lastInferenceTime) / 1000;
        if (this._lastInferenceTime > 0 && (tStart - this._lastInferenceTime < intervalMs) && this.sensorWindow.length > 3) {
            return this.getState();
        }

        // 1. Extract Features
        const features = this.extractFeatures(processedSensorData, drState, gnssData);

        if (!features) {
            this.modelStatus = 'FALLBACK';
            if (IDRN.Notifications && this._prevStatus !== 'FALLBACK') {
                IDRN.Notifications.show('AI Speed Estimation Unavailable — DR Speed Fallback Active', 'warning', 3000);
            }
            this._prevStatus = 'FALLBACK';
            return this.getState();
        }

        // 2. Perform Inference
        const pred = this.predict(features, dtInference > 0 ? dtInference : 0.15);

        if (!pred) {
            this.modelStatus = 'FALLBACK';
            return this.getState();
        }

        const tEnd = performance.now();
        this.inferenceTimeMs = parseFloat(Math.max(0.1, tEnd - tStart).toFixed(2));

        // 3. Confidence-Aware Temporal Smoothing
        const alpha = C.AI_SPEED_SMOOTHING || 0.25;
        const confWeight = pred.speedConfidence / 100;
        const effectiveAlpha = alpha * confWeight;

        const smoothedSpeed = this._prevEstimatedSpeed + effectiveAlpha * (pred.estimatedSpeedMps - this._prevEstimatedSpeed);
        this.estimatedSpeedMps = parseFloat(Math.max(0, smoothedSpeed).toFixed(2));
        this.estimatedSpeedKmh = parseFloat((this.estimatedSpeedMps * 3.6).toFixed(1));
        this._prevEstimatedSpeed = this.estimatedSpeedMps;

        this.speedConfidence = pred.speedConfidence;
        this.speedConfidenceLevel = this.speedConfidence >= 85 ? 'HIGH' : (this.speedConfidence >= 65 ? 'MEDIUM' : 'LOW');
        this.motionState = pred.motionState;

        this.modelStatus = this.speedConfidence < 65 ? 'LOW_CONFIDENCE' : 'RUNNING';

        // 4. Ground-Truth Reference Evaluation (Simulation Mode)
        if (gnssData && gnssData.speedMps !== undefined) {
            this.referenceAvailable = true;
            this.referenceSpeedMps = parseFloat(gnssData.speedMps.toFixed(2));
            this.speedErrorMps = parseFloat(Math.abs(this.estimatedSpeedMps - this.referenceSpeedMps).toFixed(2));

            if (this.referenceSpeedMps > 0.5) {
                this.speedErrorPercentage = parseFloat(((this.speedErrorMps / this.referenceSpeedMps) * 100).toFixed(1));
            } else {
                this.speedErrorPercentage = 0;
            }

            // Cumulative Evaluation Metrics
            this.sampleCount++;
            this._sumAbsError += this.speedErrorMps;
            this._sumSqError += this.speedErrorMps * this.speedErrorMps;
            this.maeMps = parseFloat((this._sumAbsError / this.sampleCount).toFixed(2));
            this.rmseMps = parseFloat(Math.sqrt(this._sumSqError / this.sampleCount).toFixed(2));
        } else {
            this.referenceAvailable = false;
        }

        // 5. Store in Feature Dataset Export Buffer (up to 1000 records)
        if (this.datasetBuffer.length < 1000) {
            this.datasetBuffer.push({
                timestamp: Date.now(),
                features: [...features],
                referenceSpeedMps: this.referenceSpeedMps,
                motionState: this.motionState,
                sensorQuality: processedSensorData ? processedSensorData.sensorQuality : 90
            });
        }

        this._lastInferenceTime = tStart;
        this.timestamp = Date.now();
        return this.getState();
    },

    /**
     * Get Model Information
     */
    getModelInfo() {
        return {
            name: this.modelName,
            type: 'Lightweight Feature Regression',
            inference: 'On-Device JavaScript',
            features: 14,
            trainingStatus: 'Prototype / Evaluation'
        };
    },

    /**
     * Get Current Features Array
     */
    getFeatures() {
        if (this._latestFeatures) return this._latestFeatures;
        const N = this.sensorWindow.length;
        if (N === 0) return new Array(14).fill(0);
        const last = this.sensorWindow[N - 1];
        return [
            last.fwdAccel || 0,
            0,
            Math.abs(last.fwdAccel || 0),
            Math.abs(last.latAccel || 0),
            Math.abs(last.vertAccel || 9.81),
            last.accelMag || 9.81,
            last.gyroMag || 0,
            0,
            last.gyroZ || 0,
            this.vibrationPenalty > 0 ? 1 : 0,
            this.shockAffected ? 1 : 0,
            this.estimatedSpeedMps,
            0,
            95
        ];
    },

    /**
     * Export Feature Dataset as CSV File
     */
    exportDataset() {
        if (this.datasetBuffer.length === 0) {
            if (IDRN.Notifications) {
                IDRN.Notifications.show('No feature samples captured yet to export', 'warning', 2500);
            }
            return;
        }

        let csv = 'timestamp,fwd_accel_mean,fwd_accel_var,fwd_accel_rms,lat_accel_rms,vert_accel_rms,accel_mag,gyro_mag,gyro_var,yaw_rate,vib_level,shock,prev_speed,prev_accel,quality,reference_speed,motion_state\n';

        this.datasetBuffer.forEach(row => {
            csv += `${row.timestamp},${row.features.join(',')},${row.referenceSpeedMps},${row.motionState},${row.sensorQuality}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'idrn_ai_features_dataset.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (IDRN.Notifications) {
            IDRN.Notifications.show(`Exported ${this.datasetBuffer.length} AI Feature records to CSV`, 'success', 3000);
        }
    },

    /**
     * Get State Object
     */
    getState() {
        return {
            enabled: this.enabled,
            modelStatus: this.modelStatus,
            modelName: this.modelName,
            estimatedSpeedMps: this.estimatedSpeedMps,
            estimatedSpeedKmh: this.estimatedSpeedKmh,
            speedConfidence: this.speedConfidence,
            speedConfidenceLevel: this.speedConfidenceLevel,
            motionState: this.motionState,
            referenceSpeedMps: this.referenceSpeedMps,
            referenceSpeedKmh: parseFloat((this.referenceSpeedMps * 3.6).toFixed(1)),
            speedErrorMps: this.speedErrorMps,
            speedErrorPercentage: this.speedErrorPercentage,
            referenceAvailable: this.referenceAvailable,
            featureCount: this.featureCount,
            inferenceTimeMs: this.inferenceTimeMs,
            vibrationPenalty: this.vibrationPenalty,
            shockAffected: this.shockAffected,
            sampleCount: this.sampleCount,
            maeMps: this.maeMps,
            rmseMps: this.rmseMps,
            timestamp: this.timestamp
        };
    }
};
