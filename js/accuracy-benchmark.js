/* ═══════════════════════════════════════════════════════
   NavDR — Accuracy Testing & SIH Benchmark Engine
   SIH 2026 Problem Statement 26168
   ═══════════════════════════════════════════════════════ */

window.NavDR = window.NavDR || {};

NavDR.AccuracyBenchmark = {
  // ── Module State ──
  enabled: true,
  _running: true,
  currentScenario: "CUSTOM", // 'SHORT_TUNNEL' | 'URBAN_CANYON' | 'LONG_TUNNEL' | 'EXTENDED_OUTAGE' | 'CUSTOM'

  // Live Metrics
  elapsedTestTime: 0,
  distanceTravelled: 0,
  gnssAvailable: true,
  gnssOutageDuration: 0,
  outageDistanceMeters: 0,

  rawErrorMeters: 0,
  correctedErrorMeters: 0,
  rawDriftPercent: 0,
  correctedDriftPercent: 0,
  improvementPercent: 0,

  maxRawError: 0,
  maxCorrectedError: 0,
  sumRawError: 0,
  sumCorrectedError: 0,
  sampleCount: 0,
  avgRawError: 0,
  avgCorrectedError: 0,

  currentNavMode: "GNSS",
  benchmarkStatus: "INSUFFICIENT DATA", // 'PASS' | 'ABOVE TARGET' | 'INSUFFICIENT DATA'
  pipelinePhase: "GNSS AVAILABLE", // 'GNSS AVAILABLE' | 'GNSS OUTAGE DETECTED' | 'DEAD RECKONING ACTIVE' | 'MAP MATCHING ACTIVE' | 'AI CORRECTION ACTIVE' | 'GNSS RECOVERY'

  // In-Session History Table Array
  history: [],

  // Auto Suite & Timer Execution
  _autoSuiteActive: false,
  _scenarioTimer: null,
  _suiteStep: 0,

  /**
   * Initialize AccuracyBenchmark module
   */
  initialize() {
    this.enabled = NavDR.Config.ACCURACY_BENCHMARK
      ? NavDR.Config.ACCURACY_BENCHMARK.ENABLED
      : true;
    this.reset();
    console.log(
      "[AccuracyBenchmark] SIH Prototype Accuracy Benchmark Module initialized.",
    );
  },

  /**
   * Reset live evaluation run data
   */
  reset() {
    this._schedule = null;
    this._queue = [];
    if (this._scenarioTimer) clearTimeout(this._scenarioTimer);
    this._scenarioTimer = null;
    this._autoSuiteActive = false;

    this.elapsedTestTime = 0;
    this.distanceTravelled = 0;
    this.gnssAvailable = true;
    this.gnssOutageDuration = 0;
    this.outageDistanceMeters = 0;

    this.rawErrorMeters = 0;
    this.correctedErrorMeters = 0;
    this.rawDriftPercent = 0;
    this.correctedDriftPercent = 0;
    this.improvementPercent = 0;

    this.maxRawError = 0;
    this.maxCorrectedError = 0;
    this.sumRawError = 0;
    this.sumCorrectedError = 0;
    this.sampleCount = 0;
    this.avgRawError = 0;
    this.avgCorrectedError = 0;

    this.currentNavMode = "GNSS";
    this.benchmarkStatus = "INSUFFICIENT DATA";
    this.pipelinePhase = "GNSS AVAILABLE";
  },

  /**
   * Reset both live run and history table
   */
  resetAll() {
    this.reset();
    this.history = [];
    this.currentScenario = "CUSTOM";
    this.renderHistory();
    if (NavDR.Notifications)
      NavDR.Notifications.show("Benchmark history reset", "info", 2000);
  },

  /**
   * Select a predefined evaluation scenario
   */
  selectScenario(scenarioKey) {
    this.currentScenario = scenarioKey;
    if (NavDR.AccuracyUI) NavDR.AccuracyUI.updateScenarioSelection(scenarioKey);
  },

  /**
   * Run selected scenario test
   */
  runScenario(scenarioKey) {
    this.selectScenario(scenarioKey);
    NavDR.Workbench.source = "simulation";
    NavDR.Simulation.reset();
    NavDR.Simulation.autoGNSSZone = false;
    document.getElementById("chk-auto-gnss").checked = false;
    NavDR.Simulation.start();
    this.currentScenario = scenarioKey;
    this._schedule = {
      time: 0,
      timeMs: 0,
      duration:
        NavDR.Config.ACCURACY_BENCHMARK.SCENARIOS[scenarioKey]
          ?.targetDurationSec || 10,
      lost: false,
      restored: false,
    };
  },
  runSuite() {
    this._queue = [
      "SHORT_TUNNEL",
      "URBAN_CANYON",
      "LONG_TUNNEL",
      "EXTENDED_OUTAGE",
    ];
    const first = this._queue.shift();
    const queue = this._queue;
    this.runScenario(first);
    this._queue = queue;
  },
  advance(dt) {
    const s = this._schedule;
    const o = NavDR.Workbench.lastOutput,
      m = o?.metrics;
    if (m) {
      Object.assign(this, {
        elapsedTestTime: o.elapsed,
        gnssOutageDuration: m.outageSeconds,
        outageDistanceMeters: m.outageDistance,
        rawErrorMeters: m.rawError,
        correctedErrorMeters: m.outputError,
        maxRawError: m.maxRaw,
        maxCorrectedError: m.maxOutput,
        improvementPercent: m.improvementPercent || 0,
        correctedDriftPercent: m.driftPercent || 0,
        benchmarkStatus: m.status,
        rawDriftPercent:
          m.outageDistance > 5 ? (100 * m.maxRaw) / m.outageDistance : 0,
      });
    }
    if (!s) return;
    s.timeMs += dt * 1000;
    s.time = s.timeMs / 1000;
    if (!s.lost && s.time >= 1) {
      s.lost = true;
      NavDR.Simulation.loseGNSS();
    }
    if (!s.restored && s.time >= s.duration + 1) {
      s.restored = true;
      NavDR.Simulation.restoreGNSS();
      this._recordHistoryRun(this.currentScenario);
    }
    if (s.time >= s.duration + 6) {
      this._schedule = null;
      const queue = this._queue || [],
        next = queue.shift();
      if (next) {
        this.runScenario(next);
        this._queue = queue;
      } else NavDR.Simulation.pause();
    }
  },

  /**
   * Record completed run into history table
   */
  _recordHistoryRun(scenarioName) {
    const run = {
      id: this.history.length + 1,
      timestamp: new Date().toLocaleTimeString(),
      scenario: scenarioName || this.currentScenario,
      outageDuration: parseFloat(this.gnssOutageDuration.toFixed(1)),
      distance: parseFloat(this.outageDistanceMeters.toFixed(1)),
      rawError: parseFloat(this.maxRawError.toFixed(1)),
      correctedError: parseFloat(this.maxCorrectedError.toFixed(1)),
      improvement:
        this.maxRawError > 0
          ? (100 * (this.maxRawError - this.maxCorrectedError)) /
            this.maxRawError
          : 0,
      correctedDriftPct: parseFloat(this.correctedDriftPercent.toFixed(1)),
      status: this.benchmarkStatus,
    };

    this.history.unshift(run); // Add latest run to top
    if (this.history.length > 10) this.history.pop(); // Keep top 10 runs

    this.renderHistory();
  },

  renderHistory() {
    const body = document.getElementById("scenario-results");
    if (!body) return;
    body.replaceChildren();
    for (const r of this.history) {
      const tr = document.createElement("tr");
      for (const v of [
        r.scenario,
        r.outageDuration + " s",
        r.distance + " m",
        r.correctedError + " m",
        r.correctedDriftPct + "%",
        r.status,
      ]) {
        const td = document.createElement("td");
        td.textContent = v;
        tr.append(td);
      }
      body.append(tr);
    }
  },

  /**
   * Export collected benchmark dataset as CSV file
   */
  exportCSV() {
    if (!this.history || this.history.length === 0) {
      // Include current run if history table empty
      if (!NavDR.Workbench.lastOutput?.metrics) {
        NavDR.Notifications.show(
          "No independent reference data to export",
          "warning",
        );
        return;
      }
      this._recordHistoryRun("Live Evaluation");
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent +=
      "Run ID,Timestamp,Scenario,Outage Duration (s),Distance (m),Raw DR Peak Error (m),Selected Output Peak Error (m),Improvement %,Corrected Drift %,Scenario Status\n";

    this.history.forEach((row) => {
      csvContent += `${row.id},"${row.timestamp}","${row.scenario}",${row.outageDuration},${row.distance},${row.rawError},${row.correctedError},${row.improvement},${row.correctedDriftPct},"${row.status}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `navdr_accuracy_benchmark_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (NavDR.Notifications) {
      NavDR.Notifications.show(
        "Exported Accuracy Benchmark CSV file",
        "success",
        3000,
      );
    }
  },

  /**
   * Get Module State Object
   */
  getState() {
    return {
      enabled: this.enabled,
      currentScenario: this.currentScenario,
      elapsedTestTime: this.elapsedTestTime,
      distanceTravelled: this.distanceTravelled,
      gnssAvailable: this.gnssAvailable,
      gnssOutageDuration: this.gnssOutageDuration,
      outageDistanceMeters: this.outageDistanceMeters,
      rawErrorMeters: this.rawErrorMeters,
      correctedErrorMeters: this.correctedErrorMeters,
      rawDriftPercent: this.rawDriftPercent,
      correctedDriftPercent: this.correctedDriftPercent,
      improvementPercent: this.improvementPercent,
      maxRawError: this.maxRawError,
      maxCorrectedError: this.maxCorrectedError,
      avgRawError: this.avgRawError,
      avgCorrectedError: this.avgCorrectedError,
      currentNavMode: this.currentNavMode,
      benchmarkStatus: this.benchmarkStatus,
      pipelinePhase: this.pipelinePhase,
      history: [...this.history],
    };
  },
};
