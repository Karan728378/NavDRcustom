/* NavDR navigation core. SI units, monotonic sample time, no reference input to estimators.
 * Conventional mounted-phone alignment and six-state planar EKF, not EqNIO/ESKF.
 */
(function (N) {
  "use strict";
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (a) => {
    const n = Math.hypot(...a);
    if (n < 1e-8) throw Error("Degenerate mounting axis");
    return a.map((v) => v / n);
  };
  const zeros = (n, m = n) => Array.from({ length: n }, () => Array(m).fill(0));
  const eye = (n) => zeros(n).map((r, i) => ((r[i] = 1), r));
  const tr = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  const mul = (A, B) => A.map((r) => tr(B).map((c) => dot(r, c)));
  const add = (A, B) => A.map((r, i) => r.map((v, j) => v + B[i][j]));
  const local = (p, o) => [
    (((p.lat - o.lat) * Math.PI) / 180) * 6371000,
    (((p.lon - o.lon) * Math.PI) / 180) *
      6371000 *
      Math.cos((o.lat * Math.PI) / 180),
  ];
  const geo = (p, o) => ({
    lat: o.lat + ((p[0] / 6371000) * 180) / Math.PI,
    lon:
      o.lon +
      ((p[1] / (6371000 * Math.cos((o.lat * Math.PI) / 180))) * 180) / Math.PI,
  });
  const distance = (a, b) => Math.hypot(...local(a, b));
  class FrameAlignment {
    constructor(mount) {
      this.setMount(mount);
    }
    setMount(mount) {
      this.ready = !!mount;
      this.mount = mount || null;
      if (!mount) return;
      if (
        !["up", "forward"].every(
          (k) =>
            Array.isArray(mount[k]) &&
            mount[k].length === 3 &&
            mount[k].every(Number.isFinite),
        )
      )
        throw Error("Mount requires finite up and forward XYZ vectors");
      this.up = unit(mount.up);
      this.forward = unit(
        mount.forward.map(
          (v, i) => v - dot(mount.forward, this.up) * this.up[i],
        ),
      );
      this.left = unit(cross(this.up, this.forward));
    }
    process(accel, gyro) {
      if (!this.ready) return null;
      const linear = accel.map((v, i) => v - 9.80665 * this.up[i]);
      // Device right-hand rotation around up is counterclockwise; geographic bearings increase clockwise.
      return {
        forward: dot(linear, this.forward),
        lateral: dot(linear, this.left),
        vertical: dot(linear, this.up),
        yawRate: -dot(gyro, this.up),
      };
    }
    // Gravity alone cannot identify forward yaw. This calibration requires a supplied mounting direction.
    calibrate(stationarySamples, forward) {
      if (stationarySamples.length < 20)
        throw Error("Use at least 20 stationary samples");
      const avg = [0, 1, 2].map(
        (i) =>
          stationarySamples.reduce((s, a) => s + a[i], 0) /
          stationarySamples.length,
      );
      if (
        stationarySamples.some(
          (a) => Math.hypot(...a.map((v, i) => v - avg[i])) > 0.5,
        ) ||
        Math.abs(Math.hypot(...avg) - 9.80665) > 0.5
      )
        throw Error("Keep the mounted phone still during calibration");
      this.setMount({ up: avg, forward });
      return this.mount;
    }
  }
  class PlanarEKF {
    constructor() {
      this.x = null;
      this.P = null;
      this.lastFix = null;
      this.rejected = 0;
      this.status = "WAITING FOR GNSS";
    }
    initialize(g) {
      this.origin = { lat: g.lat, lon: g.lon };
      this.x = [
        0,
        0,
        g.speedMps || 0,
        ((g.heading || 0) * Math.PI) / 180,
        0,
        0,
      ];
      this.P = eye(6);
      [g.accuracy ** 2, g.accuracy ** 2, 4, 0.25, 0.04, 0.0025].forEach(
        (v, i) => (this.P[i][i] = v),
      );
    }
    predict(imu, dt) {
      if (!this.x) return;
      const [n, e, v, h, ba, bg] = this.x,
        a = imu.forward - ba,
        w = imu.yawRate - bg,
        c = Math.cos(h),
        s = Math.sin(h);
      const F = eye(6);
      F[0][2] = c * dt;
      F[0][3] = -v * s * dt;
      F[1][2] = s * dt;
      F[1][3] = v * c * dt;
      F[2][4] = -dt;
      F[3][5] = -dt;
      this.x = [
        n + v * c * dt,
        e + v * s * dt,
        Math.max(0, Math.min(60, v + a * dt)),
        wrap(h + w * dt),
        ba,
        bg,
      ];
      const Q = zeros(6);
      [0.02, 0.02, 0.6, 0.003, 0.0001, 0.00001].forEach(
        (q, i) => (Q[i][i] = q * dt),
      );
      this.P = add(mul(mul(F, this.P), tr(F)), Q);
    }
    scalar(z, H, R, angle = false, gate = Infinity) {
      const ph = this.P.map((r) => dot(r, H)),
        S = dot(H, ph) + R;
      const y = angle ? wrap(z - dot(H, this.x)) : z - dot(H, this.x);
      if ((y * y) / S > gate) return false;
      const K = ph.map((v) => v / S);
      this.x = this.x.map((v, i) => v + K[i] * y);
      this.x[3] = wrap(this.x[3]);
      const A = eye(6).map((r, i) => r.map((v, j) => v - K[i] * H[j]));
      this.P = add(
        mul(mul(A, this.P), tr(A)),
        K.map((a) => K.map((b) => a * b * R)),
      );
      return true;
    }
    observe(g) {
      if (!g) return;
      if (!this.x) {
        if (!Number.isFinite(g.heading) || !(g.speedMps > 2)) {
          this.status = "WAITING FOR MOVING GNSS COURSE";
          return;
        }
        this.initialize(g);
        this.lastFix = g.timestampMs;
        this.status = "GNSS INITIALIZED";
        return;
      }
      if (g.timestampMs === this.lastFix) return;
      this.lastFix = g.timestampMs;
      const z = local(g, this.origin),
        d = [z[0] - this.x[0], z[1] - this.x[1]],
        r = Math.max(1, g.accuracy) ** 2;
      const a = this.P[0][0] + r,
        b = this.P[0][1],
        c = this.P[1][1] + r,
        det = a * c - b * b;
      this.innovation =
        (c * d[0] ** 2 - 2 * b * d[0] * d[1] + a * d[1] ** 2) / det;
      if (this.innovation > 9.21034) {
        this.rejected++;
        this.status = "GNSS REJECTED";
        return;
      }
      this.scalar(z[0], [1, 0, 0, 0, 0, 0], r);
      this.scalar(z[1], [0, 1, 0, 0, 0, 0], r);
      if (Number.isFinite(g.speedMps))
        this.scalar(g.speedMps, [0, 0, 1, 0, 0, 0], 1, false, 9);
      if (Number.isFinite(g.heading) && g.speedMps > 2)
        this.scalar(
          (g.heading * Math.PI) / 180,
          [0, 0, 0, 1, 0, 0],
          0.03,
          true,
          9,
        );
      this.status = "GNSS ACCEPTED";
    }
    state() {
      if (!this.x) return null;
      const a = this.P[0][0],
        b = this.P[0][1],
        c = this.P[1][1];
      return {
        position: geo(this.x, this.origin),
        speedMps: this.x[2],
        heading: this.x[3],
        radius95: Math.sqrt(
          (5.991 * (a + c + Math.sqrt((a - c) ** 2 + 4 * b * b))) / 2,
        ),
        covariance: this.P.map((r) => r.slice()),
        status: this.status,
        rejected: this.rejected,
      };
    }
  }
  class NavigationSession {
    constructor(config = {}) {
      this.config = {
        ekf: true,
        hmm: true,
        heuristic: false,
        tcn: false,
        mount: { up: [0, 0, 1], forward: [1, 0, 0] },
        ...config,
      };
      this.alignment = new FrameAlignment(this.config.mount);
      this.model = Object.create(N.AIMotionEstimator);
      this.model.reset();
      this.model._sampleClock = 0;
      this.filter = new PlanarEKF();
      this.quality = new N.GnssQuality();
      this.matcher = this.config.graph
        ? new N.RoadHMM(this.config.graph)
        : null;
      this.lastTime = null;
      this.raw = null;
      this.estimated = null;
      this.speed = 0;
      this.heading = 0;
      this.elapsed = 0;
      this.outage = 0;
      this.outageDistance = 0;
      this.maxRaw = 0;
      this.maxOutput = 0;
      this.lastReference = null;
      this.referenceComplete = true;
      this.samples = [];
    }
    step(frame) {
      validateFrame(frame);
      if (this.lastTime !== null && frame.timestampMs <= this.lastTime)
        throw Error("Sample timestamps must increase");
      const dt =
        this.lastTime === null ? 0 : (frame.timestampMs - this.lastTime) / 1000;
      if (dt > 2)
        throw Error(
          "IMU gap exceeds 2 seconds; split the recording at this gap",
        );
      this.lastTime = frame.timestampMs;
      this.elapsed += dt;
      const imu = this.alignment.process(frame.accel, frame.gyro),
        g = frame.gnss;
      if (!imu)
        return {
          status: "MOUNT CALIBRATION REQUIRED",
          position: null,
          metrics: null,
        };
      if (g && !this.raw && Number.isFinite(g.heading) && g.speedMps > 2) {
        this.raw = { lat: g.lat, lon: g.lon };
        this.estimated = { ...this.raw };
        this.speed = g.speedMps || 0;
        this.heading = ((g.heading || 0) * Math.PI) / 180;
      }
      this.model.ingest({timestampMs:frame.timestampMs,
        accel:[imu.forward,imu.lateral,imu.vertical],
        gyro:[dot(frame.gyro,this.alignment.forward),dot(frame.gyro,this.alignment.left),dot(frame.gyro,this.alignment.up)]});
      if (this.raw) {
        if (g) {
          this.raw = { lat: g.lat, lon: g.lon };
          this.estimated = { ...this.raw };
          this.speed = Number.isFinite(g.speedMps) ? g.speedMps : this.speed;
          this.heading = Number.isFinite(g.heading)
            ? (g.heading * Math.PI) / 180
            : this.heading;
        } else {
          this.speed = Math.max(0, Math.min(60, this.speed + imu.forward * dt));
          this.heading = wrap(this.heading + imu.yawRate * dt);
          const step = [
            this.speed * Math.cos(this.heading) * dt,
            this.speed * Math.sin(this.heading) * dt,
          ];
          this.raw = geo(step, this.raw);
          const v = this.config.heuristic || this.config.tcn
            ? this.model._prevEstimatedSpeed
            : this.speed;
          this.estimated = geo(
            [v * Math.cos(this.heading) * dt, v * Math.sin(this.heading) * dt],
            this.estimated,
          );
        }
      }
      const quality = this.quality.update(frame);
      this.filter.predict(imu, dt);
      this.filter.observe(
        g ? { ...g, accuracy: g.accuracy * Math.sqrt(quality.scale) } : null,
      );
      // Optional untrained demo speed observation. Large engineering variance,
      // never represented as calibrated network uncertainty.
      if(this.config.tcn && !frame.gnssAvailable && this.model.anchor!==null &&
         this.model.lastInference===frame.timestampMs && this.model.modelStatus==='SIMULATED_UNTRAINED' && this.filter.origin)
        this.filter.scalar(this.model.estimatedSpeedMps,[0,0,1,0,0,0],25,false,9);
      const fs = this.filter.state();
      // Only gated fixes anchor the demo model, including in the TCN-only ablation.
      if(g && (fs?.status==='GNSS ACCEPTED'||fs?.status==='GNSS INITIALIZED'))this.model.acceptGNSS(g);
      let position = this.config.ekf ? fs?.position : this.estimated;
      let match = null;
      // A fresh accepted GNSS fix is the navigation output while reception is healthy.
      // Road constraints only assist during an outage; they cannot pull a good fix onto another road.
      if(frame.gnssAvailable && g && (!this.config.ekf || fs?.status==='GNSS ACCEPTED' || fs?.status==='GNSS INITIALIZED'))position={lat:g.lat,lon:g.lon};
      if (!frame.gnssAvailable && this.config.hmm && this.matcher && position) {
        match = this.matcher.update(
          position,
          this.config.ekf ? (fs?.heading ?? this.heading) : this.heading,
          dt,
        );
        if (match?.matched) position = match.position;
      }
      // Reference only enters evaluation after navigation has completed.
      let metrics = null;
      if (frame.gnssAvailable === false && position) {
        this.outage += dt;
        if (frame.reference && this.lastReference)
          this.outageDistance += distance(frame.reference, this.lastReference);
        else this.referenceComplete = false;
      }
      if (frame.reference && position) {
        const rawError = distance(this.raw, frame.reference),
          outputError = distance(position, frame.reference);
        if (frame.gnssAvailable === false) {
          this.maxRaw = Math.max(this.maxRaw, rawError);
          this.maxOutput = Math.max(this.maxOutput, outputError);
        }
        const drift =
          this.referenceComplete && this.outageDistance > 5
            ? (100 * this.maxOutput) / this.outageDistance
            : null;
        metrics = {
          rawError,
          outputError,
          outageSeconds: this.outage,
          outageDistance: this.outageDistance,
          maxRaw: this.maxRaw,
          maxOutput: this.maxOutput,
          driftPercent: drift,
          improvementPercent:
            rawError > 0.1 ? (100 * (rawError - outputError)) / rawError : null,
          status: !this.referenceComplete
            ? "INCOMPLETE REFERENCE"
            : this.outage >= 3 && drift !== null
              ? drift < 10
                ? "BELOW 10% TARGET"
                : "ABOVE TARGET"
              : "INSUFFICIENT DATA",
        };
      }
      this.lastReference = frame.reference || null;
      this.output = {
        position,
        raw: this.raw && { ...this.raw },
        filter: fs,
        match,
        imu,
        quality,
        model: this.model.getState(),
        metrics,
        status: position
          ? frame.gnssAvailable
            ? fs?.status || "GNSS AVAILABLE"
            : "DEAD RECKONING"
          : this.filter.status,
        elapsed: this.elapsed,
      };
      return this.output;
    }
  }
  function validateFrame(f) {
    if (typeof f.gnssAvailable !== "boolean")
      throw Error(
        "Frame must declare gnssAvailable independently of fix cadence",
      );
    if (f.gnss && !f.gnssAvailable)
      throw Error("Unavailable GNSS must not contain a measurement");
    if (
      !Number.isFinite(f.timestampMs) ||
      !["accel", "gyro"].every(
        (k) =>
          Array.isArray(f[k]) &&
          f[k].length === 3 &&
          f[k].every(Number.isFinite),
      )
    )
      throw Error(
        "Each frame needs timestampMs and finite accel / gyro xyz arrays",
      );
    for (const k of ["gnss", "reference"])
      if (
        f[k] &&
        (!Number.isFinite(f[k].lat) ||
          !Number.isFinite(f[k].lon) ||
          Math.abs(f[k].lat) > 90 ||
          Math.abs(f[k].lon) > 180)
      )
        throw Error("Invalid " + k + " coordinates");
    if (
      f.gnss &&
      (f.gnss.timestampMs > f.timestampMs ||
        f.timestampMs - f.gnss.timestampMs > 2000)
    )
      throw Error("GNSS timestamp is stale or in the future");
    if (
      f.gnss &&
      ["speedMps", "heading"].some(
        (k) => f.gnss[k] != null && !Number.isFinite(f.gnss[k]),
      )
    )
      throw Error("Invalid GNSS speed or course");
    if (
      f.gnss &&
      (!Number.isFinite(f.gnss.timestampMs) ||
        !Number.isFinite(f.gnss.accuracy) ||
        f.gnss.accuracy <= 0)
    )
      throw Error("GNSS requires timestampMs and positive accuracy in metres");
  }
  N.Core = {
    FrameAlignment,
    PlanarEKF,
    NavigationSession,
    validateFrame,
    local,
    geo,
    distance,
    wrap,
  };
})((window.NavDR = window.NavDR || {}));
