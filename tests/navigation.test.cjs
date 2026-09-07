const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = {
  window: {},
  performance: { now: () => 0 },
  console: { log() {} },
  setTimeout,
  clearTimeout,
};
context.window = context;
vm.createContext(context);
for (const f of [
  "config",
  "ai-motion-estimator",
  "road-hmm",
  "gnss-quality",
  "navigation-core",
  "replay",
])
  vm.runInContext(fs.readFileSync("js/" + f + ".js", "utf8"), context);
const N = context.NavDR,
  C = N.Core;
function frames() {
  return Array.from({ length: 301 }, (_, i) => {
    const p = C.geo([i * 0.5, 0], { lat: 28, lon: 77 });
    return {
      timestampMs: i * 50,
      accel: [0, 0, 9.80665],
      gyro: [0, 0, 0],
      gnssAvailable: i < 20 || i >= 220,
      gnss:
        (i < 20 || i >= 220) && i % 20 === 0
          ? { ...p, speedMps: 10, heading: 0, accuracy: 2, timestampMs: i * 50 }
          : null,
      reference: p,
    };
  });
}
function run(data, config) {
  const s = new C.NavigationSession(config);
  for (const f of data) s.step(f);
  return s;
}
test("50 ms clocks accumulate; 1 Hz fixes do not create artificial outages", () => {
  const s = run(frames());
  assert.equal(s.elapsed, 15.000000000000078);
  assert.ok(Math.abs(s.output.metrics.outageSeconds - 10) < 1e-8);
  assert.ok(Math.abs(s.output.metrics.outageDistance - 100) < 0.001);
});
test("reference truth cannot change estimator output", () => {
  const data = frames(),
    a = run(data),
    b = run(data.map((f) => ({ ...f, reference: { lat: 0, lon: 0 } })));
  assert.deepEqual(a.output.position, b.output.position);
  assert.notEqual(a.output.metrics.outputError, b.output.metrics.outputError);
});
test("missing independent reference yields no score", () => {
  const s = run(frames().map(({ reference, ...f }) => f));
  assert.equal(s.output.metrics, null);
});
test("same input yields identical ablations and supports negative improvement", () => {
  const d = {
    schema: "navdr.frames.v1",
    provenance: { source: "test" },
    frames: frames(),
    mount: { up: [0, 0, 1], forward: [1, 0, 0] },
  };
  assert.deepEqual(N.Replay.ablate(d), N.Replay.ablate(d));
  const s = run(frames(), { ekf: false, hmm: false });
  s.estimated = C.geo([100, 100], s.raw);
  const f = {
    ...frames().at(-1),
    timestampMs: 15100,
    gnss: null,
    gnssAvailable: false,
  };
  assert.ok(s.step(f).metrics.improvementPercent < 0);
});
test("mounting rotation transforms both gravity and yaw", () => {
  const a = new C.FrameAlignment({ up: [0, 0, 1], forward: [1, 0, 0] }),
    b = new C.FrameAlignment({ up: [1, 0, 0], forward: [0, 1, 0] });
  assert.deepEqual(
    a.process([2, 3, 9.80665], [0, 0, 0.2]),
    b.process([9.80665, 2, 3], [0.2, 0, 0]),
  );
  assert.equal(
    new C.FrameAlignment(null).process([0, 0, 9.80665], [0, 0, 0]),
    null,
  );
});
test("planar covariance remains symmetric and positive definite; GNSS outlier is gated", () => {
  const s = run(frames());
  const P = s.filter.P;
  const L = P.map((r) => r.map(() => 0));
  for (let i = 0; i < 6; i++)
    for (let j = 0; j <= i; j++) {
      assert.ok(Math.abs(P[i][j] - P[j][i]) < 1e-8);
      let value = P[i][j];
      for (let k = 0; k < j; k++) value -= L[i][k] * L[j][k];
      if (i === j) {
        assert.ok(value > 0);
        L[i][j] = Math.sqrt(value);
      } else L[i][j] = value / L[j][j];
    }
  const before = s.filter.state().position;
  s.filter.observe({ lat: 29, lon: 78, accuracy: 2, timestampMs: 20000 });
  assert.equal(s.filter.rejected, 1);
  assert.deepEqual(s.filter.state().position, before);
});
test("HMM uses connected directed road paths", () => {
  const origin = { lat: 28, lon: 77 },
    nodes = [
      { id: "a", ...origin },
      { id: "b", ...C.geo([100, 0], origin) },
      { id: "c", ...C.geo([100, 100], origin) },
      { id: "d", ...C.geo([0, 100], origin) },
    ],
    graph = {
      nodes,
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "d", to: "c" },
      ],
    };
  const m = new N.RoadHMM(graph);
  assert.ok(Math.abs(m.shortest("a", "c") - 200) < 0.01);
  assert.equal(m.shortest("c", "a"), Infinity);
  let o = m.update(C.geo([20, 2], origin), 0, 1);
  assert.equal(o.matched, true);
  o = m.update(C.geo([70, 2], origin), 0, 1);
  assert.equal(o.path.length, 2);
});
test("OSM conversion retains one-way edges", () => {
  const graph = N.RoadHMM.fromOSM({
    elements: [
      { type: "node", id: 1, lat: 28, lon: 77 },
      { type: "node", id: 2, lat: 28.001, lon: 77 },
      {
        type: "way",
        id: 3,
        nodes: [1, 2],
        tags: { highway: "residential", oneway: "yes" },
      },
    ],
  });
  assert.equal(graph.edges.length, 1);
});
test("native C/N0 monitor requires sustained degradation", () => {
  const q = new N.GnssQuality();
  let state;
  for (let i = 0; i < 4; i++)
    state = q.update({
      timestampMs: i * 1000,
      satelliteTimestampMs: i * 1000,
      satellites: [
        { constellationType: 7, usedInFix: true, cn0DbHz: i ? 25 : 35 },
      ],
    });
  assert.equal(state.irnss, 1);
  assert.equal(state.scale, 4);
});
test("reject invalid replay timestamps and large gaps", () => {
  assert.throws(() =>
    N.Replay.parse(
      JSON.stringify({
        schema: "navdr.frames.v1",
        provenance: { source: "test" },
        frames: [frames()[0], frames()[0]],
      }),
    ),
  );
  const s = run([frames()[0]]);
  assert.throws(() => s.step({ ...frames()[1], timestampMs: 3000 }));
});

test('a reference gap cannot earn a benchmark pass',()=>{const data=frames();delete data[60].reference;const s=run(data);assert.equal(s.output.metrics.status,'INCOMPLETE REFERENCE');assert.equal(s.output.metrics.driftPercent,null);});
test('GNSS hidden by an outage cannot enter an estimator',()=>{assert.throws(()=>run([{...frames()[0],gnssAvailable:false}]),/Unavailable GNSS/);});
test('initial heading needs an observed moving course',()=>{const f=frames()[0];delete f.gnss.heading;const s=run([f]);assert.equal(s.output.position,undefined);assert.equal(s.output.status,'WAITING FOR MOVING GNSS COURSE');});
test('stale native quality expires instead of permanently scaling covariance',()=>{const q=new N.GnssQuality();q.update({timestampMs:0,satelliteTimestampMs:0,satellites:[]});const state=q.update({timestampMs:3000});assert.equal(state.available,false);assert.equal(state.scale,1);});
test('malformed mounting axes are rejected',()=>{assert.throws(()=>new C.FrameAlignment({up:[0,0,1],forward:[NaN,1,0]}));});

test('healthy GNSS output is not displaced by map matching',()=>{const f=frames()[0];const s=new C.NavigationSession();s.matcher={update(){throw Error('Healthy GNSS should not invoke outage matching');}};assert.deepEqual({...s.step(f).position},{lat:f.gnss.lat,lon:f.gnss.lon});});
