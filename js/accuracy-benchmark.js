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

  rawErrorMeters: null,
  correctedErrorMeters: null,
  rawDriftPercent: null,
  correctedDriftPercent: null,
  improvementPercent: null,

  maxRawError: null,
  maxCorrectedError: null,
  sumRawError: 0,
  sumCorrectedError: 0,
  sampleCount: 0,
  avgRawError: null,
  avgCorrectedError: null,

  currentNavMode: "GNSS",
  benchmarkStatus: "INSUFFICIENT DATA", // Evaluation status only; no authenticated PS pass rule
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

    this.rawErrorMeters = null;
    this.correctedErrorMeters = null;
    this.rawDriftPercent = null;
    this.correctedDriftPercent = null;
    this.improvementPercent = null;

    this.maxRawError = null;
    this.maxCorrectedError = null;
    this.sumRawError = 0;
    this.sumCorrectedError = 0;
    this.sampleCount = 0;
    this.avgRawError = null;
    this.avgCorrectedError = null;

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
    this.syncCurrent();
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
    this.syncCurrent();
    const round = v => Number.isFinite(v) ? Number(v.toFixed(1)) : null;
    const run = {
      id: this.history.length + 1, timestamp: new Date().toLocaleTimeString(),
      scenario: scenarioName || this.currentScenario,
      outageDuration: round(this.gnssOutageDuration), distance: round(this.outageDistanceMeters),
      rawError: round(this.maxRawError), correctedError: round(this.maxCorrectedError),
      improvement: this.maxRawError > 0 && this.maxCorrectedError !== null
        ? 100 * (this.maxRawError - this.maxCorrectedError) / this.maxRawError : null,
      correctedDriftPct: round(this.correctedDriftPercent), status: this.benchmarkStatus,
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
        r.correctedDriftPct == null ? "—" : r.correctedDriftPct + "%",
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
    const csvContent = "data:text/csv;charset=utf-8," + this.currentCSV();

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

  // Called for every input source and again when exporting; history is never the live result.
  syncCurrent() {
    const o = NavDR.Workbench?.lastOutput, m = o?.metrics;
    Object.assign(this, {
      elapsedTestTime: o?.elapsed ?? 0, gnssOutageDuration: m?.outageSeconds ?? null,
      outageDistanceMeters: m?.outageDistance ?? null, rawErrorMeters: m?.rawError ?? null,
      correctedErrorMeters: m?.outputError ?? null, maxRawError: m?.maxRaw ?? null,
      maxCorrectedError: m?.maxOutput ?? null, improvementPercent: m?.improvementPercent ?? null,
      correctedDriftPercent: m?.driftPercent ?? null, rawDriftPercent: m?.rawDriftPercent ?? null,
      benchmarkStatus: m?.status ?? 'NO REFERENCE',
    });
  },
  currentResult() {
    this.syncCurrent();
    const o = NavDR.Workbench?.lastOutput;
    // Copy to detach exports from mutable UI/session state. Null stays null.
    return JSON.parse(JSON.stringify({schema: 'navdr.evaluation.v2',
      source: NavDR.Workbench?.source ?? 'unknown', elapsedSeconds: o?.elapsed ?? null,
      metrics: o?.metrics ?? null, outages: o?.outages ?? []}));
  },
  currentCSV() {
    const r = this.currentResult();
    const rows = r.outages.length ? r.outages : [{status: 'NO SCORED OUTAGE'}];
    const keys = ['id','outageSeconds','outageDistance','maxRaw','maxOutput','driftPercent','status'];
    const cell = value => value == null ? 'null' : JSON.stringify(value);
    return ['source,' + keys.join(','), ...rows.map(row => [r.source,...keys.map(k=>row[k])].map(cell).join(','))].join('\n') + '\n';
  },

  /**
   * Get Module State Object
   */
  getState() {
    this.syncCurrent();
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
