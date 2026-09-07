/* NavDR guided demonstration driven by simulation time. Pause freezes phases. */
NavDR.SIHDemo = {
  active: false,
  time: 0,
  phase: "Ready",
  cancel() {
    this.active = false;
    this.time = 0;
    this.timeMs = 0;
  },
  startDemo() {
    NavDR.Workbench.source = "simulation";
    NavDR.Simulation.reset();
    NavDR.Simulation.autoGNSSZone = false;
    document.getElementById("chk-auto-gnss").checked = false;
    NavDR.Simulation.start();
    this.active = true;
    this.time = 0;
    this.timeMs = 0;
    this.phase = "GNSS warm-up";
  },
  update(dt) {
    if (!this.active) return;
    const before = this.time;
    this.timeMs += dt * 1000;
    this.time = this.timeMs / 1000;
    if (before < 3 && this.time >= 3) {
      NavDR.Simulation.loseGNSS();
      this.phase = "17-second outage";
    }
    if (before < 20 && this.time >= 20) {
      NavDR.Simulation.restoreGNSS();
      this.phase = "GNSS recovery";
    }
    if (this.time >= 25) {
      this.active = false;
      this.phase = "Complete";
      NavDR.Simulation.pause();
    }
    document.getElementById("demo-phase").textContent = this.phase;
  },
};
