/* NavDR native GNSS quality monitor. Signal degradation is a heuristic, not proof of an outage. */
(function (N) {
  N.GnssQuality = class {
    constructor() {
      this.baseline = null;
      this.lowCount = 0;
      this.lastTime = null;
      this.state = {
        available: false,
        irnss: 0,
        scale: 1,
        status: "No native satellite observations",
      };
    }
    update(frame) {
      if (this.lastTime !== null && frame.timestampMs - this.lastTime > 2500)
        this.state = {
          available: false,
          irnss: 0,
          scale: 1,
          status: "Native satellite observations expired",
        };
      if (
        !Array.isArray(frame.satellites) ||
        !Number.isFinite(frame.satelliteTimestampMs) ||
        frame.timestampMs - frame.satelliteTimestampMs > 2500 ||
        frame.satelliteTimestampMs === this.lastTime
      )
        return this.state;
      this.lastTime = frame.satelliteTimestampMs;
      const used = frame.satellites
        .filter((s) => s.usedInFix && Number.isFinite(s.cn0DbHz))
        .map((s) => s.cn0DbHz)
        .sort((a, b) => a - b);
      const irnss = frame.satellites.filter(
        (s) => s.constellationType === 7,
      ).length;
      if (!used.length)
        return (this.state = {
          available: true,
          irnss,
          scale: 4,
          status: "No satellites used in fix",
        });
      const median = used[Math.floor(used.length / 2)];
      if (this.baseline === null) this.baseline = median;
      const drop = this.baseline - median;
      this.lowCount = drop >= 5 ? this.lowCount + 1 : 0;
      if (drop < 5) this.baseline = 0.98 * this.baseline + 0.02 * median;
      return (this.state = {
        available: true,
        irnss,
        medianCn0DbHz: median,
        dropDb: drop,
        scale: this.lowCount >= 3 ? 4 : 1,
        status:
          this.lowCount >= 3
            ? "Sustained C/N₀ degradation; GNSS variance ×4"
            : "Signal baseline monitored",
      });
    }
  };
})((window.NavDR = window.NavDR || {}));
