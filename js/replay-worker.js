/* Keep ablation computation off the map's rendering thread. */
self.window = self;
importScripts(
  "config.js",
  "ai-motion-estimator.js?v=tcn1",
  "road-hmm.js",
  "gnss-quality.js",
  "navigation-core.js?v=tcn1",
  "replay.js?v=tcn1",
);
self.onmessage = (event) => {
  try {
    const { recording, graph } = event.data;
    const results = NavDR.Replay.ablate(recording, graph);
    self.postMessage({
      results,
      evidence: {
        provenance: recording.provenance,
        mount: recording.mount,
        frames: recording.frames,
        graph,
      },
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
