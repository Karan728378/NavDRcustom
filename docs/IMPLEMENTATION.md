# Approved implementation stages: A + B + C + D + F

The architecture/research pass and design plan preceded implementation. The user explicitly selected A, B, C, D and F. E (trained model work) was not selected.

## A. Correctness and measurement

The old orchestration mixed reference truth with unavailable GNSS, displayed one fusion branch while scoring another, rounded running clocks to tenths, and used missing GNSS method names in scenario timers. The manual outage could be undone by the next automatic-zone tick. These defects are removed from the selected pipeline.

`NavigationSession.step` consumes a validated timestamped frame. Reference truth is evaluated only after navigation. The same `output.position` drives the Leaflet vehicle, selected trail, current error and peak drift. GNSS availability is independent of fix cadence. Every scenario resets its own accumulated reference distance/error; the guided demo and suite use input-time state machines and freeze on pause. No timed warm-up callbacks remain that can restart a reset run.

Signed improvement is retained. Instantaneous improvement is unavailable below 0.1 m raw error, where a percentage would be unstable. Missing reference never becomes a zero error or a pass. Reference gaps invalidate the drift result for that run. Runtime measurements are rounded only for display; state-machine thresholds use accumulated milliseconds.

## B. Shared replay and ablations

The versioned recording contains exact IMU/GNSS samples, reference provenance, mount, graph and output configuration. Simulation noise uses seeded random generation with the existing noise presets and shock control. Replay supports pause/resume and rejects invalid input, inconsistent availability and timestamp gaps. Four isolated sessions evaluate raw integration, the original fixed regression baseline, planar EKF and planar EKF plus HMM. Background-worker results include the exact frozen input snapshot used by the worker.

The original `AIMotionEstimator` feature extraction and fixed coefficient predictor remain the heuristic baseline. Its independent session uses full-rate samples, 150 ms inference, original confidence-weighted smoothing and GNSS speed seeding. No weights were trained. Quality input is a fixed baseline assumption of 90, not a measured probability; it is not presented as confidence in the live navigation output.

The IO-VNBD importer validates the real smartphone header, units, timestamps and explicit axes. It does not infer mounting yaw or convert the phone's own GPS into ground truth. See REPLAY.md.

## C. Mounted-device alignment

`FrameAlignment` orthogonalizes supplied forward/up vectors, subtracts gravity in device coordinates and rotates acceleration and gyro into the vehicle frame. Browser calibration estimates up from stationary samples but requires the stated forward direction. Gyro sign converts right-hand rotation to clockwise geographic bearings. Tests rotate the mounting frame and both IMU vectors together and verify equal vehicle-frame output.

This is conventional calibration, not EqNIO. It assumes a fixed mount and approximately level forward vehicle travel. Arbitrary phone handling after calibration, reversed travel and mounting changes are not supported. No magnetometer offset is fabricated as a yaw calibration.

## D. Planar covariance filter

The six-state EKF propagates north/east position, forward velocity, heading and acceleration/gyro bias. Its kinematics assume zero lateral vehicle velocity. Process-noise diagonal rates are `[0.02, 0.02, 0.6, 0.003, 0.0001, 0.00001]` in the corresponding state units per second; these are explicit engineering defaults, not calibrated sensor specifications.

GNSS position uses reported accuracy squared, floored at 1 m; initialization requires moving GNSS course above 2 m/s. A 2D normalized innovation gate of 9.21034 rejects gross position outliers. Accepted position, speed and course observations use Joseph-form covariance updates. Tests check covariance symmetry and positive definiteness after propagation/updates and ensure outlier rejection does not move the state. The displayed 95% radius is `sqrt(5.991 × largest horizontal covariance eigenvalue)` before road matching. It is a conservative enclosing circle of the Gaussian ellipse, not a calibrated safety bound.

A 15-state ESKF, learned noise adapter, 3D attitude/altitude and barometer model are not implemented. The UI calls this a planar EKF.

## F. Road HMM and native monitoring path

The bundled OSM snapshot supplies independent geometry with 2,692 nodes and 4,411 directed edges. HMM emissions use distance and heading. Transitions compare shortest directed-road distance to observed displacement; an online Viterbi recurrence retains a bounded backpointer path. Between 2 Hz observation updates, the last selected edge is reprojected at display rate. Dijkstra uses a priority queue and bounded cache. Disconnected/off-network observations return an explicit fallback instead of pretending to match.

This is a local HMM implementation, not Valhalla/Meili running behind the UI. It does not enforce turn restrictions, motor-vehicle access rules, closures or routing safety. The synthetic graph remains an explicitly labeled alternative fixture. Real OSM geometry can worsen performance against the scripted reference route; the benchmark exposes this.

The Android foreground recorder captures native GNSS/IMU and per-satellite IRNSS/C/N₀ data for export and browser replay. A sustained C/N₀ degradation heuristic increases GNSS measurement variance; stale observations expire. The Android project is source-complete for this recorder path but **not built or device-validated in this workspace**, which lacks SDK/Gradle and hardware. This does not establish real-time Android navigation or a validated proactive handoff. See native/android/README.md.

## Product and performance review

The map, source provenance, accuracy readout and covariance ring form the primary console. The palette is instrument white #F3F6F8, aerospace ink #20364A, navigation blue #245DA8, teal #087E83, caution ochre #996000 and fault red #B3343B. IBM Plex Sans Condensed carries headings, Plex Sans controls/body and Plex Mono actual measured values.

Desktop layout: map beside accuracy; controls below; error trace and evidence next. Phone layout: compact benchmark, map, controls and expandable inspection. Explicit focus rings and reduced-motion handling are included. Only the outage banner is animated. The self-review removed the old dark map filter, duplicate Start label, obsolete mobile height cap and frozen diagnostic constants. The old 28-chart allocation/update loop and inactive diagnostic views were removed; map drawing is capped at 5 Hz, panning at 1 Hz, trails at 3,000 points and error samples at 600.

## Research basis and claim boundary

The cited techniques motivate experiments, not novelty claims:

- EqNIO canonical framing: https://arxiv.org/html/2408.06321v2
- AI-IMU-DR covariance/vehicle constraints: https://github.com/mbrossar/ai-imu-dr
- IO-VNBD: https://github.com/onyekpeu/IO-VNBD
- HMM matching baseline: https://valhalla.github.io/valhalla/meili/
- Android GNSS status and IRNSS: https://developer.android.com/reference/android/location/GnssStatus
- Recent smartphone fusion baseline, AVNet: https://link.springer.com/article/10.1186/s43020-025-00168-7

The architecture is an integration of established approaches. No trained TCN, EqNIO architecture, R-WhONet transfer learning, 15-state ESKF or field-validated sub-10% accuracy is claimed.
