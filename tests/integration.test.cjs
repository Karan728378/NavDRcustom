const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const elements = new Map();
function element(id) {
  if (!elements.has(id))
    elements.set(id, {
      textContent: "",
      checked: true,
      disabled: false,
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
      append() {},
      replaceChildren() {},
      querySelector() {
        return element(id + "child");
      },
      closest() {
        return element(id + "row");
      },
    });
  return elements.get(id);
}
const ctx = {
  console: { log() {}, error() {} },
  performance: { now: () => 0 },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: (callback) => {ctx.timerCallback=callback;return 1;},
  clearInterval(id) {if(id != null)ctx.timerCallback=null;},
  document: {
    getElementById: element,
    addEventListener() {},
    createElement: () => element("temp"),
  },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of [
  "config",
  "demo-route",
  "engine",
  "sensors-manager",
  "sensor-processing",
  "handheld-compensation",
  "ai-motion-estimator",
  "ai-drift-correction",
  "accuracy-benchmark",
  "dead-reckoning",
  "map-matching",
  "sensor-fusion",
  "app",
  "road-hmm",
  "gnss-quality",
  "navigation-core",
  "replay",
  "sih-demo",
  "navigation-workbench",
])
  vm.runInContext(fs.readFileSync("js/" + f + ".js", "utf8"), ctx);
const N = ctx.NavDR;
N.Notifications = { show() {} };
N.Telemetry = new Proxy({}, { get: () => () => {} });
N.Map = new Proxy(
  {
    map: { panTo() {} },
    drTrailLine: null,
    drTrailOutline: null,
    fusedTrailLine: null,
    fusedTrailOutline: null,
    referenceTrailLine: null,
  },
  { get: (o, k) => (k in o ? o[k] : () => {}) },
);
N.SensorManager.reset = () => {};
N.SensorProcessor.reset = () => {};
N.Route.initialize();
N.Workbench.reset();
N.SIHDemo.startDemo();
for (let i = 0; i < 100; i++) N.Simulation._tick();
assert.equal(N.Simulation.gnssAvailable, false);
const paused = N.SIHDemo.time;
N.Simulation.pause();
for (let i = 0; i < 20; i++) N.Simulation._tick();
assert.equal(N.SIHDemo.time, paused);
N.Simulation.start();
for (let i = 0; i < 500; i++) N.Simulation._tick();
assert.equal(N.SIHDemo.phase, "Complete");
assert.equal(N.Simulation.paused, true);
assert.ok(Math.abs(N.Workbench.lastOutput.metrics.outageSeconds - 17) < 0.001);
N.Simulation.reset();
N.Simulation.start();
N.Simulation.loseGNSS();
N.Simulation._tick();
assert.equal(N.Simulation.gnssAvailable, false);
N.Simulation.restoreGNSS();
N.Simulation._tick();
assert.equal(N.Simulation.gnssAvailable, true);
N.AccuracyBenchmark.runSuite();
for (let i = 0; i < 2700; i++) N.Simulation._tick();
assert.equal(N.AccuracyBenchmark.history.length, 4);
assert.equal(N.Simulation.paused, true);
assert.deepEqual(
  Array.from(N.AccuracyBenchmark.history, (r) => r.outageDuration),
  [60, 30, 10, 5],
);
const graph = N.RoadHMM.fromOSM(
  JSON.parse(fs.readFileSync("data/delhi-roads.osm.json")),
);
N.Workbench.graph = graph;
N.SIHDemo.startDemo();
const start = performance.now();
for (let i = 0; i < 510; i++) N.Simulation._tick();
const millis = performance.now() - start;
assert.ok(Number.isFinite(N.Workbench.lastOutput.metrics.driftPercent));
const results = N.Replay.ablate(N.Workbench.recording, graph);
assert.equal(results.length, 4);
assert.ok(results.every((r) => r.metrics));
console.log(
  JSON.stringify(
    {
      status: "PASS",
      checks: [
        "pause freezes demo",
        "17 second outage",
        "manual GNSS override",
        "four scenario suite",
        "independent OSM HMM",
        "four ablations",
      ],
      roadNodes: graph.nodes.length,
      roadEdges: graph.edges.length,
      processingMsFor25Seconds: Math.round(millis),
      results: results.map((r) => ({
        configuration: r.configuration.name,
        driftPercent: r.metrics.driftPercent,
        status: r.metrics.status,
      })),
    },
    null,
    2,
  ),
);

const recorded=JSON.parse(JSON.stringify(N.Workbench.recording));const originalPosition={...N.Workbench.lastOutput.position};N.Workbench.runReplay(recorded);ctx.timerCallback();const partial=N.Workbench.recording.frames.length;N.Simulation.pause();assert.equal(ctx.timerCallback,null);assert.equal(N.Workbench.recording.frames.length,partial);N.Simulation.start();while(ctx.timerCallback)ctx.timerCallback();assert.equal(N.Workbench.recording.frames.length,recorded.frames.length);assert.deepEqual({...N.Workbench.lastOutput.position},originalPosition);console.log('Replay pause/resume and selected-output round trip: PASS');
N.Workbench.source='simulation';N.Simulation.reset();N.Simulation.start();ctx.timerCallback();assert.ok(Math.abs(N.Simulation.elapsedTime-.2)<1e-9);N.Simulation.pause();console.log('Default 4x playback advances four unchanged 50 ms steps: PASS');

assert.equal(N.Workbench.recording.frames.length,20);assert.ok(N.Workbench.recording.frames.slice(1).every((f,i)=>f.timestampMs-N.Workbench.recording.frames[i].timestampMs===10));console.log("100 Hz input retained at 4x playback: PASS");
