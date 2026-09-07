# NavDR recording contract

`schema: "navdr.frames.v1"` contains `provenance.source`, `mount`, and a nonempty `frames` array. Limit: 200,000 samples. Sample timestamps must strictly increase; gaps over two seconds require splitting the recording.

```json
{
  "schema": "navdr.frames.v1",
  "provenance": {"source": "example fixture", "reference": "independent source or none"},
  "mount": {"up": [0,0,1], "forward": [1,0,0]},
  "frames": [{
    "timestampMs": 0,
    "accel": [0,0,9.80665],
    "gyro": [0,0,0],
    "gnssAvailable": true,
    "gnss": {"timestampMs": 0, "lat": 28.61, "lon": 77.21, "accuracy": 3, "speedMps": 10, "heading": 90}
  }]
}
```

Acceleration includes gravity, in device XYZ, m/s². Gyro uses device XYZ, right-hand rad/s. The mount's up and forward vectors use that device frame. Internal yaw is clockwise geographic bearing. GNSS heading is clockwise degrees from north, speed m/s, accuracy metres. The EKF needs a moving fix above 2 m/s with course to initialize heading. Timestamps share a monotonic clock. `gnss` is absent/null between fresh fixes; `gnssAvailable` independently states availability, so a 1 Hz fix stream does not create 19 artificial outages per second.

`reference: {lat, lon}` is optional and must be sourced independently of the estimator output. It is never supplied to alignment, the motion model, the EKF or HMM. Do not relabel a phone's own GNSS as independent truth. Without reference, error and drift are unavailable.

Native frames can contain `satellites` (constellationType, cn0DbHz, usedInFix, elevationDegrees, svid) and `satelliteTimestampMs`. Android constellation type 7 denotes IRNSS. Observations expire after 2.5 seconds. Three fresh median used-in-fix C/N₀ samples at least 5 dB below the rolling baseline multiply GNSS variance by four. This heuristic is observable and testable; it is not a validated outage predictor or a browser NavIC detector.

## IO-VNBD

The converter's column prefixes were checked against the actual official smartphone `S-S1.csv` header. It handles leading spaces and the source's malformed unit characters. GPS speed converts km/h to m/s; timestamps and gyro units are preserved. The source repeats GPS at the IMU cadence without separate fix timestamps, so conversion explicitly downsamples GPS to at most 1 Hz and records this policy.

```sh
python3 tools/import_io_vnbd.py smartphone.csv recording.json \
  --forward 0,1,0 --up 0,0,1 --gyro-xyz Pitch Roll Yaw \
  --outage 10 30
```

The vectors and gyro mapping above are examples, **not verified mounting metadata for every IO-VNBD trip**. Supply the actual mounting direction and logger-to-device axis mapping. The converter intentionally requires these arguments rather than silently guessing. `--outage` masks GNSS by seconds from the first sample. It does not manufacture reference data. Source file SHA-256, axes and outage policy are exported.

Official source: https://github.com/onyekpeu/IO-VNBD. Validation used a small public prefix of `Synchronised V abd S datasets/Categorised IOVNB Dataset/S (Driver A)/S1/S-S1.csv`, with 20 complete records. This was a schema/unit conversion check, not a dataset accuracy evaluation. No training was performed.

## Road graphs and reproducibility

Graph JSON: `nodes: [{id,lat,lon}]`, `edges: [{id?,from,to}]`, `provenance`. Edges are directed; add a reverse edge only when travel is allowed in both directions. OSM Overpass JSON imports node/way geometry and one-way tags. Turn restrictions and live closures are not imported. Use corridor-sized graphs, at most 5,000 nodes / 12,000 edges.

Exported recordings include the graph and configuration. Per-frame `configuration` preserves EKF/HMM toggle choices in a replay. Ablation evidence contains the exact frozen recording used by the worker, not a later live buffer. Reference coverage must be continuous across evaluated outage intervals; missing reference invalidates the benchmark for that run.

Current improvement is only defined when raw reference error exceeds 0.1 m; otherwise a near-zero denominator makes the percentage uninformative. Peak outage errors remain available independently.
