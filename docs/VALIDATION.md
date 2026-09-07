# Validation record

Validated across 2026-09-06 and 2026-09-07 in the local workspace.

- `node tests/navigation.test.cjs`: 15 checks passed. Covers sample clocks, fix cadence, reference isolation/absence/gaps, deterministic ablations, signed improvement, rotated mounting, malformed mounting, positive-definite symmetric covariance, outlier gating, directed graph traversal, OSM one-way import, native C/N₀ persistence/expiry and malformed replay.
- `node tests/integration.test.cjs`: guided 17-second outage, pause/resume, persistent manual override, complete 5/10/30/60-second scenario suite, real OSM graph, four ablations and selected-output replay round trip passed.
- `python3 tests/importer.test.py`: speed unit conversion, explicit gyro axis mapping, 1 Hz GNSS downsampling and no inferred reference passed.
- Official IO-VNBD public smartphone CSV prefix converted successfully (20 complete rows). Browser import completed with no independent reference score. The short sample lacks a sufficient moving course to initialize navigation; the app reports the waiting condition rather than inventing a location.
- Browser review at 1440×900 and 390×844: guided run, worker ablations and source/error readouts inspected. Mobile document width did not exceed viewport width. Review fixed the inherited mobile height cap, duplicate Start text, dark map filter, stale diagnostic constants and misleading route overlays in recording/device modes.
- No browser console errors observed in the checked simulation, ablation and import flows.
- Bundled Leaflet 1.9.4 JS/CSS SHA-256 hashes match the original script/link integrity values. License included.
- `git diff --check`: clean.

The integration harness processes 25 seconds of input in approximately one second on this host; this is computation timing, not browser FPS or hardware performance. Synthetic drift values are not field accuracy claims. In the OSM-backed demo, matching can perform worse than the planar EKF because the scripted trajectory does not follow the independent graph exactly.

Not validated: Android APK compilation, real phone sensor axes/cadence, IRNSS observation availability, native permission/export behavior and vehicle accuracy. The workspace has no Android SDK, Gradle installation or connected test device. The native deliverable is source code, not a verified binary. No model training or field benchmark was performed.
