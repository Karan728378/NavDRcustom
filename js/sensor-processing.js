/* ═══════════════════════════════════════════════════════
   IDRN — Sensor Processing Module
   Calibration, Bias Estimation, Low-Pass Filtering,
   Vehicle Alignment, Vibration Analysis, Shock Detection, Quality Score
   ═══════════════════════════════════════════════════════ */

window.IDRN = window.IDRN || {};

IDRN.SensorProcessor = {
    // ── Calibration State ──
    isCalibrating: false,
    calibrationProgress: 0, // 0 to 100%
    calibrationStatus: 'UNINITIALIZED', // 'UNINITIALIZED' | 'CALIBRATING' | 'COMPLETE'
    _calibrationSamples: [],
    _calibrationStartTime: 0,

    // Estimated Biases & Baselines
    bias: {
        accel: { x: 0, y: 0, z: 0 },
        gyro: { x: 0, y: 0, z: 0 },
        mag: { x: 0, y: 0, z: 0 },
        noiseBaseline: 0.15,
    },

    // ── Raw vs Filtered Storage ──
    rawAccel: { x: 0, y: 0, z: 9.81 },
    rawGyro: { x: 0, y: 0, z: 0 },
    rawMag: { x: 25, y: 5, z: -40 },
    rawAccelMag: 9.81,
    rawGyroMag: 0,

    filteredAccel: { x: 0, y: 0, z: 9.81 },
    filteredGyro: { x: 0, y: 0, z: 0 },
    filteredMag: { x: 25, y: 5, z: -40 },
    filteredAccelMag: 9.81,
    filteredGyroMag: 0,

    // ── Orientation & Vehicle Alignment ──
    orientation: { pitch: 0, roll: 0, yaw: 0 }, // degrees
    vehicleFrameAcceleration: { forward: 0, lateral: 0, vertical: 9.81 },

    // ── Vibration & Noise Component ──
    vibrationLevel: 'LOW', // 'LOW' | 'MEDIUM' | 'HIGH'
    vibrationIntensity: 0.1,
    _vibHistory: [],

    // ── Road Shock / Pothole Detection ──
    shockDetected: false,
    lastShock: null, // { timestamp, magnitude, intensity }
    _shockClearTimer: null,

    // ── Sensor Quality Score ──
    sensorQuality: 92,
    sensorQualityLabel: 'GOOD', // 'GOOD' | 'FAIR' | 'POOR'

    /**
     * Start the 3-second sensor calibration process.
     */
    startCalibration() {
        if (this.isCalibrating) return;
        this.isCalibrating = true;
        this.calibrationProgress = 0;
        this.calibrationStatus = 'CALIBRATING';
        this._calibrationSamples = [];
        this._calibrationStartTime = performance.now();

        if (IDRN.Notifications) {
            IDRN.Notifications.show('Sensor calibration started — hold device steady', 'info', 3000);
        }
    },

    /**
     * Main processing loop called every tick (from app.js tick loop).
     * @param {number} dt - Delta time in seconds
     */
    process(dt) {
        this._tickCount = (this._tickCount || 0) + 1;
        const C = IDRN.Config;
        const rawSensors = IDRN.SensorManager;

        // 1. Store Raw Readings
        this.rawAccel = { ...rawSensors.accelerometer };
        this.rawGyro = { ...rawSensors.gyroscope };
        this.rawMag = { ...rawSensors.magnetometer };

        this.rawAccelMag = Math.sqrt(
            this.rawAccel.x ** 2 + this.rawAccel.y ** 2 + this.rawAccel.z ** 2
        );
        this.rawGyroMag = Math.sqrt(
            this.rawGyro.x ** 2 + this.rawGyro.y ** 2 + this.rawGyro.z ** 2
        );

        // 2. Handle Calibration if Active
        if (this.isCalibrating) {
            this._stepCalibration();
        }

        // 3. Remove Estimated Bias
        const unbiasedAccel = {
            x: this.rawAccel.x - this.bias.accel.x,
            y: this.rawAccel.y - this.bias.accel.y,
            z: this.rawAccel.z - this.bias.accel.z,
        };
        const unbiasedGyro = {
            x: this.rawGyro.x - this.bias.gyro.x,
            y: this.rawGyro.y - this.bias.gyro.y,
            z: this.rawGyro.z - this.bias.gyro.z,
        };
        const unbiasedMag = {
            x: this.rawMag.x - this.bias.mag.x,
            y: this.rawMag.y - this.bias.mag.y,
            z: this.rawMag.z - this.bias.mag.z,
        };

        // 4. Digital Filter (Exponential Moving Average / Low-Pass Filter)
        const alpha = C.FILTER_ALPHA || 0.22;
        this.filteredAccel.x += alpha * (unbiasedAccel.x - this.filteredAccel.x);
        this.filteredAccel.y += alpha * (unbiasedAccel.y - this.filteredAccel.y);
        this.filteredAccel.z += alpha * (unbiasedAccel.z - this.filteredAccel.z);

        this.filteredGyro.x += alpha * (unbiasedGyro.x - this.filteredGyro.x);
        this.filteredGyro.y += alpha * (unbiasedGyro.y - this.filteredGyro.y);
        this.filteredGyro.z += alpha * (unbiasedGyro.z - this.filteredGyro.z);

        this.filteredMag.x += alpha * (unbiasedMag.x - this.filteredMag.x);
        this.filteredMag.y += alpha * (unbiasedMag.y - this.filteredMag.y);
        this.filteredMag.z += alpha * (unbiasedMag.z - this.filteredMag.z);

        this.filteredAccelMag = Math.sqrt(
            this.filteredAccel.x ** 2 + this.filteredAccel.y ** 2 + this.filteredAccel.z ** 2
        );
        this.filteredGyroMag = Math.sqrt(
            this.filteredGyro.x ** 2 + this.filteredGyro.y ** 2 + this.filteredGyro.z ** 2
        );

        // 5. Device Orientation & Vehicle Alignment (Prototype Alignment)
        this._updateAlignment();

        // 6. High-Frequency Noise & Vibration Analysis
        this._updateVibrationAnalysis();

        // 7. Pothole / Shock Detection
        this._detectShocks();

        // 8. Calculate Sensor Quality Score
        this._calculateQualityScore();
    },

    /**
     * Calibration sample collection step
     */
    _stepCalibration() {
        const C = IDRN.Config;
        const elapsed = performance.now() - this._calibrationStartTime;
        const totalDuration = C.CALIBRATION_DURATION_MS || 3000;

        this.calibrationProgress = Math.min(100, Math.round((elapsed / totalDuration) * 100));

        this._calibrationSamples.push({
            accel: { ...this.rawAccel },
            gyro: { ...this.rawGyro },
            mag: { ...this.rawMag },
        });

        if (elapsed >= totalDuration) {
            this._finishCalibration();
        }
    },

    /**
     * Calculate bias and noise baselines from collected samples
     */
    _finishCalibration() {
        const n = this._calibrationSamples.length;
        if (n === 0) return;

        let sumAx = 0, sumAy = 0, sumAz = 0;
        let sumGx = 0, sumGy = 0, sumGz = 0;
        let sumMx = 0, sumMy = 0, sumMz = 0;

        for (const s of this._calibrationSamples) {
            sumAx += s.accel.x;
            sumAy += s.accel.y;
            sumAz += s.accel.z;

            sumGx += s.gyro.x;
            sumGy += s.gyro.y;
            sumGz += s.gyro.z;

            sumMx += s.mag.x;
            sumMy += s.mag.y;
            sumMz += s.mag.z;
        }

        const meanAx = sumAx / n;
        const meanAy = sumAy / n;
        const meanAz = sumAz / n;

        // Gravity on Z axis = 9.81 m/s² when resting upright
        this.bias.accel = {
            x: parseFloat(meanAx.toFixed(4)),
            y: parseFloat(meanAy.toFixed(4)),
            z: parseFloat((meanAz - 9.81).toFixed(4)),
        };

        this.bias.gyro = {
            x: parseFloat((sumGx / n).toFixed(4)),
            y: parseFloat((sumGy / n).toFixed(4)),
            z: parseFloat((sumGz / n).toFixed(4)),
        };

        this.bias.mag = {
            x: parseFloat((sumMx / n).toFixed(2)),
            y: parseFloat((sumMy / n).toFixed(2)),
            z: parseFloat((sumMz / n).toFixed(2)),
        };

        // Calculate variance / noise baseline
        let varSum = 0;
        for (const s of this._calibrationSamples) {
            const dev = Math.sqrt(
                (s.accel.x - meanAx) ** 2 +
                (s.accel.y - meanAy) ** 2 +
                (s.accel.z - meanAz) ** 2
            );
            varSum += dev * dev;
        }
        this.bias.noiseBaseline = parseFloat(Math.sqrt(varSum / n).toFixed(3));

        this.isCalibrating = false;
        this.calibrationProgress = 100;
        this.calibrationStatus = 'COMPLETE';

        if (IDRN.Notifications) {
            IDRN.Notifications.show('Calibration Complete — Sensor biases zeroed', 'success', 3500);
        }
    },

    /**
     * Estimate pitch, roll, yaw and transform to vehicle coordinate frame
     */
    _updateAlignment() {
        const C = IDRN.Config;
        const ax = this.filteredAccel.x;
        const ay = this.filteredAccel.y;
        const az = this.filteredAccel.z;

        // Roll (rotation around X) & Pitch (rotation around Y)
        const rollRad = Math.atan2(ay, az);
        const pitchRad = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));

        // Yaw from magnetometer or vehicle direction
        const mx = this.filteredMag.x;
        const my = this.filteredMag.y;
        const yawRad = Math.atan2(my, mx);

        this.orientation.roll = parseFloat((rollRad * C.RAD_TO_DEG).toFixed(1));
        this.orientation.pitch = parseFloat((pitchRad * C.RAD_TO_DEG).toFixed(1));
        this.orientation.yaw = parseFloat((((yawRad * C.RAD_TO_DEG) + 360) % 360).toFixed(1));

        // Transform Device Frame -> Vehicle Frame Acceleration
        // Vehicle Frame: forward = longitudinal (X), lateral = transverse (Y), vertical = normal (Z)
        this.vehicleFrameAcceleration = {
            forward: parseFloat(ax.toFixed(3)),
            lateral: parseFloat(ay.toFixed(3)),
            vertical: parseFloat(az.toFixed(3)),
        };
    },

    /**
     * Compute residual high-frequency noise & classify vibration level
     */
    _updateVibrationAnalysis() {
        const C = IDRN.Config;
        const diff = Math.abs(this.rawAccelMag - this.filteredAccelMag);

        this._vibHistory.push(diff);
        if (this._vibHistory.length > 20) this._vibHistory.shift();

        const avgVib = this._vibHistory.reduce((a, b) => a + b, 0) / this._vibHistory.length;
        this.vibrationIntensity = parseFloat(avgVib.toFixed(3));

        const lowThresh = C.VIBRATION_THRESHOLD_LOW || 0.3;
        const highThresh = C.VIBRATION_THRESHOLD_HIGH || 0.9;

        if (avgVib > highThresh) {
            this.vibrationLevel = 'HIGH';
        } else if (avgVib > lowThresh) {
            this.vibrationLevel = 'MEDIUM';
        } else {
            this.vibrationLevel = 'LOW';
        }
    },

    /**
     * Direct demo trigger for manual shock button
     */
    triggerManualShock(magnitude = 8.5) {
        console.log('[SensorProcessing] Manual road shock triggered');

        const rawMag = parseFloat((Math.sqrt(this.rawAccel.x ** 2 + this.rawAccel.y ** 2 + (9.81 + magnitude) ** 2)).toFixed(2));
        const intensity = parseFloat(magnitude.toFixed(2));

        this.shockDetected = true;
        this.lastShock = {
            timestamp: new Date().toLocaleTimeString(),
            magnitude: rawMag,
            intensity: intensity,
        };

        console.log('[SensorProcessing] Shock detected:', this.lastShock);

        if (IDRN.Notifications) {
            IDRN.Notifications.show(
                `⚠️ ROAD SHOCK DETECTED (Magnitude: ${rawMag} m/s²)`,
                'warning',
                2500
            );
        }

        if (this._shockClearTimer) clearTimeout(this._shockClearTimer);
        this._shockClearTimer = setTimeout(() => {
            console.log('[SensorProcessing] Shock state cleared');
            this.shockDetected = false;
            if (IDRN.SensorProcessingUI) {
                IDRN.SensorProcessingUI.update(this.getProcessedSensorData());
            }
        }, 1500);

        // Immediately update UI
        if (IDRN.SensorProcessingUI) {
            IDRN.SensorProcessingUI.update(this.getProcessedSensorData());
        }
    },

    /**
     * Shock / Pothole Detector
     */
    _detectShocks() {
        const C = IDRN.Config;
        const shockThresh = C.SHOCK_THRESHOLD || 6.5;

        // Skip stream shock detection during initial warm-up ticks
        if (!this._tickCount || this._tickCount < 20) return;

        const deltaAccel = Math.abs(this.rawAccelMag - this.filteredAccelMag);

        if (deltaAccel > shockThresh && !this.shockDetected) {
            console.log('[SensorProcessing] Shock detected from sensor stream deltaAccel:', deltaAccel);
            this.shockDetected = true;
            this.lastShock = {
                timestamp: new Date().toLocaleTimeString(),
                magnitude: parseFloat(this.rawAccelMag.toFixed(2)),
                intensity: parseFloat(deltaAccel.toFixed(2)),
            };

            if (IDRN.Notifications) {
                IDRN.Notifications.show(
                    `⚠️ ROAD SHOCK DETECTED (${deltaAccel.toFixed(1)} m/s²)`,
                    'warning',
                    2500
                );
            }

            if (this._shockClearTimer) clearTimeout(this._shockClearTimer);
            this._shockClearTimer = setTimeout(() => {
                this.shockDetected = false;
                if (IDRN.SensorProcessingUI) {
                    IDRN.SensorProcessingUI.update(this.getProcessedSensorData());
                }
            }, 1500);
        }
    },

    /**
     * Composite Sensor Quality Score (0 - 100)
     */
    _calculateQualityScore() {
        const C = IDRN.Config;
        let score = 100;

        // Deduction for vibration/noise
        if (this.vibrationLevel === 'HIGH') score -= 25;
        else if (this.vibrationLevel === 'MEDIUM') score -= 10;

        // Deduction if uncalibrated
        if (this.calibrationStatus !== 'COMPLETE') score -= 15;

        // Deduction if magnetometer unavailable in real device mode
        if (IDRN.SensorManager.source === 'device' && !IDRN.DeviceSensors.available.orientation) {
            score -= 10;
        }

        // Deduction if shock active
        if (this.shockDetected) score -= 10;

        // Clamp
        score = Math.max(0, Math.min(100, Math.round(score)));
        this.sensorQuality = score;

        const th = C.SENSOR_QUALITY_THRESHOLDS || { GOOD: 90, FAIR: 70 };
        if (score >= th.GOOD) {
            this.sensorQualityLabel = 'GOOD';
        } else if (score >= th.FAIR) {
            this.sensorQualityLabel = 'FAIR';
        } else {
            this.sensorQualityLabel = 'POOR';
        }
    },

    /**
     * Clean Interface adhering to prompt requirement #13
     */
    getProcessedSensorData() {
        return {
            timestamp: Date.now(),
            accelerometer: {
                raw: { ...this.rawAccel },
                filtered: { ...this.filteredAccel },
                magnitude: this.filteredAccelMag,
                rawMagnitude: this.rawAccelMag,
            },
            gyroscope: {
                raw: { ...this.rawGyro },
                filtered: { ...this.filteredGyro },
                magnitude: this.filteredGyroMag,
                rawMagnitude: this.rawGyroMag,
            },
            magnetometer: {
                raw: { ...this.rawMag },
                filtered: { ...this.filteredMag },
            },
            orientation: { ...this.orientation },
            vehicleFrameAcceleration: { ...this.vehicleFrameAcceleration },
            vibrationLevel: this.vibrationLevel,
            vibrationIntensity: this.vibrationIntensity,
            shockDetected: this.shockDetected,
            lastShock: this.lastShock,
            sensorQuality: this.sensorQuality,
            sensorQualityLabel: this.sensorQualityLabel,
            calibrationStatus: this.calibrationStatus,
            bias: { ...this.bias },
        };
    },

    /**
     * Reset processor state
     */
    reset() {
        this.isCalibrating = false;
        this.calibrationProgress = 0;
        this.calibrationStatus = 'UNINITIALIZED';
        this._calibrationSamples = [];

        this.bias = {
            accel: { x: 0, y: 0, z: 0 },
            gyro: { x: 0, y: 0, z: 0 },
            mag: { x: 0, y: 0, z: 0 },
            noiseBaseline: 0.15,
        };

        this.rawAccel = { x: 0, y: 0, z: 9.81 };
        this.rawGyro = { x: 0, y: 0, z: 0 };
        this.rawMag = { x: 25, y: 5, z: -40 };
        this.rawAccelMag = 9.81;
        this.rawGyroMag = 0;

        this.filteredAccel = { x: 0, y: 0, z: 9.81 };
        this.filteredGyro = { x: 0, y: 0, z: 0 };
        this.filteredMag = { x: 25, y: 5, z: -40 };
        this.filteredAccelMag = 9.81;
        this.filteredGyroMag = 0;

        this.vibrationLevel = 'LOW';
        this.vibrationIntensity = 0.1;
        this._vibHistory = [];

        this.shockDetected = false;
        this.lastShock = null;
        if (this._shockClearTimer) clearTimeout(this._shockClearTimer);

        this.sensorQuality = 92;
        this.sensorQualityLabel = 'GOOD';
    }
};
