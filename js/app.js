/* ═══════════════════════════════════════════════════════
   NavDR — Main Application
   Simulation loop, state management, event handlers
   ═══════════════════════════════════════════════════════ */

// ════════════════════════════════════════════════════
// SIMULATION STATE
// ════════════════════════════════════════════════════

NavDR.Simulation = {
  // State
  running: false,
  paused: false,
  gnssAvailable: true,
  autoGNSSZone: true, // Auto trigger GNSS loss in denied zone
  finished: false,

  // Vehicle
  speedKmh: NavDR.Config.DEFAULT_SPEED_KMH,
  playbackRate: 4,
  distanceTravelled: 0, // meters along route
  elapsedTime: 0, // seconds

  // Position tracking
  refLat: 0,
  refLng: 0, // Reference/GNSS position
  refHeading: 0,
  drLat: 0,
  drLng: 0, // Dead reckoning position
  fusedLat: 0,
  fusedLng: 0, // Fused output position
  positionError: 0, // meters
  maxDrift: 0,

  // Internal
  _intervalId: null,
  _gnssWasLost: false, // Track if GNSS has been lost at least once
  _chartUpdateCounter: 0,
  _panCounter: 0,

  /**
   * Start the simulation.
   */
  start() {
    console.log("[UI] Start Simulation button clicked");
    console.log("[Simulation] start() called");

    if (this.running && !this.paused) return;

    if (this.finished) this.reset();

    if (this.paused) {
      // Resume
      this.paused = false;
      this._startLoop();
      this._updateButtons();
      NavDR.Notifications.show("Simulation resumed", "info", 2000);
      console.log("[Simulation] running:", this.running);
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
    const startPos = NavDR.Route.getAtDistance(0);
    this.refLat = startPos.lat;
    this.refLng = startPos.lng;
    this.refHeading = startPos.heading;
    this.drLat = startPos.lat;
    this.drLng = startPos.lng;
    this.fusedLat = startPos.lat;
    this.fusedLng = startPos.lng;

    // Initialize engine modules
    const startHeadingDeg = NavDR.Geo
      ? NavDR.Geo.bearingToDegrees(startPos.heading)
      : 90;
    NavDR.DeadReckoning.initialize(
      startPos.lat,
      startPos.lng,
      startPos.heading,
      0,
    );
    if (NavDR.DeadReckoningEngine) {
      NavDR.DeadReckoningEngine.initialize(
        startPos.lat,
        startPos.lng,
        startHeadingDeg,
        0,
      );
    }
    try {
      if (NavDR.MapMatcher) {
        NavDR.MapMatcher.initialize();
      }
    } catch (err) {
      console.error(
        "[MapMatcher] Optional initialization error (fallback active):",
        err,
      );
    }
    if (NavDR.SensorFusion) {
      NavDR.SensorFusion.initialize();
    }
    if (NavDR.HandheldCompensation) {
      NavDR.HandheldCompensation.initialize();
    }
    if (NavDR.AIMotionEstimator) {
      NavDR.AIMotionEstimator.initialize();
    }
    if (NavDR.AIDriftCorrection) {
      NavDR.AIDriftCorrection.initialize();
    }
    if (NavDR.AccuracyBenchmark) {
      NavDR.AccuracyBenchmark.initialize();
    }
    NavDR.SensorManager.reset();
    NavDR.Fusion.reset();
    NavDR.Fusion.lat = startPos.lat;
    NavDR.Fusion.lng = startPos.lng;

    // Initialize UI
    NavDR.Map.clearTrails();
    NavDR.Telemetry.reset();

    this._updateButtons();
    this._startLoop();

    console.log("[Simulation] running:", this.running);
    NavDR.Notifications.show(
      "Simulation started — vehicle is moving",
      "info",
      3000,
    );
  },

  /**
   * Pause the simulation.
   */
  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this._stopLoop();
    this._updateButtons();
    NavDR.Notifications.show("Simulation paused", "info", 2000);
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
    this.speedKmh = NavDR.Config.DEFAULT_SPEED_KMH;
    this._gnssWasLost = false;

    NavDR.DeadReckoning.reset();
    if (NavDR.DeadReckoningEngine) NavDR.DeadReckoningEngine.reset();
    if (NavDR.MapMatcher) NavDR.MapMatcher.reset();
    if (NavDR.SensorFusion) NavDR.SensorFusion.reset();
    if (NavDR.AIMotionEstimator) NavDR.AIMotionEstimator.reset();
    if (NavDR.AIDriftCorrection) NavDR.AIDriftCorrection.reset();
    if (NavDR.AccuracyBenchmark) NavDR.AccuracyBenchmark.reset();
    NavDR.SensorManager.reset();
    NavDR.SensorProcessor.reset();
    NavDR.DeadReckoning.reset();
    NavDR.Fusion.reset();

    NavDR.Map.clearTrails();
    NavDR.Telemetry.reset();

    document.getElementById("speed-display").textContent =
      this.speedKmh + " km/h";
    this._updateButtons();
  },

  /**
   * Simulate GNSS signal loss.
   */
  loseGNSS() {
    console.log("[UI] Simulate GNSS Loss button clicked");
    console.log("[GNSS] Manual GNSS loss requested");
    if (this.gnssAvailable) {
      this._manualGNSSOverride = true;
      this._setGNSSLost();
    }
    console.log("[GNSS] GNSS availability:", this.gnssAvailable);
    if (NavDR.DeadReckoningEngine) {
      console.log(
        "[DR] Navigation mode:",
        NavDR.DeadReckoningEngine.getState().navigationMode,
      );
    }
  },

  /**
   * Restore GNSS signal.
   */
  restoreGNSS() {
    console.log("[UI] Restore GNSS button clicked");
    console.log("[GNSS] Manual GNSS restoration requested");
    if (!this.gnssAvailable) {
      this._manualGNSSOverride = true;
      this._setGNSSRestored();
    }
    console.log("[GNSS] GNSS availability:", this.gnssAvailable);
    if (NavDR.DeadReckoningEngine) {
      console.log(
        "[DR] Navigation mode:",
        NavDR.DeadReckoningEngine.getState().navigationMode,
      );
    }
  },

  /**
   * Increase vehicle speed.
   */
  increaseSpeed() {
    const C = NavDR.Config;
    this.speedKmh = Math.min(
      C.MAX_SPEED_KMH,
      this.speedKmh + C.SPEED_INCREMENT_KMH,
    );
    document.getElementById("speed-display").textContent =
      this.speedKmh + " km/h";
  },

  /**
   * Decrease vehicle speed.
   */
  decreaseSpeed() {
    const C = NavDR.Config;
    this.speedKmh = Math.max(
      C.MIN_SPEED_KMH,
      this.speedKmh - C.SPEED_INCREMENT_KMH,
    );
    document.getElementById("speed-display").textContent =
      this.speedKmh + " km/h";
  },

  // ────────────────────────────────────────────────
  // SIMULATION LOOP
  // ────────────────────────────────────────────────

  _startLoop() {
    this._stopLoop();
    this._intervalId = setInterval(
      () => { for(let i=0;i<this.playbackRate;i++)this._tick(); },
      NavDR.Config.UPDATE_INTERVAL_MS,
    );
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
  // The selected pipeline uses the shared NavigationSession in navigation-workbench.js.
  _tick() {
    NavDR.Workbench.tick();
  },

  // ────────────────────────────────────────────────
  // GNSS STATE TRANSITIONS
  // ────────────────────────────────────────────────

  _setGNSSLost() {
    this.gnssAvailable = false;
    this._gnssWasLost = true;

    // Initialize DR from current reference position
    const speedMs = this.speedKmh / 3.6;
    NavDR.DeadReckoning.initialize(
      this.refLat,
      this.refLng,
      this.refHeading,
      speedMs,
    );

    NavDR.Telemetry.setGNSSStatus(false);
    NavDR.Telemetry.setNavMode("DEAD RECKONING");
    if (NavDR.Map) NavDR.Map.setGnssStatus("lost");
    NavDR.Notifications.show(
      "GNSS Signal Lost — Dead Reckoning Active",
      "warning",
      4000,
    );

    this._updateButtons();
  },

  _setGNSSRestored() {
    this.gnssAvailable = true;

    // Trigger fusion correction
    NavDR.Fusion.onGNSSRestore(
      this.drLat,
      this.drLng,
      this.refLat,
      this.refLng,
    );

    NavDR.Telemetry.setGNSSStatus(true);
    NavDR.Telemetry.setNavMode("GNSS RECOVERY");
    if (NavDR.Map) NavDR.Map.setGnssStatus("recovery");
    NavDR.Notifications.show(
      "GNSS Signal Restored — Recovery Pending",
      "success",
      4000,
    );

    this._updateButtons();
  },

  // ────────────────────────────────────────────────
  // UI BUTTON STATE
  // ────────────────────────────────────────────────

  _updateButtons() {
    const isRunning = this.running && !this.paused && !this.finished;

    document.getElementById("btn-start").disabled = isRunning;
    document.getElementById("btn-start").textContent = this.paused
      ? "Resume"
      : this.finished
        ? "Restart"
        : "Start simulation";

    document.getElementById("btn-pause").disabled = !isRunning;
    document.getElementById("btn-reset").disabled =
      !this.running && !this.finished;
    document.getElementById("btn-gnss-loss").disabled = !this.gnssAvailable;
    document.getElementById("btn-gnss-restore").disabled = this.gnssAvailable;
    document.getElementById("btn-speed-up").disabled = !isRunning;
    document.getElementById("btn-speed-down").disabled = !isRunning;
  },
};

// ════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  // Initialize route
  NavDR.Route.initialize();

  // Initialize map
  if(typeof L!=='undefined')NavDR.Map.initialize();
  else document.getElementById('map').textContent='Map library unavailable. Reload after restoring the connection. Navigation calculations remain available.';

  // Initialize SensorManager (check device availability)
  NavDR.SensorManager.initialize();

  // Initialize charts
  // The selected error plot uses a bounded SVG series; dormant charts are not allocated.

  // ── Event Listeners ──

  document
    .getElementById("btn-start")
    .addEventListener("click", () => NavDR.Simulation.start());

  document.getElementById("btn-pause").addEventListener("click", () => {
    NavDR.Simulation.pause();
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    NavDR.Simulation.reset();
  });

  document.getElementById("btn-gnss-loss").addEventListener("click", () => {
    NavDR.Simulation.loseGNSS();
  });

  document.getElementById("btn-gnss-restore").addEventListener("click", () => {
    NavDR.Simulation.restoreGNSS();
  });

  document.getElementById("btn-speed-up").addEventListener("click", () => {
    NavDR.Simulation.increaseSpeed();
  });

  document.getElementById("btn-speed-down").addEventListener("click", () => {
    NavDR.Simulation.decreaseSpeed();
  });

  document.getElementById("chk-auto-gnss").addEventListener("change", (e) => {
    NavDR.Simulation.autoGNSSZone = e.target.checked;
    NavDR.Simulation._manualGNSSOverride = false;
  });

  // ── Sensor Source Toggle Listeners ──

  document.getElementById("btn-source-sim").addEventListener("click", () => {
    NavDR.SensorManager.setSource("simulation");
    document.getElementById("source-provenance").textContent =
      "Using simulated IMU data";
    const psl = document.getElementById("pipeline-source-label");
    if (psl) psl.textContent = "Simulation";
  });

  document
    .getElementById("btn-source-device")
    .addEventListener("click", async () => {
      await NavDR.SensorManager.setSource("device");
      if (NavDR.SensorManager.source === "device") {
        document.getElementById("source-provenance").textContent =
          "Using real smartphone sensors";
        const psl = document.getElementById("pipeline-source-label");
        if (psl) psl.textContent = "Real Device";
      }
    });

  document
    .getElementById("btn-request-permission")
    .addEventListener("click", async () => {
      const result = await NavDR.DeviceSensors.requestPermission();
      NavDR.SensorManager.updateDeviceStatusUI();
      if (result === "granted" || result === "not-required") {
        NavDR.Notifications.show("Sensor permission granted", "success", 3000);
      } else {
        NavDR.Notifications.show(
          "Sensor permission denied by browser",
          "warning",
          4000,
        );
      }
    });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (
      e.target.closest("input, select, textarea, button, [contenteditable]") ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey
    )
      return;
    switch (e.key) {
      case " ":
        e.preventDefault();
        if (NavDR.Simulation.running && !NavDR.Simulation.paused) {
          NavDR.Simulation.pause();
        } else {
          NavDR.Simulation.start();
        }
        break;
      case "r":
      case "R":
        NavDR.Simulation.reset();
        break;
      case "g":
      case "G":
        if (NavDR.Simulation.gnssAvailable) {
          NavDR.Simulation.loseGNSS();
        } else {
          NavDR.Simulation.restoreGNSS();
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        NavDR.Simulation.increaseSpeed();
        break;
      case "ArrowDown":
        e.preventDefault();
        NavDR.Simulation.decreaseSpeed();
        break;
    }
  });

  // Initial button state
  NavDR.Simulation._updateButtons();

  console.log(
    "%c NavDR — Intelligent Dead Reckoning Navigation System ",
    "background: #06b6d4; color: #000; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
  );
  console.log(
    "Route loaded:",
    NavDR.Route.points.length,
    "points,",
    NavDR.Route.totalLength.toFixed(0),
    "meters",
  );
  console.log(
    "GNSS Denied Zone:",
    NavDR.Route.gnssBlockedDistStart.toFixed(0),
    "-",
    NavDR.Route.gnssBlockedDistEnd.toFixed(0),
    "meters",
  );
});
