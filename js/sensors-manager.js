/* ═══════════════════════════════════════════════════════
   NavDR — Sensor Manager
   Hardware Abstraction Layer for IMU Sensor Sources
   Supports: Simulation Mode & Real Device Sensors
   ═══════════════════════════════════════════════════════ */


// ════════════════════════════════════════════════════
// DEVICE SENSORS MODULE
// Reads real smartphone sensor data via browser APIs:
//   - DeviceMotionEvent (accelerometer + gyroscope)
//   - DeviceOrientationEvent (compass heading)
//   - Magnetometer API (Generic Sensor, if available)
// ════════════════════════════════════════════════════

NavDR.DeviceSensors = {
    // Latest readings from device hardware
    accelerometer: { x: 0, y: 0, z: 9.81 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 25, y: 5, z: -40 },
    orientation: { alpha: 0, beta: 0, gamma: 0 },
    timestamp: 0,

    // Availability status
    available: {
        motion: false,
        orientation: false,
        magnetometer: false,
    },

    // Permission state: 'unknown' | 'granted' | 'denied' | 'not-required' | 'unsupported'
    permission: 'unknown',
    active: false,

    // Internal detection flags
    _hasReceivedMotion: false,
    _hasReceivedOrientation: false,
    _onMotionBound: null,
    _onOrientationBound: null,
    _magnetometerSensor: null,
    _detectionTimeout: null,

    /**
     * Check what sensor APIs the browser/device supports.
     * Does NOT request permission — just checks API existence.
     */
    checkAvailability() {
        this.available.motion = 'DeviceMotionEvent' in window;
        this.available.orientation = 'DeviceOrientationEvent' in window;

        // Generic Sensor API — Magnetometer
        try {
            this.available.magnetometer = 'Magnetometer' in window;
        } catch (e) {
            this.available.magnetometer = false;
        }

        // Check if permission API is required (iOS 13+)
        const needsPermission =
            typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function';

        if (!this.available.motion && !this.available.orientation) {
            this.permission = 'unsupported';
        } else if (!needsPermission) {
            // Android / desktop — no explicit permission needed
            this.permission = 'not-required';
        }
        // else leave as 'unknown' until requestPermission() is called
    },

    /**
     * Request sensor permission (required on iOS 13+).
     * On Android/desktop, this resolves immediately.
     * @returns {Promise<string>} 'granted' | 'denied' | 'not-required' | 'unsupported'
     */
    async requestPermission() {
        // Already determined
        if (this.permission === 'not-required' || this.permission === 'unsupported') {
            return this.permission;
        }

        // iOS requires explicit permission
        try {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                const motionPerm = await DeviceMotionEvent.requestPermission();
                if (motionPerm !== 'granted') {
                    this.permission = 'denied';
                    return this.permission;
                }
            }

            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                const orientPerm = await DeviceOrientationEvent.requestPermission();
                if (orientPerm !== 'granted') {
                    this.permission = 'denied';
                    return this.permission;
                }
            }

            this.permission = 'granted';
        } catch (e) {
            console.warn('[NavDR DeviceSensors] Permission request failed:', e);
            this.permission = 'denied';
        }

        return this.permission;
    },

    /**
     * Start listening for device sensor events.
     */
    start() {
        if (this.active) return;

        if (this.permission === 'denied' || this.permission === 'unsupported') {
            console.warn('[NavDR DeviceSensors] Cannot start — permission:', this.permission);
            return;
        }

        this.active = true;
        this._hasReceivedMotion = false;
        this._hasReceivedOrientation = false;

        // Bind handlers
        this._onMotionBound = (e) => this._handleMotion(e);
        this._onOrientationBound = (e) => this._handleOrientation(e);

        window.addEventListener('devicemotion', this._onMotionBound);
        window.addEventListener('deviceorientation', this._onOrientationBound);

        // Try Generic Sensor API for magnetometer
        if (this.available.magnetometer) {
            try {
                this._magnetometerSensor = new Magnetometer({ frequency: 20 });
                this._magnetometerSensor.addEventListener('reading', () => {
                    this.magnetometer.x = this._magnetometerSensor.x || 0;
                    this.magnetometer.y = this._magnetometerSensor.y || 0;
                    this.magnetometer.z = this._magnetometerSensor.z || 0;
                });
                this._magnetometerSensor.addEventListener('error', () => {
                    this.available.magnetometer = false;
                });
                this._magnetometerSensor.start();
            } catch (e) {
                this.available.magnetometer = false;
            }
        }

        // Detection timeout: after 1.5s, check if we actually received data
        this._detectionTimeout = setTimeout(() => {
            // Update availability based on actual data reception
            if (!this._hasReceivedMotion) {
                this.available.motion = false;
            }
            if (!this._hasReceivedOrientation) {
                this.available.orientation = false;
            }
            // Update UI
            NavDR.SensorManager.updateDeviceStatusUI();
        }, 1500);
    },

    /**
     * Stop listening for device sensor events.
     */
    stop() {
        if (!this.active) return;
        this.active = false;

        if (this._onMotionBound) {
            window.removeEventListener('devicemotion', this._onMotionBound);
            this._onMotionBound = null;
        }
        if (this._onOrientationBound) {
            window.removeEventListener('deviceorientation', this._onOrientationBound);
            this._onOrientationBound = null;
        }
        if (this._magnetometerSensor) {
            try { this._magnetometerSensor.stop(); } catch (e) { /* ignore */ }
            this._magnetometerSensor = null;
        }
        if (this._detectionTimeout) {
            clearTimeout(this._detectionTimeout);
            this._detectionTimeout = null;
        }
    },

    /**
     * Handle DeviceMotionEvent — provides accelerometer + gyroscope.
     */
    _handleMotion(e) {
        this._hasReceivedMotion = true;
        this.timestamp = e.timeStamp || Date.now();

        // Accelerometer (with gravity)
        const accel = e.accelerationIncludingGravity || e.acceleration;
        if (accel) {
            this.accelerometer.x = accel.x || 0;
            this.accelerometer.y = accel.y || 0;
            this.accelerometer.z = accel.z || 0;
        }

        // Gyroscope (rotation rate)
        const rot = e.rotationRate;
        if (rot) {
            // DeviceMotionEvent rotationRate is in deg/s — convert to rad/s
            this.gyroscope.x = (rot.beta || 0) * NavDR.Config.DEG_TO_RAD;
            this.gyroscope.y = (rot.gamma || 0) * NavDR.Config.DEG_TO_RAD;
            this.gyroscope.z = (rot.alpha || 0) * NavDR.Config.DEG_TO_RAD;
        }
    },

    /**
     * Handle DeviceOrientationEvent — provides compass heading.
     */
    _handleOrientation(e) {
        this._hasReceivedOrientation = true;

        this.orientation.alpha = e.alpha || 0; // compass heading (0-360)
        this.orientation.beta = e.beta || 0;   // front-back tilt (-180 to 180)
        this.orientation.gamma = e.gamma || 0; // left-right tilt (-90 to 90)

        // Derive approximate magnetometer from orientation if no hardware magnetometer
        if (!this.available.magnetometer && this._hasReceivedOrientation) {
            const heading = (e.alpha || 0) * NavDR.Config.DEG_TO_RAD;
            const magStrength = 47; // µT — approximate for India
            const inclination = -0.7; // radians
            this.magnetometer.x = magStrength * Math.cos(inclination) * Math.cos(heading);
            this.magnetometer.y = magStrength * Math.cos(inclination) * Math.sin(heading);
            this.magnetometer.z = magStrength * Math.sin(inclination);
        }
    },

    /**
     * Reset to default values.
     */
    reset() {
        this.stop();
        this.accelerometer = { x: 0, y: 0, z: 9.81 };
        this.gyroscope = { x: 0, y: 0, z: 0 };
        this.magnetometer = { x: 25, y: 5, z: -40 };
        this.orientation = { alpha: 0, beta: 0, gamma: 0 };
        this._hasReceivedMotion = false;
        this._hasReceivedOrientation = false;
    }
};


// ════════════════════════════════════════════════════
// SENSOR MANAGER
// Unified interface that abstracts the sensor source.
// The navigation engine uses this instead of raw sensors.
//
// Architecture:
//   SensorManager
//        ↓
//   Sensor Source
//    ↙       ↘
// Simulation  Real Device
//    ↓          ↓
// Accel / Gyro / Mag
//        ↓
// Sensor Normalization
//        ↓
// Navigation Engine
// ════════════════════════════════════════════════════

NavDR.SensorManager = {
    // Current source: 'simulation' | 'device'
    source: 'simulation',

    // Unified normalized output — same shape as NavDR.Sensors
    accelerometer: { x: 0, y: 0, z: 9.81 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 25, y: 5, z: -40 },

    /**
     * Switch sensor source.
     * @param {'simulation'|'device'} newSource
     */
    async setSource(newSource) {
        if (newSource === this.source) return;

        if (newSource === 'device') {
            // Check availability first
            NavDR.DeviceSensors.checkAvailability();

            // Request permission if needed
            const perm = await NavDR.DeviceSensors.requestPermission();
            if (perm === 'denied') {
                NavDR.Notifications.show(
                    'Sensor permission denied — falling back to Simulation mode',
                    'warning', 4000
                );
                this.updateSourceUI('simulation');
                this.updateDeviceStatusUI();
                return;
            }
            if (perm === 'unsupported') {
                NavDR.Notifications.show(
                    'Device sensors not available on this browser — using Simulation mode',
                    'warning', 4000
                );
                this.updateSourceUI('simulation');
                this.updateDeviceStatusUI();
                return;
            }

            // Start device sensors
            NavDR.DeviceSensors.start();
            this.source = 'device';
            NavDR.Notifications.show(
                'Switched to Real Device sensor mode',
                'info', 3000
            );
        } else {
            // Switch back to simulation
            NavDR.DeviceSensors.stop();
            this.source = 'simulation';
            NavDR.Notifications.show(
                'Switched to Simulation sensor mode',
                'info', 3000
            );
        }

        this.updateSourceUI(this.source);
        this.updateDeviceStatusUI();
    },

    /**
     * Update sensor readings for current tick.
     * Called from the simulation loop. In simulation mode, delegates
     * to NavDR.Sensors. In device mode, reads from NavDR.DeviceSensors.
     *
     * @param {number} speedMs - Vehicle speed m/s (used by simulation)
     * @param {number} heading - Vehicle heading rad (used by simulation)
     * @param {number} dt - Time step seconds (used by simulation)
     */
    update(speedMs, heading, dt) {
        if (this.source === 'simulation') {
            // Delegate to existing simulation engine
            NavDR.Sensors.update(speedMs, heading, dt);
            // Copy references
            this.accelerometer = NavDR.Sensors.accelerometer;
            this.gyroscope = NavDR.Sensors.gyroscope;
            this.magnetometer = NavDR.Sensors.magnetometer;
        } else {
            // Read from device hardware (already updated via event listeners)
            this.accelerometer = NavDR.DeviceSensors.accelerometer;
            this.gyroscope = NavDR.DeviceSensors.gyroscope;
            this.magnetometer = NavDR.DeviceSensors.magnetometer;
        }
    },

    /**
     * Get accelerometer vector magnitude.
     */
    getAccelMagnitude() {
        const a = this.accelerometer;
        return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    },

    /**
     * Get gyroscope vector magnitude.
     */
    getGyroMagnitude() {
        const g = this.gyroscope;
        return Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    },

    /**
     * Reset all sensor sources.
     */
    reset() {
        NavDR.Sensors.reset();
        NavDR.DeviceSensors.reset();
        this.source = 'simulation';
        this.accelerometer = { x: 0, y: 0, z: 9.81 };
        this.gyroscope = { x: 0, y: 0, z: 0 };
        this.magnetometer = { x: 25, y: 5, z: -40 };
        this.updateSourceUI('simulation');
    },

    // ────────────────────────────────────────────────
    // UI Updates
    // ────────────────────────────────────────────────

    /**
     * Update the sensor source toggle buttons and header indicator.
     */
    updateSourceUI(source) {
        const simBtn = document.getElementById('btn-source-sim');
        const devBtn = document.getElementById('btn-source-device');
        const indicator = document.getElementById('sensor-source-indicator');
        const statusPanel = document.getElementById('device-sensor-status');
        const imuTag = document.getElementById('imu-source-tag');

        if (!simBtn) return; // DOM not ready

        if (source === 'simulation') {
            simBtn.classList.add('active');
            devBtn.classList.remove('active');
            if (indicator) {
                indicator.textContent = 'SIMULATION MODE';
                indicator.className = 'header-badge source-sim';
            }
            if (statusPanel) statusPanel.classList.add('hidden');
            if (imuTag) {
                imuTag.textContent = 'Simulated Data';
                imuTag.className = 'sim-tag';
            }
        } else {
            simBtn.classList.remove('active');
            devBtn.classList.add('active');
            if (indicator) {
                indicator.textContent = 'REAL DEVICE MODE';
                indicator.className = 'header-badge source-device';
            }
            if (statusPanel) statusPanel.classList.remove('hidden');
            if (imuTag) {
                imuTag.textContent = 'Real Device';
                imuTag.className = 'sim-tag device-tag';
            }
        }
    },

    /**
     * Update device sensor status panel.
     */
    updateDeviceStatusUI() {
        const ds = NavDR.DeviceSensors;

        const setStatus = (id, available) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = available ? 'AVAILABLE' : 'UNAVAILABLE';
            el.className = 'ds-status ' + (available ? 'ds-available' : 'ds-unavailable');
        };

        const permEl = document.getElementById('ds-permission');
        if (permEl) {
            const permText = ds.permission.toUpperCase().replace('-', ' ');
            permEl.textContent = permText;
            const isOk = ds.permission === 'granted' || ds.permission === 'not-required';
            permEl.className = 'ds-status ' + (isOk ? 'ds-available' : 'ds-unavailable');
        }

        setStatus('ds-accel', ds.available.motion && ds._hasReceivedMotion);
        setStatus('ds-gyro', ds.available.motion && ds._hasReceivedMotion);
        setStatus('ds-orient', ds.available.orientation && ds._hasReceivedOrientation);
        setStatus('ds-magnetometer', ds.available.magnetometer);
    },

    /**
     * Initialize — check availability and set default UI state.
     */
    initialize() {
        NavDR.DeviceSensors.checkAvailability();
        this.updateSourceUI('simulation');
        this.updateDeviceStatusUI();
    }
};
