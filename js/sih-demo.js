/* ═══════════════════════════════════════════════════════
   IDRN — Final SIH 2026 Guided Demo & Judge Presentation Module
   SIH 2026 Problem Statement 26168
   ═══════════════════════════════════════════════════════ */

window.IDRN = window.IDRN || {};

IDRN.SIHDemo = {
    // ── Module State ──
    enabled: true,
    demoActive: false,
    currentPhase: 1, // 1 to 5
    phaseName: 'PHASE 1 — GNSS AVAILABLE',
    demoGuideVisible: false,
    _demoTimer: null,
    _phaseTimer: null,

    /**
     * Initialize SIHDemo module
     */
    initialize() {
        this.enabled = IDRN.Config.SIH_DEMO ? IDRN.Config.SIH_DEMO.ENABLED : true;
        this.resetDemo();
        console.log('[SIHDemo] Final SIH 2026 Guided Demo Module initialized.');
    },

    /**
     * Start the guided end-to-end SIH judge demonstration
     */
    startDemo() {
        this.resetDemo();
        this.demoActive = true;
        this.currentPhase = 1;
        this.phaseName = 'PHASE 1 — GNSS AVAILABLE';

        if (IDRN.Notifications) {
            IDRN.Notifications.show('SIH 2026 Guided Judge Demonstration Started', 'info', 3000);
        }

        // 1. Ensure Simulation is Running with GNSS Available
        if (IDRN.Simulation) {
            if (!IDRN.Simulation.running) {
                IDRN.Simulation.start();
            }
            if (!IDRN.Simulation.gnssAvailable) {
                IDRN.Simulation.restoreGnss();
            }
        }

        // 2. Schedule Phase 2: GNSS Outage Trigger after 3 seconds
        this._demoTimer = setTimeout(() => {
            if (!this.demoActive) return;
            this.currentPhase = 2;
            this.phaseName = 'PHASE 2 — GNSS OUTAGE DETECTED';

            if (IDRN.Simulation) {
                IDRN.Simulation.simulateGnssLoss();
            }
            if (IDRN.Notifications) {
                IDRN.Notifications.show('GNSS Denied Zone Entered — AI Dead Reckoning Activated', 'warning', 3000);
            }

            // 3. Schedule Phase 3: AI Navigation Active after 4 seconds
            this._demoTimer = setTimeout(() => {
                if (!this.demoActive) return;
                this.currentPhase = 3;
                this.phaseName = 'PHASE 3 — AI NAVIGATION';

                if (IDRN.Notifications) {
                    IDRN.Notifications.show('AI Speed & Drift Correction Operating in Real-Time', 'info', 3000);
                }

                // 4. Schedule Phase 4: GNSS Recovery after 13 seconds (Total outage = 17s)
                this._demoTimer = setTimeout(() => {
                    if (!this.demoActive) return;
                    this.currentPhase = 4;
                    this.phaseName = 'PHASE 4 — GNSS RECOVERY';

                    if (IDRN.Simulation) {
                        IDRN.Simulation.restoreGnss();
                    }
                    if (IDRN.Notifications) {
                        IDRN.Notifications.show('GNSS Signal Restored — Smooth Recovery Convergence Active', 'success', 3000);
                    }

                    // 5. Schedule Phase 5: Demo Completed & Results Summary after 5 seconds
                    this._demoTimer = setTimeout(() => {
                        if (!this.demoActive) return;
                        this.currentPhase = 5;
                        this.phaseName = 'PHASE 5 — FINAL RESULT';

                        if (IDRN.Notifications) {
                            IDRN.Notifications.show('SIH 2026 Navigation Demonstration Completed!', 'success', 4000);
                        }
                    }, 5000);

                }, 13000);

            }, 4000);

        }, 3000);

        if (IDRN.SIHUI) IDRN.SIHUI.updateDemoState(this.getState());
    },

    /**
     * One-Click Demo Reset: Safely clears simulation, GNSS, AI, Map, Charts & Benchmark state
     */
    resetDemo() {
        if (this._demoTimer) clearTimeout(this._demoTimer);
        if (this._phaseTimer) clearTimeout(this._phaseTimer);
        this._demoTimer = null;
        this._phaseTimer = null;

        this.demoActive = false;
        this.currentPhase = 1;
        this.phaseName = 'PHASE 1 — GNSS AVAILABLE';

        // Reset main simulation and modules
        if (IDRN.Simulation) {
            IDRN.Simulation.reset();
        }

        if (IDRN.SIHUI) IDRN.SIHUI.updateDemoState(this.getState());
        if (IDRN.Notifications) IDRN.Notifications.show('SIH Demo System Reset to Baseline', 'info', 2000);
    },

    /**
     * Toggle Presenter's Demo Guide Panel
     */
    toggleGuide() {
        this.demoGuideVisible = !this.demoGuideVisible;
        if (IDRN.SIHUI) IDRN.SIHUI.toggleGuide(this.demoGuideVisible);
    },

    /**
     * Main update loop called from app.js tick loop
     */
    update(dt, drState, mmState, sfState, aiState, aiDriftState, benchState, gnssData) {
        if (!this.enabled) return this.getState();

        // Dynamically update demo state UI
        if (IDRN.SIHUI) {
            IDRN.SIHUI.updateHeroStatus(drState, mmState, sfState, aiState, aiDriftState, benchState, gnssData);
            IDRN.SIHUI.updatePipelineStages(drState, mmState, sfState, aiState, aiDriftState, gnssData);
        }

        return this.getState();
    },

    /**
     * Get state snapshot
     */
    getState() {
        return {
            enabled: this.enabled,
            demoActive: this.demoActive,
            currentPhase: this.currentPhase,
            phaseName: this.phaseName,
            demoGuideVisible: this.demoGuideVisible
        };
    }
};
