/* NavDR replay v1: one timestamped input stream shared by independent sessions. */
(function (N) {
  "use strict";
  N.Replay = {
    parse(text) {
      const data = JSON.parse(text);
      if (
        data.schema !== "navdr.frames.v1" ||
        !Array.isArray(data.frames) ||
        !data.frames.length ||
        data.frames.length > 200000
      )
        throw Error("Expected navdr.frames.v1 recording");
      if (!data.provenance?.source)
        throw Error("Recording source provenance is required");
      let last = -Infinity;
      for (const f of data.frames) {
        N.Core.validateFrame(f);
        if (last !== -Infinity && f.timestampMs - last > 2000)
          throw Error("IMU gap exceeds 2 seconds; split the recording");
        if (f.timestampMs <= last)
          throw Error("Recording timestamps must increase");
        last = f.timestampMs;
      }
      return data;
    },
    ablate(recording, graph) {
      return [
        { name: "Raw integration", ekf: false, hmm: false, heuristic: false },
        {
          name: "Simulated TCN + anchor constraints",
          ekf: false,
          hmm: false,
          heuristic: true,
        },
        { name: "Planar EKF", ekf: true, hmm: false, heuristic: false },
        {
          name: "Planar EKF + road HMM",
          ekf: true,
          hmm: true,
          heuristic: false,
        },
      ].map((config) => {
        const session = new N.Core.NavigationSession({
          ...config,
          mount: recording.mount,
          graph,
        });
        let output;
        for (const f of recording.frames) output = session.step(f);
        return {
          configuration: config,
          metrics: config.hmm && !graph ? null : output.metrics,
          filter: output.filter,
          status: config.hmm && !graph ? "HMM UNAVAILABLE" : output.status,
          mapAvailable: !!graph,
        };
      });
    },
    download(data, name) {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
})((window.NavDR = window.NavDR || {}));
