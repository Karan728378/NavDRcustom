/* ═══════════════════════════════════════════════════════
   IDRN — Accuracy Testing & SIH Benchmark Engine
   SIH 2026 Problem Statement 26168
   ═══════════════════════════════════════════════════════ */

window.IDRN = window.IDRN || {};

IDRN.AccuracyBenchmark = {
    // ── Module State ──
    enabled: true,
    _running: true,
    currentScenario: 'CUSTOM', // 'SHORT_TUNNEL' | 'URBAN_CANYON' | 'LONG_TUNNEL' | 'EXTENDED_OUTAGE' | 'CUSTOM'

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

    currentNavMode: 'GNSS',
    benchmarkStatus: 'INSUFFICIENT DATA', // 'PASS' | 'ABOVE TARGET' | 'INSUFFICIENT DATA'
    pipelinePhase: 'GNSS AVAILABLE', // 'GNSS AVAILABLE' | 'GNSS OUTAGE DETECTED' | 'DEAD RECKONING ACTIVE' | 'MAP MATCHING ACTIVE' | 'AI CORRECTION ACTIVE' | 'GNSS RECOVERY'

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
        this.enabled = IDRN.Config.ACCURACY_BENCHMARK ? IDRN.Config.ACCURACY_BENCHMARK.ENABLED : true;
        this.reset();
        console.log('[AccuracyBenchmark] SIH Prototype Accuracy Benchmark Module initialized.');
    },

    /**
     * Reset live evaluation run data
     */
    reset() {
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

        this.currentNavMode = 'GNSS';
        this.benchmarkStatus = 'INSUFFICIENT DATA';
        this.pipelinePhase = 'GNSS AVAILABLE';
    },

    /**
     * Reset both live run and history table
     */
    resetAll() {
        this.reset();
        this.history = [];
        this.currentScenario = 'CUSTOM';
        if (IDRN.AccuracyUI) IDRN.AccuracyUI.updateHistoryTable(this.history);
        if (IDRN.Notifications) IDRN.Notifications.show('Benchmark history reset', 'info', 2000);
    },

    /**
     * Select a predefined evaluation scenario
     */
    selectScenario(scenarioKey) {
        this.currentScenario = scenarioKey;
        if (IDRN.AccuracyUI) IDRN.AccuracyUI.updateScenarioSelection(scenarioKey);
    },

    /**
     * Run selected scenario test
     */
    runScenario(scenarioKey) {
        this.selectScenario(scenarioKey);
        const C = IDRN.Config.ACCURACY_BENCHMARK ? IDRN.Config.ACCURACY_BENCHMARK.SCENARIOS : {};
        const scenario = C[scenarioKey] || { name: 'Custom Scenario', targetDurationSec: 10, expectedDistM: 100 };

        this.reset();
        this.currentScenario = scenarioKey;

        // Ensure simulation is running
        if (IDRN.Simulation && !IDRN.Simulation.running) {
            IDRN.Simulation.start();
        }

        if (IDRN.Notifications) {
            IDRN.Notifications.show(`Starting Scenario Test: ${scenario.name} (${scenario.targetDurationSec}s Outage)`, 'info', 3000);
        }

        // Trigger GNSS loss after 1 second warm-up
        setTimeout(() => {
            if (IDRN.Simulation) {
                IDRN.Simulation.simulateGnssLoss();
            }

            // Set timer to restore GNSS after target duration
            this._scenarioTimer = setTimeout(() => {
                if (IDRN.Simulation) {
                    IDRN.Simulation.restoreGnss();
                }
                this._recordHistoryRun(scenario.name);
                if (IDRN.Notifications) {
                    IDRN.Notifications.show(`Scenario ${scenario.name} Completed — Benchmark Recorded`, 'success', 3500);
                }
            }, scenario.targetDurationSec * 1000);

        }, 1000);
    },

    /**
     * Sequentially run all four evaluation scenarios
     */
    runSuite() {
        const suiteKeys = ['SHORT_TUNNEL', 'URBAN_CANYON', 'LONG_TUNNEL', 'EXTENDED_OUTAGE'];
        this._autoSuiteActive = true;
        this._suiteStep = 0;

        const executeStep = () => {
            if (!this._autoSuiteActive || this._suiteStep >= suiteKeys.length) {
                this._autoSuiteActive = false;
                if (IDRN.Notifications) {
                    IDRN.Notifications.show('Full Benchmark Suite Execution Completed!', 'success', 4000);
                }
                return;
            }

            const key = suiteKeys[this._suiteStep];
            const C = IDRN.Config.ACCURACY_BENCHMARK.SCENARIOS[key];
            this.runScenario(key);

            // Schedule next step after outage duration + 5s recovery window
            const waitTimeMs = (C.targetDurationSec + 6) * 1000;
            this._suiteStep++;
            this._scenarioTimer = setTimeout(executeStep, waitTimeMs);
        };

        executeStep();
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
            improvement: parseFloat(this.improvementPercent.toFixed(1)),
            correctedDriftPct: parseFloat(this.correctedDriftPercent.toFixed(1)),
            status: this.benchmarkStatus
        };

        this.history.unshift(run); // Add latest run to top
        if (this.history.length > 10) this.history.pop(); // Keep top 10 runs

        if (IDRN.AccuracyUI) {
            IDRN.AccuracyUI.updateHistoryTable(this.history);
        }
    },

    /**
     * Main evaluation loop called every tick from app.js
     */
    update(dt, cleanSensors, drState, mmState, sfState, aiMotionState, aiDriftState, gnssData) {
        if (!this._running || !this.enabled) return this.getState();

        this.elapsedTestTime = parseFloat((this.elapsedTestTime + dt).toFixed(1));
        this.gnssAvailable = gnssData ? gnssData.available : true;

        if (drState) {
            this.distanceTravelled = parseFloat((drState.travelledDistanceM || 0).toFixed(1));
        }

        // Determine Navigation Mode & Pipeline Demo Phase
        if (this.gnssAvailable) {
            this.currentNavMode = 'GNSS';
            if (sfState && sfState.recoveryActive) {
                this.pipelinePhase = 'GNSS RECOVERY';
            } else {
                this.pipelinePhase = 'GNSS AVAILABLE';
            }
        } else {
            if (aiDriftState && aiDriftState.correctionApplied) {
                this.pipelinePhase = 'AI CORRECTION ACTIVE';
                this.currentNavMode = 'AI_CORRECTED';
            } else if (mmState && mmState.status === 'MATCHED') {
                this.pipelinePhase = 'MAP MATCHING ACTIVE';
                this.currentNavMode = 'MAP_MATCHED';
            } else {
                this.pipelinePhase = 'DEAD RECKONING ACTIVE';
                this.currentNavMode = 'DEAD_RECKONING';
            }
        }

        // GNSS Outage Evaluation Calculations
        if (!this.gnssAvailable) {
            this.gnssOutageDuration = parseFloat((this.gnssOutageDuration + dt).toFixed(1));

            if (aiDriftState) {
                this.outageDistanceMeters = aiDriftState.outageDistanceMeters || 0;
                this.rawErrorMeters = aiDriftState.rawDRDeviationMeters || 0;
                this.correctedErrorMeters = aiDriftState.correctedDeviationMeters || 0;
                this.improvementPercent = aiDriftState.improvementPercent || 0;
            }

            // Max & Mean Accumulators
            this.maxRawError = Math.max(this.maxRawError, this.rawErrorMeters);
            this.maxCorrectedError = Math.max(this.maxCorrectedError, this.correctedErrorMeters);

            this.sumRawError += this.rawErrorMeters;
            this.sumCorrectedError += this.correctedErrorMeters;
            this.sampleCount++;

            this.avgRawError = parseFloat((this.sumRawError / this.sampleCount).toFixed(2));
            this.avgCorrectedError = parseFloat((this.sumCorrectedError / this.sampleCount).toFixed(2));

            // Drift Percentages (Safe division by zero protection!)
            if (this.outageDistanceMeters > 2.0) {
                this.rawDriftPercent = parseFloat(((this.maxRawError / this.outageDistanceMeters) * 100).toFixed(1));
                this.correctedDriftPercent = parseFloat(((this.maxCorrectedError / this.outageDistanceMeters) * 100).toFixed(1));
            } else {
                this.rawDriftPercent = 0;
                this.correctedDriftPercent = 0;
            }

            // Evaluate Benchmark Target Status
            if (this.gnssOutageDuration < 3.0 || this.outageDistanceMeters < 5.0) {
                this.benchmarkStatus = 'INSUFFICIENT DATA';
            } else if (this.correctedDriftPercent < 10.0) {
                this.benchmarkStatus = 'PASS';
            } else {
                this.benchmarkStatus = 'ABOVE TARGET';
            }
        }

        return this.getState();
    },

    /**
     * Export collected benchmark dataset as CSV file
     */
    exportCSV() {
        if (!this.history || this.history.length === 0) {
            // Include current run if history table empty
            this._recordHistoryRun('Live Evaluation');
        }

        let csvContent = 'data:text/csv;charset=utf-8,';
        csvContent += 'Run ID,Timestamp,Scenario,Outage Duration (s),Distance (m),Raw DR Error (m),AI Corrected Error (m),Improvement %,Corrected Drift %,SIH Status\n';

        this.history.forEach(row => {
            csvContent += `${row.id},"${row.timestamp}","${row.scenario}",${row.outageDuration},${row.distance},${row.rawError},${row.correctedError},${row.improvement},${row.correctedDriftPct},"${row.status}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `idrn_accuracy_benchmark_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (IDRN.Notifications) {
            IDRN.Notifications.show('Exported Accuracy Benchmark CSV file', 'success', 3000);
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
            history: [...this.history]
        };
    }
};
