/* ═══════════════════════════════════════════════════════
   IDRN — Main Application
   Simulation loop, state management, event handlers
   ═══════════════════════════════════════════════════════ */

// ════════════════════════════════════════════════════
// SIMULATION STATE
// ════════════════════════════════════════════════════

IDRN.Simulation = {
    // State
    running: false,
    paused: false,
    gnssAvailable: true,
    autoGNSSZone: true,      // Auto trigger GNSS loss in denied zone
    finished: false,

    // Vehicle
    speedKmh: IDRN.Config.DEFAULT_SPEED_KMH,
    distanceTravelled: 0,     // meters along route
    elapsedTime: 0,           // seconds

    // Position tracking
    refLat: 0, refLng: 0,     // Reference/GNSS position
    refHeading: 0,
    drLat: 0, drLng: 0,       // Dead reckoning position
    fusedLat: 0, fusedLng: 0, // Fused output position
    positionError: 0,          // meters
    maxDrift: 0,

    // Internal
    _intervalId: null,
    _gnssWasLost: false,       // Track if GNSS has been lost at least once
    _chartUpdateCounter: 0,
    _panCounter: 0,

    /**
     * Start the simulation.
     */
    start() {
        console.log('[UI] Start Simulation button clicked');
        console.log('[Simulation] start() called');

        if (this.running && !this.paused) return;

        if (this.finished) this.reset();

        if (this.paused) {
            // Resume
            this.paused = false;
            this._startLoop();
            this._updateButtons();
            IDRN.Notifications.show('Simulation resumed', 'info', 2000);
            console.log('[Simulation] running:', this.running);
            return;
        }

        // Fresh start
        this.running = true;
        this.paused = false;
        this.finished = false;
        this.gnssAvailable = true;
        this.distanceTravelled = 0;
        this.elapsedTime = 0;
        this.positionError = 0;
        this.maxDrift = 0;
        this._gnssWasLost = false;
        this._manualGNSSOverride = false;
        this._chartUpdateCounter = 0;
        this._panCounter = 0;
        this._firstTickLogged = false;

        // Initialize starting position
        const startPos = IDRN.Route.getAtDistance(0);
        this.refLat = startPos.lat;
        this.refLng = startPos.lng;
        this.refHeading = startPos.heading;
        this.drLat = startPos.lat;
        this.drLng = startPos.lng;
        this.fusedLat = startPos.lat;
        this.fusedLng = startPos.lng;

        // Initialize engine modules
        const startHeadingDeg = IDRN.Geo ? IDRN.Geo.bearingToDegrees(startPos.heading) : 90;
        IDRN.DeadReckoning.initialize(startPos.lat, startPos.lng, startPos.heading, 0);
        if (IDRN.DeadReckoningEngine) {
            IDRN.DeadReckoningEngine.initialize(startPos.lat, startPos.lng, startHeadingDeg, 0);
        }
        try {
            if (IDRN.MapMatcher) {
                IDRN.MapMatcher.initialize();
            }
        } catch (err) {
            console.error('[MapMatcher] Optional initialization error (fallback active):', err);
        }
        if (IDRN.SensorFusion) {
            IDRN.SensorFusion.initialize();
        }
        if (IDRN.HandheldCompensation) {
            IDRN.HandheldCompensation.initialize();
        }
        if (IDRN.AIMotionEstimator) {
            IDRN.AIMotionEstimator.initialize();
        }
        if (IDRN.AIDriftCorrection) {
            IDRN.AIDriftCorrection.initialize();
        }
        if (IDRN.AccuracyBenchmark) {
            IDRN.AccuracyBenchmark.initialize();
        }
        IDRN.SensorManager.reset();
        IDRN.Fusion.reset();
        IDRN.Fusion.lat = startPos.lat;
        IDRN.Fusion.lng = startPos.lng;

        // Initialize UI
        IDRN.Map.clearTrails();
        IDRN.Charts.reset();
        IDRN.Telemetry.reset();
        if (IDRN.HandheldUI) IDRN.HandheldUI.reset();
        if (IDRN.DeadReckoningUI) IDRN.DeadReckoningUI.reset();
        if (IDRN.MapMatchingUI) IDRN.MapMatchingUI.reset();
        if (IDRN.SensorFusionUI) IDRN.SensorFusionUI.reset();
        if (IDRN.AIMotionUI) IDRN.AIMotionUI.reset();
        if (IDRN.AIDriftUI) IDRN.AIDriftUI.reset();
        if (IDRN.AccuracyUI) IDRN.AccuracyUI.reset();
        IDRN.Timeline.setPhase('gnss-on');
        IDRN.PipelineUI.setActiveSteps(['imu', 'calib', 'handheld', 'dr', 'ai', 'mm', 'fusion', 'aidrift', 'benchmark']);

        this._updateButtons();
        this._startLoop();

        console.log('[Simulation] running:', this.running);
        IDRN.Notifications.show('Simulation started — vehicle is moving', 'info', 3000);
    },

    /**
     * Pause the simulation.
     */
    pause() {
        if (!this.running || this.paused) return;
        this.paused = true;
        this._stopLoop();
        this._updateButtons();
        IDRN.Notifications.show('Simulation paused', 'info', 2000);
    },

    /**
     * Reset the simulation to initial state.
     */
    reset() {
        this._stopLoop();
        this.running = false;
        this.paused = false;
        this.finished = false;
        this.gnssAvailable = true;
        this._manualGNSSOverride = false;
        this._firstTickLogged = false;
        this.distanceTravelled = 0;
        this.elapsedTime = 0;
        this.positionError = 0;
        this.maxDrift = 0;
        this.speedKmh = IDRN.Config.DEFAULT_SPEED_KMH;
        this._gnssWasLost = false;

        IDRN.DeadReckoning.reset();
        if (IDRN.DeadReckoningEngine) IDRN.DeadReckoningEngine.reset();
        if (IDRN.MapMatcher) IDRN.MapMatcher.reset();
        if (IDRN.SensorFusion) IDRN.SensorFusion.reset();
        if (IDRN.AIMotionEstimator) IDRN.AIMotionEstimator.reset();
        if (IDRN.AIDriftCorrection) IDRN.AIDriftCorrection.reset();
        if (IDRN.AccuracyBenchmark) IDRN.AccuracyBenchmark.reset();
        IDRN.SensorManager.reset();
        IDRN.SensorProcessor.reset();
        IDRN.DeadReckoning.reset();
        IDRN.Fusion.reset();

        IDRN.Map.clearTrails();
        IDRN.Charts.reset();
        IDRN.Telemetry.reset();
        if (IDRN.DeadReckoningUI) IDRN.DeadReckoningUI.reset();
        if (IDRN.MapMatchingUI) IDRN.MapMatchingUI.reset();
        if (IDRN.SensorFusionUI) IDRN.SensorFusionUI.reset();
        if (IDRN.AIMotionUI) IDRN.AIMotionUI.reset();
        if (IDRN.AIDriftUI) IDRN.AIDriftUI.reset();
        if (IDRN.AccuracyUI) IDRN.AccuracyUI.reset();
        IDRN.Timeline.setPhase('gnss-on');
        IDRN.PipelineUI.setActiveSteps(['imu', 'calib', 'filter', 'vib', 'ai', 'dr', 'aidrift', 'mm', 'fusion', 'benchmark']);

        document.getElementById('speed-display').textContent = this.speedKmh + ' km/h';
        this._updateButtons();
    },

    /**
     * Simulate GNSS signal loss.
     */
    loseGNSS() {
        console.log('[UI] Simulate GNSS Loss button clicked');
        console.log('[GNSS] Manual GNSS loss requested');
        if (this.gnssAvailable) {
            this._manualGNSSOverride = false;
            this._setGNSSLost();
        }
        console.log('[GNSS] GNSS availability:', this.gnssAvailable);
        if (IDRN.DeadReckoningEngine) {
            console.log('[DR] Navigation mode:', IDRN.DeadReckoningEngine.getState().navigationMode);
        }
    },

    /**
     * Restore GNSS signal.
     */
    restoreGNSS() {
        console.log('[UI] Restore GNSS button clicked');
        console.log('[GNSS] Manual GNSS restoration requested');
        if (!this.gnssAvailable) {
            this._manualGNSSOverride = true;
            this._setGNSSRestored();
        }
        console.log('[GNSS] GNSS availability:', this.gnssAvailable);
        if (IDRN.DeadReckoningEngine) {
            console.log('[DR] Navigation mode:', IDRN.DeadReckoningEngine.getState().navigationMode);
        }
    },

    /**
     * Increase vehicle speed.
     */
    increaseSpeed() {
        const C = IDRN.Config;
        this.speedKmh = Math.min(C.MAX_SPEED_KMH, this.speedKmh + C.SPEED_INCREMENT_KMH);
        document.getElementById('speed-display').textContent = this.speedKmh + ' km/h';
    },

    /**
     * Decrease vehicle speed.
     */
    decreaseSpeed() {
        const C = IDRN.Config;
        this.speedKmh = Math.max(C.MIN_SPEED_KMH, this.speedKmh - C.SPEED_INCREMENT_KMH);
        document.getElementById('speed-display').textContent = this.speedKmh + ' km/h';
    },

    // ────────────────────────────────────────────────
    // SIMULATION LOOP
    // ────────────────────────────────────────────────

    _startLoop() {
        this._stopLoop();
        this._intervalId = setInterval(() => this._tick(), IDRN.Config.UPDATE_INTERVAL_MS);
    },

    _stopLoop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    },

    /**
     * Main simulation tick — called every UPDATE_INTERVAL_MS.
     */
    _tick() {
        if (!this.running || this.paused || this.finished) return;

        if (!this._firstTickLogged) {
            console.log('[Simulation] first tick executed');
            this._firstTickLogged = true;
        }

        const C = IDRN.Config;
        const dt = C.UPDATE_INTERVAL_MS / 1000; // seconds
        const speedMs = this.speedKmh / 3.6;    // m/s
        const moveDistance = speedMs * dt;       // meters this tick

        this.elapsedTime += dt;
        this.distanceTravelled += moveDistance;

        // ── Check for route completion ──
        if (this.distanceTravelled >= IDRN.Route.totalLength) {
            this.finished = true;
            this._stopLoop();
            this._updateButtons();
            IDRN.Notifications.show('Simulation complete — vehicle reached destination', 'success', 5000);
            return;
        }

        // ── Get reference position from route ──
        const refPos = IDRN.Route.getAtDistance(this.distanceTravelled);
        const prevRefLat = this.refLat;
        const prevRefLng = this.refLng;
        this.refLat = refPos.lat;
        this.refLng = refPos.lng;
        this.refHeading = refPos.heading;

        // ── Auto GNSS zone logic ──
        if (this.autoGNSSZone) {
            const inDeniedZone = this.distanceTravelled >= IDRN.Route.gnssBlockedDistStart &&
                                  this.distanceTravelled <= IDRN.Route.gnssBlockedDistEnd;

            if (!inDeniedZone) {
                this._manualGNSSOverride = false; // Reset manual override outside blocked zone
            }

            if (inDeniedZone && this.gnssAvailable && !this._manualGNSSOverride) {
                this._setGNSSLost();
            } else if (!inDeniedZone && !this.gnssAvailable && this._gnssWasLost && !this._manualGNSSOverride) {
                this._setGNSSRestored();
            }
        }

        // ── Update raw sensors (via SensorManager abstraction) ──
        IDRN.SensorManager.update(speedMs, this.refHeading, dt);

        // ── Step 3: Sensor Processing (Calibration, Noise Filter, Alignment, Shock Detect) ──
        if (IDRN.SensorProcessor) {
            IDRN.SensorProcessor.process(dt);
        }
        const cleanSensors = IDRN.SensorProcessor ? IDRN.SensorProcessor.getProcessedSensorData() : null;

        // ── Handheld Phone Motion Compensation Update ──
        let handheldRes = null;
        if (IDRN.HandheldCompensation) {
            const navStateForHandheld = {
                gnssAvailable: this.gnssAvailable,
                refHeading: this.refHeading,
                speedKmh: this.speedKmh
            };
            handheldRes = IDRN.HandheldCompensation.update(cleanSensors, navStateForHandheld, dt);
        }

        const refHeadingDeg = IDRN.Geo ? IDRN.Geo.bearingToDegrees(this.refHeading) : 90;
        const gnssData = {
            available: this.gnssAvailable,
            lat: this.refLat,
            lon: this.refLng,
            heading: refHeadingDeg,
            speedMps: speedMs
        };

        // ── Step 7: AI/ML Speed & Motion Estimation Update (Runs BEFORE Dead Reckoning) ──
        if (IDRN.AIMotionEstimator) {
            IDRN.AIMotionEstimator.update(cleanSensors, null, gnssData, dt);
        }
        const aiState = IDRN.AIMotionEstimator ? IDRN.AIMotionEstimator.getState() : null;
        const aiFeatures = IDRN.AIMotionEstimator ? IDRN.AIMotionEstimator.getFeatures() : null;

        // ── Step 4: Dead Reckoning Engine Update (Consumes AI estimated speed) ──
        if (IDRN.DeadReckoningEngine) {
            IDRN.DeadReckoningEngine.update(dt, cleanSensors, gnssData);
        }
        const drState = IDRN.DeadReckoningEngine ? IDRN.DeadReckoningEngine.getState() : null;

        if (drState) {
            this.drLat = drState.position.lat;
            this.drLng = drState.position.lon;
            this.positionError = drState.positionErrorMeters;
            if (!this.gnssAvailable) {
                this.maxDrift = Math.max(this.maxDrift, this.positionError);
            }
        } else {
            // Fallback to legacy DeadReckoning if engine absent
            IDRN.DeadReckoning.update(this.refHeading, speedMs, dt);
            let drPos = IDRN.DeadReckoning.getPosition();
            this.drLat = drPos.lat;
            this.drLng = drPos.lng;
            this.positionError = IDRN.Geo.haversine(this.refLat, this.refLng, this.drLat, this.drLng);
        }

        // ── Fusion Update (blends reference / DR position) ──
        if (IDRN.Fusion) {
            IDRN.Fusion.update(this.gnssAvailable, this.refLat, this.refLng, this.drLat, this.drLng, dt);
            this.fusedLat = IDRN.Fusion.lat;
            this.fusedLng = IDRN.Fusion.lng;
        } else {
            this.fusedLat = this.refLat;
            this.fusedLng = this.refLng;
        }

        // ── Step 5: Offline Map Matching Update ──
        if (IDRN.MapMatcher) {
            IDRN.MapMatcher.update(drState);
        }
        const mmState = IDRN.MapMatcher ? IDRN.MapMatcher.getState() : null;

        // ── Step 6: GNSS + INS Sensor Fusion Update ──
        if (IDRN.SensorFusion) {
            IDRN.SensorFusion.update(gnssData, drState, mmState, cleanSensors, dt);
        }
        const sfState = IDRN.SensorFusion ? IDRN.SensorFusion.getState() : null;

        // ── Navigation Position Selection Architecture (Requirement 24/27) ──
        let displayLat, displayLng;
        if (sfState && sfState.enabled) {
            displayLat = sfState.fusedPosition.lat;
            displayLng = sfState.fusedPosition.lon;
        } else if (this.gnssAvailable) {
            displayLat = this.fusedLat;
            displayLng = this.fusedLng;
        } else if (mmState && mmState.enabled && mmState.status === 'MATCHED') {
            displayLat = mmState.smoothedMatchedPosition.lat;
            displayLng = mmState.smoothedMatchedPosition.lon;
        } else {
            displayLat = this.drLat;
            displayLng = this.drLng;
        }

        // ── Step 8: AI Drift / Position Error Correction Update ──
        if (IDRN.AIDriftCorrection) {
            IDRN.AIDriftCorrection.update(cleanSensors, drState, mmState, sfState, aiState, gnssData, dt);
        }
        const aiDriftState = IDRN.AIDriftCorrection ? IDRN.AIDriftCorrection.getState() : null;

        // ── Step 9: Accuracy Testing & SIH Benchmark Update ──
        if (IDRN.AccuracyBenchmark) {
            IDRN.AccuracyBenchmark.update(dt, cleanSensors, drState, mmState, sfState, aiState, aiDriftState, gnssData);
        }
        const benchState = IDRN.AccuracyBenchmark ? IDRN.AccuracyBenchmark.getState() : null;

        // ── Step 10: Final SIH Demo & Hero Status Update ──
        if (IDRN.SIHDemo) {
            IDRN.SIHDemo.update(dt, drState, mmState, sfState, aiState, aiDriftState, benchState, gnssData);
        }

        // ── Update AI Pipeline Highlights ──
        IDRN.PipelineUI.setActiveSteps(['imu', 'calib', 'filter', 'vib', 'ai', 'dr', 'aidrift', 'mm', 'fusion', 'benchmark']);

        // ── Update Timeline ──
        if (!this.gnssAvailable) {
            IDRN.Timeline.setPhase('dead-reckoning');
        } else if (IDRN.Fusion.isCorrecting()) {
            IDRN.Timeline.setPhase('fusion');
        } else if (this._gnssWasLost) {
            IDRN.Timeline.setPhase('fusion');
        } else {
            IDRN.Timeline.setPhase('gnss-on');
        }

        // ── Update System Health ──
        if (!this.gnssAvailable && this.positionError > 15) {
            IDRN.Telemetry.setHealth('WARNING');
        } else {
            IDRN.Telemetry.setHealth('NORMAL');
        }

        // ── Update Map ──
        const vehicleHeading = sfState && sfState.enabled ? sfState.fusedHeading * (Math.PI / 180) : this.refHeading;
        IDRN.Map.updateVehicle(displayLat, displayLng, vehicleHeading);
        IDRN.Map.addReferenceTrailPoint(this.refLat, this.refLng);

        if (!this.gnssAvailable) {
            IDRN.Map.addDRTrailPoint(this.drLat, this.drLng);
            if (mmState && mmState.enabled && mmState.status === 'MATCHED') {
                IDRN.Map.addMapMatchedTrailPoint(mmState.smoothedMatchedPosition.lat, mmState.smoothedMatchedPosition.lon);
                IDRN.Map.updateCorrectionLine(this.drLat, this.drLng, mmState.smoothedMatchedPosition.lat, mmState.smoothedMatchedPosition.lon);
            } else {
                IDRN.Map.clearCorrectionLine();
            }
        } else {
            IDRN.Map.clearCorrectionLine();
        }

        if (sfState && sfState.enabled) {
            IDRN.Map.addFusedTrailPoint(sfState.fusedPosition.lat, sfState.fusedPosition.lon);
        } else if (IDRN.Fusion.isCorrecting() || this.gnssAvailable) {
            IDRN.Map.addFusedTrailPoint(this.fusedLat, this.fusedLng);
        }

        // Pan map to follow vehicle every N ticks
        this._panCounter++;
        if (this._panCounter % 10 === 0) {
            IDRN.Map.panTo(displayLat, displayLng);
        }

        // ── Update Telemetry & Step 3/4/5 UI ──
        IDRN.Telemetry.setSpeed(drState ? drState.currentSpeedKmh : this.speedKmh);
        IDRN.Telemetry.setPosition(displayLat, displayLng);
        IDRN.Telemetry.setHeading(drState ? drState.heading : refHeadingDeg);
        IDRN.Telemetry.setError(this.positionError);
        IDRN.Telemetry.setDistance(drState ? drState.travelledDistanceM : this.distanceTravelled);
        IDRN.Telemetry.setDrift(this.maxDrift);
        
        if (cleanSensors) {
            IDRN.Telemetry.updateIMU({
                accelerometer: cleanSensors.accelerometer.filtered,
                gyroscope: cleanSensors.gyroscope.filtered,
                magnetometer: cleanSensors.magnetometer.filtered
            });
            if (IDRN.SensorProcessingUI) {
                IDRN.SensorProcessingUI.update(cleanSensors);
            }
        } else {
            IDRN.Telemetry.updateIMU(IDRN.SensorManager);
        }

        if (IDRN.HandheldUI && IDRN.HandheldCompensation) {
            IDRN.HandheldUI.update(IDRN.HandheldCompensation.getState());
        }

        // Update Step 4 DR Dashboard UI
        if (IDRN.DeadReckoningUI && drState) {
            IDRN.DeadReckoningUI.update(drState);
        }

        // Update Step 5 Map Matching UI
        if (IDRN.MapMatchingUI && mmState) {
            IDRN.MapMatchingUI.update(mmState);
        }

        // Update Step 6 Sensor Fusion UI
        if (IDRN.SensorFusionUI && sfState) {
            IDRN.SensorFusionUI.update(sfState);
        }

        // Update Step 7 AI Motion Estimator UI
        if (IDRN.AIMotionUI && aiState) {
            IDRN.AIMotionUI.update(aiState, aiFeatures);
        }

        // Update Step 8 AI Drift Correction UI
        if (IDRN.AIDriftUI && aiDriftState) {
            IDRN.AIDriftUI.update(aiDriftState);
        }

        // Update Step 9 Accuracy & SIH Benchmark UI
        if (IDRN.AccuracyUI && benchState) {
            IDRN.AccuracyUI.update(benchState);
        }

        // ── Update Charts (every 3rd tick for performance) ──
        this._chartUpdateCounter++;
        if (this._chartUpdateCounter % 3 === 0) {
            if (cleanSensors) {
                IDRN.Charts.update(
                    this.speedKmh,
                    this.positionError,
                    cleanSensors.accelerometer.magnitude,
                    cleanSensors.gyroscope.magnitude,
                    cleanSensors.accelerometer.rawMagnitude,
                    cleanSensors.gyroscope.rawMagnitude,
                    drState,
                    mmState,
                    sfState,
                    aiState,
                    aiDriftState,
                    benchState
                );
            } else {
                IDRN.Charts.update(
                    this.speedKmh,
                    this.positionError,
                    IDRN.SensorManager.getAccelMagnitude(),
                    IDRN.SensorManager.getGyroMagnitude(),
                    null,
                    null,
                    drState,
                    mmState,
                    sfState,
                    aiState,
                    aiDriftState,
                    benchState
                );
            }
        }
    },

    // ────────────────────────────────────────────────
    // GNSS STATE TRANSITIONS
    // ────────────────────────────────────────────────

    _setGNSSLost() {
        this.gnssAvailable = false;
        this._gnssWasLost = true;

        // Initialize DR from current reference position
        const speedMs = this.speedKmh / 3.6;
        IDRN.DeadReckoning.initialize(this.refLat, this.refLng, this.refHeading, speedMs);

        IDRN.Telemetry.setGNSSStatus(false);
        IDRN.Telemetry.setNavMode('DEAD RECKONING');
        IDRN.Timeline.setPhase('gnss-lost');
        if (IDRN.Map) IDRN.Map.setGnssStatus('lost');
        IDRN.Notifications.show(
            'GNSS Signal Lost — Dead Reckoning Active',
            'warning',
            4000
        );

        this._updateButtons();
    },

    _setGNSSRestored() {
        this.gnssAvailable = true;

        // Trigger fusion correction
        IDRN.Fusion.onGNSSRestore(this.drLat, this.drLng, this.refLat, this.refLng);

        IDRN.Telemetry.setGNSSStatus(true);
        IDRN.Telemetry.setNavMode('GNSS RECOVERY');
        IDRN.Timeline.setPhase('gnss-restored');
        if (IDRN.Map) IDRN.Map.setGnssStatus('recovery');
        IDRN.Notifications.show(
            'GNSS Signal Restored — Recovery Pending',
            'success',
            4000
        );

        this._updateButtons();
    },

    // ────────────────────────────────────────────────
    // UI BUTTON STATE
    // ────────────────────────────────────────────────

    _updateButtons() {
        const isRunning = this.running && !this.paused && !this.finished;

        document.getElementById('btn-start').disabled = isRunning;
        document.getElementById('btn-start').querySelector('.btn-icon').textContent =
            this.paused ? '▶' : (this.finished ? '↺' : '▶');
        document.getElementById('btn-start').childNodes[1].textContent =
            this.paused ? ' Resume' : (this.finished ? ' Restart' : ' Start Simulation');

        document.getElementById('btn-pause').disabled = !isRunning;
        document.getElementById('btn-reset').disabled = !this.running && !this.finished;
        document.getElementById('btn-gnss-loss').disabled = !this.gnssAvailable;
        document.getElementById('btn-gnss-restore').disabled = this.gnssAvailable;
        document.getElementById('btn-speed-up').disabled = !isRunning;
        document.getElementById('btn-speed-down').disabled = !isRunning;
    }
};


// ════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Initialize route
    IDRN.Route.initialize();

    // Initialize map
    IDRN.Map.initialize();

    // Initialize SensorManager (check device availability)
    IDRN.SensorManager.initialize();

    // Initialize charts
    IDRN.Charts.initialize();

    // ── Event Listeners ──

    document.getElementById('btn-start').addEventListener('click', () => {
        if (IDRN.Simulation.paused) {
            IDRN.Simulation.start(); // resume
        } else if (IDRN.Simulation.finished) {
            IDRN.Simulation.reset();
            setTimeout(() => IDRN.Simulation.start(), 100);
        } else {
            IDRN.Simulation.start();
        }
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
        IDRN.Simulation.pause();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        IDRN.Simulation.reset();
    });

    document.getElementById('btn-gnss-loss').addEventListener('click', () => {
        IDRN.Simulation.loseGNSS();
    });

    document.getElementById('btn-gnss-restore').addEventListener('click', () => {
        IDRN.Simulation.restoreGNSS();
    });

    document.getElementById('btn-speed-up').addEventListener('click', () => {
        IDRN.Simulation.increaseSpeed();
    });

    document.getElementById('btn-speed-down').addEventListener('click', () => {
        IDRN.Simulation.decreaseSpeed();
    });

    document.getElementById('chk-auto-gnss').addEventListener('change', (e) => {
        IDRN.Simulation.autoGNSSZone = e.target.checked;
    });

    // ── Sensor Source Toggle Listeners ──

    document.getElementById('btn-source-sim').addEventListener('click', () => {
        IDRN.SensorManager.setSource('simulation');
        document.getElementById('source-mode-text').textContent = 'Using simulated IMU data';
        const psl = document.getElementById('pipeline-source-label');
        if (psl) psl.textContent = 'Simulation';
    });

    document.getElementById('btn-source-device').addEventListener('click', async () => {
        await IDRN.SensorManager.setSource('device');
        if (IDRN.SensorManager.source === 'device') {
            document.getElementById('source-mode-text').textContent = 'Using real smartphone sensors';
            const psl = document.getElementById('pipeline-source-label');
            if (psl) psl.textContent = 'Real Device';
        }
    });

    document.getElementById('btn-request-permission').addEventListener('click', async () => {
        const result = await IDRN.DeviceSensors.requestPermission();
        IDRN.SensorManager.updateDeviceStatusUI();
        if (result === 'granted' || result === 'not-required') {
            IDRN.Notifications.show('Sensor permission granted', 'success', 3000);
        } else {
            IDRN.Notifications.show('Sensor permission denied by browser', 'warning', 4000);
        }
    });

    // ── Step 3 Event Listeners ──

    // Sensor Calibration Button
    const btnCalib = document.getElementById('btn-calibrate');
    if (btnCalib) {
        btnCalib.addEventListener('click', () => {
            if (IDRN.SensorProcessor) {
                IDRN.SensorProcessor.startCalibration();
            }
        });
    }

    // Noise Level Selector Buttons (LOW / MEDIUM / HIGH)
    const btnNoiseLow = document.getElementById('btn-noise-low');
    const btnNoiseMed = document.getElementById('btn-noise-medium');
    const btnNoiseHigh = document.getElementById('btn-noise-high');

    const setNoiseLevel = (level, activeBtn) => {
        IDRN.Config.currentNoiseLevel = level;
        [btnNoiseLow, btnNoiseMed, btnNoiseHigh].forEach(b => b && b.classList.remove('active'));
        if (activeBtn) activeBtn.classList.add('active');
        if (IDRN.Notifications) {
            IDRN.Notifications.show(`Simulated Sensor Noise: ${level}`, 'info', 2000);
        }
    };

    if (btnNoiseLow) btnNoiseLow.addEventListener('click', () => setNoiseLevel('LOW', btnNoiseLow));
    if (btnNoiseMed) btnNoiseMed.addEventListener('click', () => setNoiseLevel('MEDIUM', btnNoiseMed));
    if (btnNoiseHigh) btnNoiseHigh.addEventListener('click', () => setNoiseLevel('HIGH', btnNoiseHigh));

    // Shock Generator Button
    const btnShock = document.getElementById('btn-trigger-shock');
    if (btnShock) {
        btnShock.addEventListener('click', () => {
            console.log('[UI] Trigger Road Shock button clicked');
            if (IDRN.Sensors) {
                IDRN.Sensors.triggerShock(8.5 + Math.random() * 4.0);
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case ' ':
                e.preventDefault();
                if (IDRN.Simulation.running && !IDRN.Simulation.paused) {
                    IDRN.Simulation.pause();
                } else {
                    IDRN.Simulation.start();
                }
                break;
            case 'r':
            case 'R':
                IDRN.Simulation.reset();
                break;
            case 'g':
            case 'G':
                if (IDRN.Simulation.gnssAvailable) {
                    IDRN.Simulation.loseGNSS();
                } else {
                    IDRN.Simulation.restoreGNSS();
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                IDRN.Simulation.increaseSpeed();
                break;
            case 'ArrowDown':
                e.preventDefault();
                IDRN.Simulation.decreaseSpeed();
                break;
        }
    });

    // ── Step 5 Event Listeners ──

    // Step 5 Map Matching Toggle Button
    const btnToggleMM = document.getElementById('btn-toggle-mm');
    if (btnToggleMM) {
        btnToggleMM.addEventListener('click', () => {
            if (IDRN.MapMatcher) {
                IDRN.MapMatcher.setEnabled(!IDRN.MapMatcher.enabled);
                if (IDRN.MapMatchingUI) {
                    IDRN.MapMatchingUI.update(IDRN.MapMatcher.getState());
                }
            }
        });
    }

    // Step 6 Sensor Fusion Toggle Button
    const btnToggleSF = document.getElementById('btn-toggle-sf');
    if (btnToggleSF) {
        btnToggleSF.addEventListener('click', () => {
            if (IDRN.SensorFusion) {
                IDRN.SensorFusion.setEnabled(!IDRN.SensorFusion.enabled);
            }
        });
    }

    // Step 6 Inject GNSS Outlier Button
    const btnOutlier = document.getElementById('btn-inject-outlier');
    if (btnOutlier) {
        btnOutlier.addEventListener('click', () => {
            if (IDRN.SensorFusion) {
                IDRN.SensorFusion.injectOutlier(120);
            }
        });
    }

    // Handheld Motion Compensation Phone Rotation Inject Button
    const btnInjectRot = document.getElementById('btn-inject-rotation');
    if (btnInjectRot) {
        btnInjectRot.addEventListener('click', () => {
            if (IDRN.HandheldCompensation) {
                IDRN.HandheldCompensation.injectPhoneRotation(90);
            }
        });
    }

    // Step 7 AI Speed Estimation Toggle Button
    const btnToggleAI = document.getElementById('btn-toggle-ai');
    if (btnToggleAI) {
        btnToggleAI.addEventListener('click', () => {
            if (IDRN.AIMotionEstimator) {
                IDRN.AIMotionEstimator.setEnabled(!IDRN.AIMotionEstimator.enabled);
            }
        });
    }

    // Step 7 Export Feature Dataset Button
    const btnExport = document.getElementById('btn-export-dataset');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (IDRN.AIMotionEstimator) {
                IDRN.AIMotionEstimator.exportDataset();
            }
        });
    }

    // Step 8 AI Drift Correction Toggle Button
    const btnToggleDrift = document.getElementById('btn-toggle-drift');
    if (btnToggleDrift) {
        btnToggleDrift.addEventListener('click', () => {
            if (IDRN.AIDriftCorrection) {
                IDRN.AIDriftCorrection.setEnabled(!IDRN.AIDriftCorrection.enabled);
            }
        });
    }

    // ── Step 9 Benchmark Controls ──
    const benchSelect = document.getElementById('benchmark-scenario-select');
    if (benchSelect) {
        benchSelect.addEventListener('change', (e) => {
            if (IDRN.AccuracyBenchmark) {
                IDRN.AccuracyBenchmark.selectScenario(e.target.value);
            }
        });
    }

    const btnRunScenario = document.getElementById('btn-run-scenario');
    if (btnRunScenario) {
        btnRunScenario.addEventListener('click', () => {
            if (IDRN.AccuracyBenchmark) {
                const key = benchSelect ? benchSelect.value : 'SHORT_TUNNEL';
                IDRN.AccuracyBenchmark.runScenario(key);
            }
        });
    }

    const btnRunSuite = document.getElementById('btn-run-suite');
    if (btnRunSuite) {
        btnRunSuite.addEventListener('click', () => {
            if (IDRN.AccuracyBenchmark) {
                IDRN.AccuracyBenchmark.runSuite();
            }
        });
    }

    const btnExportBench = document.getElementById('btn-export-benchmark');
    if (btnExportBench) {
        btnExportBench.addEventListener('click', () => {
            if (IDRN.AccuracyBenchmark) {
                IDRN.AccuracyBenchmark.exportCSV();
            }
        });
    }

    const btnResetBench = document.getElementById('btn-reset-benchmark');
    if (btnResetBench) {
        btnResetBench.addEventListener('click', () => {
            if (IDRN.AccuracyBenchmark) {
                IDRN.AccuracyBenchmark.resetAll();
            }
        });
    }

    // ── Step 10 SIH Demo Control Listeners ──
    const btnStartDemo = document.getElementById('btn-start-sih-demo');
    if (btnStartDemo) {
        btnStartDemo.addEventListener('click', () => {
            if (IDRN.SIHDemo) {
                IDRN.SIHDemo.startDemo();
            }
        });
    }

    const btnResetDemo = document.getElementById('btn-reset-sih-demo');
    if (btnResetDemo) {
        btnResetDemo.addEventListener('click', () => {
            if (IDRN.SIHDemo) {
                IDRN.SIHDemo.resetDemo();
            }
        });
    }

    const btnGuide = document.getElementById('btn-demo-guide');
    const btnCloseGuide = document.getElementById('btn-close-guide');
    if (btnGuide) {
        btnGuide.addEventListener('click', () => {
            if (IDRN.SIHDemo) IDRN.SIHDemo.toggleGuide();
        });
    }
    if (btnCloseGuide) {
        btnCloseGuide.addEventListener('click', () => {
            if (IDRN.SIHDemo) IDRN.SIHDemo.toggleGuide();
        });
    }

    // Initial button state
    IDRN.Simulation._updateButtons();

    console.log('%c IDRN — Intelligent Dead Reckoning Navigation System ',
        'background: #06b6d4; color: #000; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    console.log('Route loaded:', IDRN.Route.points.length, 'points,',
        IDRN.Route.totalLength.toFixed(0), 'meters');
    console.log('GNSS Denied Zone:', IDRN.Route.gnssBlockedDistStart.toFixed(0), '-',
        IDRN.Route.gnssBlockedDistEnd.toFixed(0), 'meters');
});
