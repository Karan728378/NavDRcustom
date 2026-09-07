/* NavDR integration: existing route, simulator, controls and Leaflet surface with shared replay core. */
(function (N) {
  "use strict";
  const el = (id) => document.getElementById(id),
    put = (id, v) => {
      if (el(id)) el(id).textContent = v;
    },
    fmt = (x, n = 1) => (Number.isFinite(x) ? x.toFixed(n) : "—");
  const W = (N.Workbench = {
    seed: 26168,
    graph: null,
    recording: null,
    session: null,
    source: "simulation",
    timer: null,
    watch: null,
    latestGNSS: null,
    reset() {
      this.ablationWorker?.terminate();
      this.ablationWorker = null;
      this.results = null;
      this.resultEvidence = null;
      if (el("run-ablations")) el("run-ablations").disabled = false;
      clearInterval(this.timer);
      this.timer = null;
      this.recording = {
        schema: "navdr.frames.v1",
        provenance: {
          source: this.source,
          seed: this.source === "simulation" ? this.seed : null,
          engine: "NavDR planar-v1",
          created: new Date().toISOString(),
        },
        mount:
          this.source === "device"
            ? null
            : { up: [0, 0, 1], forward: [1, 0, 0] },
        frames: [],
      };
      this.session = new N.Core.NavigationSession({
        ekf: el("use-ekf")?.checked ?? true,
        hmm: el("use-hmm")?.checked ?? true,
        tcn: el("use-tcn")?.checked ?? false,
        mount: this.recording.mount,
        graph: this.graph,
      });
      this.randomState = this.seed;
      this.prevSpeed = null;
      this.prevHeading = null;
      this.lastDraw = -Infinity;
      this.errors = [];
      this.lastOutput = null;
      this.lastTime = null;
      this.lastGNSS = null;
      this.replayData = null;
      this.replayIndex = 0;
      if (el("ablation-results"))
        el("ablation-results").innerHTML =
          '<tr><td colspan="4">Record or import a run to compare configurations.</td></tr>';
      put("run-status", "Ready to start");
      this.render(null);
      if (this.ring) this.ring.setRadius(0);
      for (const id of ["raw-error-line", "output-error-line"])
        el(id)?.setAttribute("points", "");
      put("plot-max", "Waiting for reference");
      put("plot-span", "");
      put("demo-phase", "25 seconds of simulated input");
      put("header-gnss-text", "Ready to start");
      put("header-mode-badge", "Planar navigation lab");
      if (N.Map.map) N.Map.setGnssStatus("ready");
      this.syncMapSource();N.Map.vehicleMarker?.setOpacity?.(0);
    },
    syncMapSource(){
      const map=N.Map.map;if(!map?.hasLayer)return;
      for(const key of ['referenceRouteLine','referenceRouteOutline','gnssZoneLine','gnssZoneOverlay','gnssZoneLabel','entryMarker','exitMarker','startMarker','endMarker']){
        const layer=N.Map[key];if(!layer)continue;
        if(this.source==='simulation'&&!map.hasLayer(layer))layer.addTo(map);
        if(this.source!=='simulation'&&map.hasLayer(layer))map.removeLayer(layer);
      }
    },
    random() {
      this.randomState = (1664525 * this.randomState + 1013904223) >>> 0;
      return this.randomState / 4294967296;
    },
    frame(sim, dt) {
      const p = N.Route.getAtDistance(sim.distanceTravelled),
        v = sim.speedKmh / 3.6;
      const yaw =
        this.prevHeading === null
          ? 0
          : N.Core.wrap(p.heading - this.prevHeading) / dt;
      const a = this.prevSpeed === null ? 0 : (v - this.prevSpeed) / dt;
      this.prevSpeed = v;
      this.prevHeading = p.heading;
      // Reuse the simulator's configured noise and shock controls with a seeded generator.
      const preset = N.Config.NOISE_PRESETS[N.Config.currentNoiseLevel],
        noise = (s) => (this.random() - 0.5) * s * 2;
      const shock = N.Sensors._pendingShock || 0;
      N.Sensors._pendingShock = 0;
      const f = {
        configuration: {
          ekf: this.session.config.ekf,
          hmm: this.session.config.hmm,
          tcn: this.session.config.tcn,
        },
        timestampMs: Math.round(sim.elapsedTime * 1000),
        accel: [
          a + noise(preset.accel),
          -yaw * v + noise(preset.accel),
          9.80665 + noise(preset.accel * 0.4) + shock,
        ],
        gyro: [
          noise(preset.gyro),
          noise(preset.gyro),
          -yaw + noise(preset.gyro),
        ],
        gnss: null,
        reference: { lat: p.lat, lon: p.lng },
      };
      // Synthetic GNSS at the 20 Hz input cadence. Measurements remain separate from evaluation truth.
      if (
        sim.gnssAvailable &&
        (this.lastGNSS === null || f.timestampMs - this.lastGNSS >= N.Config.UPDATE_INTERVAL_MS - 1e-6)
      ) {
        this.lastGNSS = f.timestampMs;
        f.gnss = {
          ...f.reference,
          speedMps: v,
          heading: (p.heading * 180) / Math.PI,
          accuracy: 3,
          timestampMs: f.timestampMs,
        };
      }
      f.gnssAvailable = sim.gnssAvailable;
      return f;
    },
    consume(f) {
      if (this.source === "replay" && f.configuration) {
        this.session.config.ekf = !!f.configuration.ekf;
        this.session.config.hmm = !!f.configuration.hmm;
        this.session.config.tcn = !!f.configuration.tcn;
        el("use-tcn").checked = this.session.config.tcn;
        el("use-ekf").checked = this.session.config.ekf;
        el("use-hmm").checked = this.session.config.hmm;
      }
      this.recording.frames.push(f);
      if (this.recording.frames.length > 200000) {
        N.Simulation.pause();
        throw Error(
          "Recording limit reached; export this run and start a new one",
        );
      }
      const o = this.session.step(f);
      this.lastOutput = o;
      const now = f.timestampMs;
      if (now - this.lastDraw < 200) return;
      this.lastDraw = now;
      this.render(o);
      if (!o.position) {put('gnss-banner-text',o.status);return;}
      if(!N.Map.map)return;
      N.Map.vehicleMarker?.setOpacity?.(1);
      const p = o.position;
      N.Map.updateVehicle(p.lat, p.lon, o.filter?.heading || 0);
      N.Telemetry.setPosition(p.lat, p.lon);
      N.Telemetry.setSpeed((o.filter?.speedMps || this.session.speed) * 3.6);
      N.Telemetry.setHeading(((o.filter?.heading || 0) * 180) / Math.PI);
      N.Telemetry.setError(o.metrics?.outputError ?? null);
      N.Telemetry.setDistance(o.metrics?.outageDistance ?? null);
      if (f.reference)
        N.Map.addReferenceTrailPoint(f.reference.lat, f.reference.lon);
      if (o.raw) N.Map.addDRTrailPoint(o.raw.lat, o.raw.lon);
      N.Map.addFusedTrailPoint(p.lat, p.lon);
      if (this.ring && o.filter && this.session.config.ekf) {
        this.ring.setLatLng([o.filter.position.lat, o.filter.position.lon]);
        this.ring.setRadius(o.filter.radius95);
      }
      for (const k of [
        "drTrailLine",
        "drTrailOutline",
        "fusedTrailLine",
        "fusedTrailOutline",
        "referenceTrailLine",
      ]) {
        const line = N.Map[k];
        if (line && line.getLatLngs().length > 3000)
          line.setLatLngs(line.getLatLngs().slice(-3000));
      }
      if (
        el("follow-vehicle").checked &&
        Math.floor(now / 1000) !== this.lastPan
      ) {
        this.lastPan = Math.floor(now / 1000);
        N.Map.map.panTo([p.lat, p.lon], { animate: false });
      }
      N.Map.setGnssStatus(f.gnssAvailable === false ? "lost" : "available");
      put(
        "header-gnss-text",
        f.gnssAvailable ? "GNSS available" : "GNSS unavailable",
      );
      put(
        "header-mode-badge",
        this.session.config.ekf
          ? this.session.config.hmm
            ? "Planar EKF + HMM"
            : "Planar EKF"
          : "Raw integration",
      );
    },
    render(o) {
      el("btn-source-sim")?.classList.toggle(
        "active",
        this.source === "simulation",
      );
      el("btn-source-device")?.classList.toggle(
        "active",
        this.source === "device",
      );
      const m = o?.metrics;
      const model=this.session?.model.getState();
      put('tcn-status',model?`${model.modelName} · ${model.parameterCount.toLocaleString()} parameters · ${model.modelStatus} · ${fmt(model.measuredRateHz)} Hz input · ${fmt(model.estimatedSpeedMps)} m/s · ${fmt(model.inferenceTimeMs,2)} ms/sample`:'Waiting for IMU');
      put("inspect-forward", fmt(o?.imu?.forward, 3) + " m/s²");
      put("inspect-yaw", fmt(o?.imu?.yawRate, 4) + " rad/s");
      put(
        "inspect-mount",
        this.session?.alignment.ready
          ? "Fixed mount configured"
          : "Calibration required",
      );
      put("inspect-road", o?.match?.status || "No observation");
      if (o?.quality?.available)
        put(
          "native-status",
          `${o.quality.irnss} IRNSS/NavIC satellites; ${o.quality.status}`,
        );
      put("run-status", o?.status || "Ready to start");
      put(
        "source-provenance",
        this.source === "simulation"
          ? "Simulated IMU + GNSS / synthetic reference"
          : this.source === "replay"
            ? "Recorded input / " +
              (this.recording?.provenance.source || "unknown")
            : "Device IMU + GNSS / no independent reference",
      );
      put(
        "hero-drift",
        m?.status === "INSUFFICIENT DATA" ? "—" : fmt(m?.driftPercent),
      );
      put(
        "hero-target",
        m?.status || (o ? "NO REFERENCE DATA" : "WAITING FOR A RUN"),
      );
      put("hero-error", fmt(m?.outputError) + " m");
      put("hero-raw", fmt(m?.rawError) + " m");
      put("hero-time", fmt(m?.outageSeconds) + " s");
      put("hero-distance", fmt(m?.outageDistance) + " m");
      put("hero-improvement", fmt(m?.improvementPercent) + "%");
      put(
        "hero-radius",
        this.session?.config.ekf ? fmt(o?.filter?.radius95) + " m" : "Disabled",
      );
      put("hero-elapsed", fmt(o?.elapsed) + " s");
      put(
        "road-provenance",
        this.graph?.provenance || "No road graph loaded. HMM unavailable.",
      );
      put("match-status", o?.match?.status || "Waiting for a road observation");
      put(
        "filter-status",
        o?.filter
          ? `Last update: ${o.filter.status}; ${o.filter.rejected} rejected fixes`
          : o?.status || "Waiting for first GNSS fix",
      );
      if (m) {
        this.errors.push([o.elapsed, m.rawError, m.outputError]);
        if (this.errors.length > 600) this.errors.shift();
        this.plot();
      }
    },
    plot() {
      const svg = el("error-plot"),
        pts = this.errors;
      if (!svg || !pts.length) return;
      const xmin = pts[0][0],
        span = Math.max(1, pts.at(-1)[0] - xmin),
        max = Math.max(5, ...pts.flatMap((p) => p.slice(1)));
      for (const [i, id] of [
        [1, "raw-error-line"],
        [2, "output-error-line"],
      ])
        el(id).setAttribute(
          "points",
          pts
            .map(
              (p) =>
                `${40 + ((p[0] - xmin) / span) * 720},${135 - (p[i] / max) * 115}`,
            )
            .join(" "),
        );
      put("plot-max", fmt(max) + " m");
      put("plot-span", fmt(span) + " seconds shown");
    },
    runReplay(data) {
      N.Simulation.pause();
      this.source = "replay";
      this.reset();
      this.recording = { ...data, frames: [] };
      if (data.graph) {
        new N.RoadHMM(data.graph);
        this.graph = data.graph;
      }
      if (data.configuration) {
        el("use-ekf").checked = data.configuration.ekf;
        el("use-hmm").checked = data.configuration.hmm;
        el("use-tcn").checked = !!data.configuration.tcn;
      }
      this.session = new N.Core.NavigationSession({
        ekf: el("use-ekf").checked,
        hmm: el("use-hmm").checked,
        tcn: el("use-tcn").checked,
        mount: data.mount || null,
        graph: this.graph,
      });
      N.Map.clearTrails();
      this.replayData = data;
      this.replayIndex = 0;
      this.resumeReplay();
    },
    resumeReplay() {
      if (!this.replayData) return;
      N.Simulation.running = true;
      N.Simulation.paused = false;
      N.Simulation.finished = false;
      N.Simulation._updateButtons();
      this.timer = setInterval(() => {
        try {
          for (
            let n = 0;
            n < 10 && this.replayIndex < this.replayData.frames.length;
            n++
          )
            this.consume(this.replayData.frames[this.replayIndex++]);
          if (this.replayIndex >= this.replayData.frames.length) {
            this.render(this.lastOutput);
            clearInterval(this.timer);
            this.timer = null;
            N.Simulation.paused = true;
            N.Simulation.finished = true;
            N.Simulation._updateButtons();
            put("run-status", this.lastOutput?.position?"Replay complete":"Replay complete; "+this.lastOutput?.status);
          }
        } catch (e) {
          N.Simulation.pause();
          put("run-status", e.message);
        }
      }, 20);
    },
    async device() {
      N.Simulation.reset();
      this.source = "device";
      this.reset();
      N.Simulation._updateButtons();
      this.stationary = [];
      setTimeout(() => {
        if (this.source === "device" && !this.stationary.length)
          put(
            "run-status",
            "No motion samples received. Use a compatible phone or select simulation.",
          );
      }, 3000);
      this.latestGNSS = null;
      this.usedFix = null;
      this.session.alignment.setMount(null);
      put(
        "run-status",
        "Place phone flat, top edge pointing forward; then calibrate.",
      );
      try {
        if (typeof DeviceMotionEvent === "undefined")
          throw Error(
            "Motion sensors unavailable. Use simulation or import a recording.",
          );
        if (
          typeof DeviceMotionEvent.requestPermission === "function" &&
          (await DeviceMotionEvent.requestPermission()) !== "granted"
        )
          throw Error("Motion permission denied");
        if (!navigator.geolocation) throw Error("Geolocation unavailable");
        if (this.watch !== null) navigator.geolocation.clearWatch(this.watch);
        this.watch = navigator.geolocation.watchPosition(
          (p) => {
            this.latestGNSS = {
              lat: p.coords.latitude,
              lon: p.coords.longitude,
              accuracy: p.coords.accuracy,
              speedMps: p.coords.speed ?? undefined,
              heading: p.coords.heading ?? undefined,
              timestampMs: performance.now(),
            };
          },
          (e) => put("run-status", "GNSS unavailable: " + e.message),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
        );
        if (!this.motionHandler) {
          this.motionHandler = (e) => {
            if (this.source !== "device" || this.watch === null) return;
            const a = e.accelerationIncludingGravity,
              r = e.rotationRate;
            if (
              !a ||
              !r ||
              ![a.x, a.y, a.z, r.alpha, r.beta, r.gamma].every(Number.isFinite)
            )
              return;
            const t = performance.now();
            this.stationary = this.stationary || [];
            this.stationary.push([a.x, a.y, a.z]);
            if (this.stationary.length > 50) this.stationary.shift();
            if (!this.session.alignment.ready) return;
            const g = this.latestGNSS;
            const fresh = g && t - g.timestampMs < 2000;
            const f = {
              timestampMs: t,
              accel: [a.x, a.y, a.z],
              gyro: [r.beta, r.gamma, r.alpha].map((x) => (x * Math.PI) / 180),
              gnss: fresh && g.timestampMs !== this.usedFix ? g : null,
              gnssAvailable: !!fresh,
            };
            if (f.gnss) this.usedFix = g.timestampMs;
            try {
              this.consume(f);
            } catch (err) {
              if(this.watch!==null)navigator.geolocation.clearWatch(this.watch);this.watch=null;
              put("run-status", err.message);
            }
          };
          window.addEventListener("devicemotion", this.motionHandler);
        }
      } catch (e) {
        put("run-status", e.message);
      }
    },
  });
  // Replace only orchestration: preserve existing simulator route, controls, sensor inspection and map.
  const S = N.Simulation,
    oldStart = S.start,
    oldReset = S.reset,
    oldPause = S.pause;
  const originalButtons = S._updateButtons;
  S._updateButtons = function () {
    originalButtons.call(this);
    if(this.finished)el('btn-start').textContent=W.source==='replay'?'Replay again':'Restart';
    if (W.source !== "simulation")
      for (const id of [
        "btn-gnss-loss",
        "btn-gnss-restore",
        "btn-speed-up",
        "btn-speed-down",
      ])
        el(id).disabled = true;
    el("btn-reset").disabled =
      !this.running &&
      !this.finished &&
      !W.recording?.frames.length &&
      W.source !== "device";
  };
  S.start = function () {
    if (W.source === "replay") {
      if (this.finished) W.runReplay(W.replayData);
      else W.resumeReplay();
      return;
    }
    if (W.source !== "simulation") {
      put("run-status", "Select Simulation to start a synthetic run.");
      return;
    }
    const fresh = !this.running || this.finished;
    oldStart.call(this);
    if (fresh) W.reset();
  };
  S.reset = function () {
    if (W.watch !== null && typeof navigator !== "undefined")
      navigator.geolocation.clearWatch(W.watch);
    W.watch = null;
    oldReset.call(this);
    N.SIHDemo?.cancel();
    W.reset();
  };
  S.pause = function () {
    oldPause.call(this);
    if (W.lastOutput) W.render(W.lastOutput);
    clearInterval(W.timer);
    W.timer = null;
    put("run-status", "Paused");
  };
  W.tick = function () {
    const simTick = function () {
      if (!this.running || this.paused || this.finished) return;
      const dt = 0.01;
      this.elapsedTime += dt;
      this.distanceTravelled += (this.speedKmh / 3.6) * dt;
      if (this.distanceTravelled >= N.Route.totalLength) {
        this.finished = true;
        this._stopLoop();
        this._updateButtons();
        put("run-status", "Route complete");
        return;
      }
      if (this.autoGNSSZone && !this._manualGNSSOverride) {
        const denied =
          this.distanceTravelled >= N.Route.gnssBlockedDistStart &&
          this.distanceTravelled <= N.Route.gnssBlockedDistEnd;
        if (denied && this.gnssAvailable) this._setGNSSLost();
        if (!denied && !this.gnssAvailable) this._setGNSSRestored();
      }
      const f = W.frame(this, dt);
      this.refLat = f.reference.lat;
      this.refLng = f.reference.lon;
      this.refHeading = W.prevHeading;
      try {
        W.consume(f);
      } catch (e) {
        this.pause();
        put("run-status", e.message);
      }
      N.SIHDemo?.update(dt);
      N.AccuracyBenchmark.advance?.(dt);
    };
    for(let i=0;i<5;i++)simTick.call(S);
  };
  document.addEventListener("DOMContentLoaded", () => {
    W.reset();
    el('playback-rate').onchange=e=>{S.playbackRate=Number(e.target.value);};
    fetch("data/delhi-roads.osm.json")
      .then((r) => {
        if (!r.ok) throw Error("Road download unavailable");
        return r.json();
      })
      .then((osm) => {
        if (W.graph || W.recording.frames.length) return;
        const graph = N.RoadHMM.fromOSM(osm);
        graph.provenance =
          "OpenStreetMap Delhi corridor, " +
          osm.osm3s.timestamp_osm_base +
          "; ODbL. Turn restrictions excluded.";
        W.graph = graph;
        W.session.matcher = new N.RoadHMM(graph);
        put("road-provenance", graph.provenance);
      })
      .catch((e) =>
        put("road-provenance", e.message + "; import a graph to enable HMM."),
      );
    if (N.Map.map) {
      W.ring = L.circle([28.615, 77.21], {
        radius: 0,
        color: "#245DA8",
        weight: 1,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(N.Map.map);
      N.Map.referenceTrailLine = L.polyline([], {
        color: "#20364A",
        weight: 2,
        dashArray: "5 5",
      }).addTo(N.Map.map);
      N.Map.addReferenceTrailPoint = function (lat, lon) {
        this.referenceTrailLine.addLatLng([lat, lon]);
      };
    }
    put("speed-button-label", "");
    el("btn-speed-up").textContent = "Increase speed";
    el("btn-speed-down").textContent = "Decrease speed";
    document
      .querySelectorAll("[data-scenario]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            N.AccuracyBenchmark.runScenario(b.dataset.scenario)),
      );
    el("btn-run-suite").onclick = () => N.AccuracyBenchmark.runSuite();
    el("btn-export-benchmark").onclick = () => N.AccuracyBenchmark.exportCSV();
    el("btn-reset-benchmark").onclick = () => N.AccuracyBenchmark.resetAll();
    for (const level of ["low", "medium", "high"])
      el("btn-noise-" + level).onclick = () => {
        N.Config.currentNoiseLevel = level.toUpperCase();
        for (const other of ["low", "medium", "high"])
          el("btn-noise-" + other).classList.toggle("active", level === other);
      };
    el("btn-trigger-shock").onclick = () => {
      N.Sensors._pendingShock = 8.5;
    };
    el("btn-demo").onclick = () => N.SIHDemo.startDemo();
    el("export-recording").onclick = () =>
      N.Replay.download(
        { ...W.recording, configuration: W.session.config, graph: W.graph },
        "navdr-recording.json",
      );
    el("run-ablations").onclick = () => {
      if (!W.recording.frames.length) {
        put("run-status", "Record or import a run first");
        return;
      }
      W.ablationWorker?.terminate();
      const worker = (W.ablationWorker = new Worker("js/replay-worker.js?v=tcn1"));
      el("run-ablations").disabled = true;
      put("run-status", "Computing independent ablations");
      const done = () => {
        worker.terminate();
        W.ablationWorker = null;
        el("run-ablations").disabled = false;
      };
      worker.onerror = (e) => {
        put("run-status", "Ablation worker failed: " + e.message);
        done();
      };
      worker.onmessage = (e) => {
        if (e.data.error) {
          put("run-status", e.data.error);
          done();
          return;
        }
        const results = e.data.results;
        el("ablation-results").replaceChildren();
        for (const r of results) {
          const tr = document.createElement("tr");
          for (const value of [
            r.configuration.name,
            fmt(r.metrics?.maxOutput) + " m",
            fmt(r.metrics?.driftPercent) + "%",
            r.metrics?.status || r.status,
          ]) {
            const td = document.createElement("td");
            td.textContent = value;
            tr.append(td);
          }
          el("ablation-results").append(tr);
        }
        W.results = results;
        W.resultEvidence = e.data.evidence;
        put("run-status", "Ablations complete");
        done();
      };
      worker.postMessage({ recording: W.recording, graph: W.graph });
    };
    el("export-results").onclick = () => {
      if (!W.results) {
        put("run-status", "Run ablations before exporting results");
        return;
      }
      N.Replay.download(
        {
          schema: "navdr.results.v1",
          ...W.resultEvidence,
          results: W.results || [],
        },
        "navdr-ablation-results.json",
      );
    };
    el("import-recording").onchange = async (e) => {
      try {
        W.runReplay(N.Replay.parse(await e.target.files[0].text()));
      } catch (err) {
        put("run-status", err.message);
      }
    };
    el("import-roads").onchange = async (e) => {
      try {
        const data = JSON.parse(await e.target.files[0].text());
        if (W.recording.frames.length)
          throw Error("Reset before changing the road graph");
        const graph = data.elements ? N.RoadHMM.fromOSM(data) : data;
        new N.RoadHMM(graph);
        W.graph = graph;
        W.session.matcher = new N.RoadHMM(graph);
        put("road-provenance", graph.provenance || "User imported road graph");
      } catch (err) {
        put("run-status", err.message);
      }
    };
    for (const id of ["use-ekf", "use-hmm", "use-tcn"])
      el(id).onchange = () => {
        if (W.ring && !el("use-ekf").checked) W.ring.setRadius(0);
        W.session.config.ekf = el("use-ekf").checked;
        W.session.config.hmm = el("use-hmm").checked;
        W.session.config.tcn = el("use-tcn").checked;
        put(
          "run-status",
          "Output changed. Use ablations for a fixed-configuration comparison.",
        );
      };
    el("calibrate-mount").onclick = () => {
      try {
        W.session.alignment.calibrate(W.stationary || [], [0, 1, 0]);
        W.recording.mount = W.session.alignment.mount;
        put(
          "run-status",
          "Mount calibrated. Keep the phone fixed; waiting for GNSS.",
        );
      } catch (e) {
        put("run-status", e.message);
      }
    };
    el("btn-source-device").addEventListener(
      "click",
      (e) => {
        e.stopImmediatePropagation();
        W.device();
      },
      true,
    );
    el("btn-source-sim").addEventListener(
      "click",
      (e) => {
        e.stopImmediatePropagation();
        W.source = "simulation";
        if (W.watch !== null) navigator.geolocation.clearWatch(W.watch);
        W.watch = null;
        S.reset();
      },
      true,
    );
    el("load-demo-roads").onclick = () => {
      if (N.Simulation.running) {
        put("run-status", "Reset before changing the road graph");
        return;
      }
      const nodes = N.RouteData.keyWaypoints.map((p, i) => ({
        id: String(i),
        lat: p[0],
        lon: p[1],
      }));
      const edges = [];
      for (let i = 1; i < nodes.length; i++) {
        edges.push(
          { from: String(i - 1), to: String(i) },
          { from: String(i), to: String(i - 1) },
        );
      }
      const anchor = nodes[5];
      nodes.push({ id: "branch", lat: anchor.lat + 0.003, lon: anchor.lon });
      edges.push({ from: "5", to: "branch" }, { from: "branch", to: "5" });
      W.graph = {
        nodes,
        edges,
        provenance:
          "Synthetic route graph with test branch. Shares simulation route; not independent validation.",
      };
      W.session.matcher = new N.RoadHMM(W.graph);
      put("road-provenance", W.graph.provenance);
    };
  });
})(window.NavDR);
