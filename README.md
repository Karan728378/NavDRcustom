# NavDR

A browser navigation workbench for reproducible IMU/GNSS experiments. The existing route, controls, Leaflet map and fixed-regression motion baseline are retained. The selected pipeline now uses a shared session for simulation and replay.

## Run locally

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765. Leaflet and the road graph are bundled locally. Fonts use a public CDN with system fallbacks; base-map tiles load from OpenStreetMap. Numerical navigation and vector trails continue when tiles are unavailable. Select **Run guided demo** for 3 seconds of GNSS warm-up, 17 seconds of outage and 5 seconds of recovery. Pause freezes input time and scenario phases.

## What is implemented

- **A:** Independent reference evaluation, full-precision sample clocks, persistent manual GNSS override, cancellable scenario/demo state machines, signed improvement. Map and accuracy use the identical selected output.
- **B:** Timestamped JSON recording/replay, four independent ablations, background worker, evidence export and IO-VNBD smartphone CSV conversion.
- **C:** Conventional fixed-mount gravity subtraction and orthonormal device-to-vehicle transformation of acceleration and gyro. Gravity does not establish yaw: mounting forward direction is explicit. Rotated-mount tests cover both sensors.
- **D:** Six-state planar EKF `[north, east, forward speed, heading, acceleration bias, gyro bias]`, covariance propagation, Joseph-form updates, 2D innovation gating and a covariance-derived 95% position radius. Forward-only planar kinematics impose a vehicle motion constraint. This is not a 15-state ESKF or a learned covariance model.
- **F:** Directed-road HMM with Viterbi recurrence, distance/heading emissions and shortest-path transitions. Includes a real OpenStreetMap Delhi corridor and graph import. The separate Kotlin Android app captures IMU/GNSS/satellite events and runs a native planar baseline; HMM and C/N₀ variance scaling currently remain in the browser pipeline.

No trained TCN, EqNIO equivariance, R-WhONet transfer learning or barometer tunnel detection is claimed. The fixed-regression baseline is untrained and can make the result worse.

## Evidence and limits

The drift readout is **peak selected-output error in one outage / reference distance travelled within that same outage × 100**. Each interval is scored independently; the live readout uses the latest interval and CSV exports the current run’s intervals. A result needs at least 3 seconds and 5 metres. The synthetic reference is separate from GNSS availability and is read only by the evaluator after navigation completes. Real device recordings have no independent reference and cannot earn a benchmark pass. Missing-reference/output intervals retain null drift; no pooled-distance percentage or authenticated organizer pass is reported.

The covariance ring describes the EKF before HMM projection. It is a model-conditioned bound, not empirically calibrated reliability. HMM may worsen error when a scripted route disagrees with real roads. Toggle output components to inspect them; use the four ablations for comparisons from identical inputs and independent initial states. Exported frames preserve output-toggle settings; ablations intentionally ignore these settings and run their fixed configurations.

See [implementation stages and limitations](docs/IMPLEMENTATION.md), [replay schema](docs/REPLAY.md), [native Kotlin app](native/android/README.md) and [road attribution](data/README.md).

### Native product build (September 2026)

Next work: [remaining implementation plan](docs/REMAINING_IMPLEMENTATION_PLAN.md), covering device validation, evaluation fixes, training within 6 GB VRAM, mobile inference and field evidence.

The Android path now has a Kotlin navigation library, a user-started location foreground service, bounded streaming sensor recordings, and an offline trajectory screen. It runs a classical six-state filter on device; no trained AI model is included yet. It uses explicit fixed-mount/outage limits and reports unavailable output when timing validity is lost. See [build instructions](native/android/README.md) and [verified progress / remaining work](docs/NATIVE_BUILD_PROGRESS.md). Browser simulation results remain separate from native field validation.

## Validate

```sh
node tests/navigation.test.cjs
node tests/integration.test.cjs
python3 tests/importer.test.py
```

The integration harness exercises the guided demo, pause/resume, manual override, all four scenario durations, real OSM graph and ablations. It is a computational harness, not a vehicle trial. No hardware navigation accuracy is established by these tests.

## Simulation playback and road route

Playback defaults to **4×**, selectable from 1×, 2×, 4× and 8×. Vehicle speed remains in km/h; playback runs additional 50 ms batches of five 10 ms IMU steps, preserving estimator and benchmark clocks. The scenario follows 95 connected, directed OSM nodes (approximately 2.32 km), generated by `python3 tools/build_demo_route.py`. GNSS measurements are generated at 20 Hz in simulation; a fresh accepted GNSS fix is used directly while reception is healthy, and HMM matching assists during outages. Recorded input retains its original sampling cadence.

### Simulated TCN velocity (Task 1)

`ai-motion-estimator.js` now executes a streaming causal residual TCN: six IMU channels projected to 32 channels, eight kernel-6 convolutions with dilations 1,1,2,2,4,4,16,16, and a scalar head. All 49,665 weights/biases participate in inference. The receptive field is 231 samples; the timestamp window spans up to 2.5 seconds. Seeded weights are **untrained**, not a trained smartphone velocity model. Samples are processed at their supplied timestamps; output updates at 20 Hz on 100 Hz input. Device rates are measured, not assumed or fabricated.

Simulation generates five distinct 10 ms sensor steps per 50 ms playback tick, while synthetic GNSS remains 20 Hz. Replay retains those timestamps, independently of wall-clock playback. The console reports parameter count, rate, speed, state and processing time. Enable **Use simulated TCN velocity** to apply the demo speed during outages; a separate replay ablation compares TCN plus constraints against raw integration.

The output is the last gated GNSS velocity plus a non-accumulating residual bounded to ±2 m/s. This engineering constraint cannot follow arbitrary velocity changes and is not evidence of learned drift suppression. It avoids integrating random network outputs recursively. Optional EKF speed observations use an engineering variance of 25 (m/s)², not calibrated model uncertainty. Warm-up, missing samples, low sample rates, missing velocity anchors and uncalibrated confidence are explicit. Position reference data enters evaluation only. Parameter-count, causality, determinism, timestamp/rate, bounded-output and rejected-fix/reference-isolation tests are in `tests/tcn.test.cjs`.

Software acceptance evidence and pending device/GPU checks: [16 September handoff](docs/SOFTWARE_ACCEPTANCE_2026-09-16.md). The [standalone ML guide](ml/README.md) covers approved-manifest training, checkpoint/resume, evaluation against three non-learned baselines, and the executed synthetic end-to-end self-test. Real-data approval/training and GPU memory validation remain pending.
