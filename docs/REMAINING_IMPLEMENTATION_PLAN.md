# NavDR remaining implementation plan

**15 September 2026 · Based on native development build 0.2.0**

This is the execution plan from the current APK to a validated Android product and then a pilot SDK. It supersedes the sequencing in the pre-build roadmap where work is already implemented. It does not mark the remaining work as completed. See [verified build status](NATIVE_BUILD_PROGRESS.md), [hardware constraints](DEVELOPMENT_CONSTRAINTS.md), and [original audit and risks](NAVDR_IMPLEMENTATION_ROADMAP.md).

**Target outcome:** an Android app that records reliably, estimates vehicle motion through a declared range of GNSS interruptions, runs a genuinely trained model locally, reports when its estimate is unavailable, and has reproducible evidence of accuracy and resource use.

The team has six full-time contributors and no fixed deadline. The workstation has **6 GB VRAM**. Time ranges below are engineering estimates after prerequisites become available, not promised delivery dates. Reference equipment, data access and field collection may dominate elapsed time. No equipment purchases, external messages or cloud spending are implied by this plan.

## Starting point and ownership

Already implemented: Kotlin app and navigation library, classical six-state filter, timestamped sensor/GNSS recording, foreground service, bounded storage, trajectory/diagnostics screen, GNSS test mask and recording-to-browser conversion. The APK builds and its signature verifies; 24 native and five bridge tests passed. Hardware behavior and accuracy remain unverified. No trained model is installed.

| Owner | Primary responsibility | Review partner |
|---|---|---|
| A1 — Android acquisition | Sensors, service lifecycle, permissions, recording, device profiling | A6 |
| A2 — App and mobile inference | User flows, model runtime, packaging, eventual SDK integration | A1/A3 |
| A3 — ML | CPU/GPU training tools, causal model, experiments, export | A4/A6 |
| A4 — Navigation | Filter, alignment, model fusion, recovery and validity | A3/A6 |
| A5 — Data and maps | Dataset inventory, reference synchronization, collection, road graph | A4/A6 |
| A6 — Validation and release | Evaluation contract, independent tests, evidence, requirement tracking | Relevant implementation owner |

These are proposed roles for the six people, not assigned names or spawned agents. A6 should review evaluation independently of model tuning. Owners rotate support between phases rather than waiting for their specialty to become active.

## Sequence and dependencies

| Phase | Main result | Approximate work window | Prerequisite |
|---|---|---|---|
| 1 | Reliable recording build and device report | 1–2 weeks initially | Primary test phone |
| 2 | Correct evaluator and benchmark exports | 1–2 weeks, alongside Phase 1 | Current source and test fixtures |
| 3 | Verified data, reference plan and frozen splits | 2–4 weeks, alongside Phases 1–2 | Data access; equipment for field truth |
| 4 | First genuine trained model and baseline report | 2–3 weeks | Phases 2–3; usable training environment |
| 5 | Model running correctly on a phone | 1–2 weeks | Phase 4 checkpoint; Phase 1 device baseline |
| 6 | Improved alignment, recovery and road constraints | 3–5 weeks; selected work starts earlier | Classical baseline evidence; integration contract |
| 7 | Frozen field evaluation and release candidate | 2–4 weeks plus collection lead time | Integrated candidate and independent reference |
| 8 | Stable SDK and bounded partner pilot | 4–8 weeks plus partner lead time | Phase 7 evidence and agreed pilot |

Plan for roughly **12–18 weeks to the first evidence-backed app candidate**, with overlapping work and no major architecture rewrite. This estimate does not guarantee a target accuracy. A required new 15-state ESKF can add roughly 5–9 weeks of specialist implementation/validation, partly overlapping other work; expand the schedule rather than compress testing. The commercial pilot is a separate milestone.

The critical dependency is **correct scoring + trustworthy data → meaningful training → verified phone inference → independent field evidence**. Android hardening and data/reference preparation start immediately. A tiny runtime compatibility experiment can run before training, but its output is not a trained-model deliverable.

## Phase 1 — Make the recording app dependable

**Owners: A1/A2; validation: A6.**

1. Inventory the first phone: model, Android/API, sensors, GNSS capability, free storage and power-management settings. Expand to at least three available phone models, preferably across two manufacturers, before claiming multi-device support. If only one is available, declare one-device support.
2. Exercise start/stop/restart, repeated button presses, screen rotation, app switching, notification Stop, screen lock, approximate-location denial, notification denial, location disabled/re-enabled, permission revocation and process death. Require explicit restart after interruption.
3. Test normal export, export cancellation, unavailable destination, low storage, writer failure and interrupted recordings. Add session history, per-session export/delete and clear incomplete-session labels; the current UI exports only the latest stopped session.
4. Create a recording-inspection tool reporting sample intervals, sensor delivery delay, synchronized-pair loss, GNSS age, event counts, gaps and completion status. Preserve raw timestamps and distinguish hardware loss from synchronizer rejection.
5. Measure 10-minute foreground/screen-off runs, a 30-minute moving run and a sustained two-hour recording on each declared supported phone. Test interruption/recovery separately; zero crashes during a short demonstration is insufficient.
6. Fix failures found, move user-facing strings into resources, improve accessibility, and record build/device identity in diagnostics. Add targeted lifecycle/instrumentation tests where they can reproduce actual risks.

**Deliverables:** improved APK, `docs/DEVICE_TEST_MATRIX.md`, `tools/inspect_native_session.py`, reproducible device logs, supported-device list and known limitations. File names are proposed new artifacts.

**Gate G1:** clean sessions round-trip with consistent counts; interrupted sessions retain explicit incomplete provenance; no unexplained corruption, crashes or hanging finalization in the registered matrix. All observed timing loss is accounted for. Initial performance target: p95 sensor-to-output age below 100 ms on supported phones, with the existing 100 ms gap/250 ms staleness policies still enforced. If a phone cannot sustain the required cadence, diagnose or exclude it; do not silently synthesize samples or loosen limits to pass.

## Phase 2 — Make evaluation and exports trustworthy

**Owners: A6/A4; support: A2. Start immediately.**

1. Define one versioned result contract: input/build/model/config hashes, trip and outage IDs, timestamps, selected output, reference provenance/quality, validity coverage and failure reasons.
2. Replace pooled outage scoring in `js/navigation-core.js` with independent intervals. For each eligible interval, calculate peak position error divided by reference distance within that same interval. Also report endpoint error and absolute errors. Freeze minimum duration/distance and reference-quality rules before comparison; stationary/short cases get absolute-error reporting rather than an unstable percentage.
3. Correct `js/accuracy-benchmark.js`: preserve missing metrics as null, export the current simulation/replay/device result, and prevent stale or absent metrics becoming zero. Freeze configuration for scored runs or create explicit configuration boundaries.
4. Keep position, speed, heading, source and uncertainty semantics consistent. Make GNSS acceptance policies comparable across baselines, or label their differences as separate experiments. Port native timing/output corrections where needed; browser replay currently re-estimates with different policies.
5. Build a JVM command-line replay runner using the actual Kotlin engine, plus an offline evaluator that reads its outputs. Evaluate native `navigation` rows directly too. Reference input must remain outside the estimator interface.
6. Separate synthetic tests, software-masked real recordings and physical outages. Count no initialization, no output, reference loss and late recovery; unavailable intervals cannot disappear from success statistics.

**Deliverables:** `docs/EVALUATION_CONTRACT.md`, corrected browser exports, native replay CLI, `tools/evaluate_navigation.py`, versioned JSON/CSV reports and focused regression fixtures.

**Gate G2:** two 100 m outages with 15 m peak errors each report 15% each, never a pooled 7.5% pass. Missing truth stays unscored in UI and export. Mutating reference does not change estimator output. Replaying the same native inputs/configuration reproduces selected outputs within declared numeric tolerances. Report reference-qualified fraction, output coverage and failures alongside accuracy; incomplete output cannot earn a complete-case pass.

## Phase 3 — Establish usable data and reference measurements

**Owners: A5/A3; review: A4/A6.**

1. Obtain the organizer's exact problem statement/scoring text and create a requirement-to-test matrix. Resolve mandatory algorithms, outage lengths, alignment behavior, external-IMU compatibility and preliminary/final artifacts. Until verified, the requested <10% criterion remains a project target, not an authenticated official rule.
2. Inventory IO-VNBD files and rights, identify phone streams and verified corresponding vehicle streams, check units/axes/gravity, timestamp offsets, missing intervals and label quality. Existing import code is a starting point, not proof of synchronized training pairs.
3. Treat sampling rate as part of the model contract. The IO-VNBD publication describes phone collection at 10 Hz; inspect actual file cadence before choosing windows. Keep native fusion at its validated acquisition rate and use a defined causal rate conversion for a lower-rate model. Do not claim interpolation creates high-frequency training evidence. [Dataset paper](https://arxiv.org/abs/2005.01701)
4. Split whole trips before generating overlapping windows. Separate vehicles/phones/routes where metadata and sample counts permit; disclose grouping limitations. Fit normalization only on training groups. Freeze validation and test manifests, hashes and preprocessing version.
5. Arrange local collection with reference instrumentation whose trajectory remains trustworthy through the intended outage. Verify clock alignment and reference uncertainty. A second phone or open-sky GNSS comparison alone is not sufficient physical-tunnel truth.
6. Collect an initial three-phone/ten-trip engineering corpus where available: straight motion, turns, stops, acceleration/braking and short masks. Use it to discover failures, not as universal accuracy certification. Build a separate final held-out collection later.

**Deliverables:** dataset manifest, pairing/quality report, split files, synchronization plots, collection protocol and reference/equipment plan. Keep private recordings and large datasets out of Git.

**Gate G3:** a reviewer can trace every training label and reference sample to its source, coordinate frame and clock; invalid/ambiguous pairings are excluded with reasons; trip leakage checks pass. If independent reference is unavailable, continue development and masked tests, but leave physical-outage accuracy unresolved.

## Phase 4 — Train within 6 GB VRAM

**Owner: A3; support: A5/A4; evaluation: A6.**

Create `ml/` with pinned environment instructions, CPU preprocessing, grouped dataset loader, training/evaluation entry points, versioned configs, checkpoint metadata and a memory smoke-test command. Keep the first experiment small and causal; the browser's seeded weights are not an initial success metric.

1. Reproduce non-learned baselines: raw integration, constant/last accepted speed and classical EKF, with declared GNSS/mount policies.
2. Start with a small causal temporal model, for example 16–32 hidden channels and a 2–4 second validated-rate input window. These are probe candidates, not a proven optimum. Define units, axes, normalization, timestamp alignment, output meaning and warm-up/reset behavior before training.
3. Use speed labels only where their source and synchronization are qualified. Treat GNSS-derived supervision as weaker labels and report it separately. Do not feed hidden outage GNSS, reference positions, future samples or test statistics to the model.
4. Check CPU correctness and causality first. Inspect actual available GPU memory; the driver was unavailable in this execution environment at the last check. Start with microbatch 1, then 2 or 4 only after a complete forward/backward/optimizer probe succeeds.
5. Use **a provisional process budget no greater than 4 GiB reserved GPU memory and at least 1 GiB observed device headroom**, lowering it if other applications need more. These are conservative starting targets, not an OOM guarantee. Measure peaks across warm-up, optimizer-state allocation and validation. Keep data on CPU, begin with zero data-loader workers, bound prefetch, and run one GPU job at a time.
6. Validate mixed precision before adopting it; use gradient accumulation for effective batch size without increasing microbatch memory. Accumulate consistently and step/update at the effective-batch boundary. [PyTorch AMP examples](https://docs.pytorch.org/docs/2.14/notes/amp_examples.html)
7. Run memory probes in a separate process. On OOM, record the failed configuration, end that process and retry a smaller configuration within a bounded retry limit. Do not skip examples or silently continue a partial optimizer update. Checkpoints must support restart; no paid GPU fallback is assumed.
8. Compare velocity error and integrated per-outage navigation on development data. Log seeds, splits, code/model hashes, actual peak memory and failures. Run a small number of sequential experiments before expanding the search.

**Deliverables:** real checkpoint, reproducible training command, model card, memory report, baseline/model plots and IO-VNBD position results with reference limitations.

**Gate G4:** training completes within the measured budget, reload reproduces predictions, leakage/causality checks pass, and performance is reported honestly. A first trained checkpoint completes the preliminary-model milestone even if weak; enabling it by default additionally requires improvement over the classical baseline on registered development measures, without unacceptable tail-error or coverage regression. Freeze those acceptance tolerances before comparing candidates.

## Phase 5 — Deploy and integrate the model

**Owners: A2/A3; fusion: A4.**

1. Run a short compatibility experiment to choose one Android CPU runtime. Test actual model operators, tensor shapes and packaging; retain the earlier LiteRT candidate and evaluate ONNX Runtime Mobile if conversion/operator support favors it. Avoid maintaining two production paths. ONNX Runtime documents Android deployment and model/device evaluation. [Mobile deployment documentation](https://onnxruntime.ai/docs/tutorials/mobile/)
2. Export FP32 first. Version input rate/window, scaling, output units, state-reset policy and artifact checksum alongside weights. Compare desktop and phone tensors using the same golden sequences and explicit tolerances.
3. Keep inference off the acquisition thread. Use bounded windows/work queues, timestamped predictions and a latest-result policy; reject late, invalid or incompatible model output. Continue the classical baseline when the model is warming up, missing or failing.
4. Fuse model speed conservatively. Calibrate observation error on validation groups and account for temporal correlation; overlapping predictions must not be treated as unlimited independent evidence. Record model identity, contribution and fallback reason.
5. Measure whole-app latency, RAM, CPU, thermal behavior and battery against classical-only operation. Initial target: p95 inference below 50 ms at a 10 Hz prediction cadence, without degrading acquisition. Revise device support/rate/model size on measured evidence.
6. Try INT8 only after FP32 parity and performance are understood. Calibrate using training/development data, re-evaluate full navigation and keep FP32 if quantization hurts the registered acceptance metrics.

**Gate G5:** the phone runs the real artifact offline, parity tests pass, missing/bad models fall back cleanly, and sustained runs meet the declared timing/memory budgets. The app displays an actual model version rather than a generic AI claim.

## Phase 6 — Improve navigation robustness

**Owner: A4; maps: A5; app: A2.**

Implement changes as independently measured increments, keeping classical-only and model-assisted baselines available:

- **Alignment:** stationary bias/gravity checks, observable forward-axis calibration during suitable movement, calibration quality and reset states. Gravity alone cannot determine yaw. Detect mount disturbance, invalidate affected estimates, and require adequate observations before recovery. Explicitly retain unsupported handling cases.
- **Recovery:** sequences with delayed/outlier fixes, intermittent reception, abrupt GNSS jumps, stops/restarts and repeated outages. Validate reacquisition rather than accepting the first returned coordinate. Measure accepted-fix age and recovery latency.
- **Signal quality:** evaluate satellite/C/N₀-based gating as a separate feature. IRNSS visibility does not establish dedicated NavIC positioning or predictive handoff.
- **Maps:** add a bounded native road graph/matcher, reset state across relevant gaps and handle off-road/parallel-road ambiguity. Export unconstrained and road-constrained positions separately with matching status. Compare cross-track and along-track errors; a plausible road trace can still be wrong.
- **Uncertainty and duration:** assess empirical coverage and define availability limits from evidence. Keep the current 30-second development cap until measured data justifies a change. Beyond-limit tests must verify degradation; no multi-hour accuracy promise.
- **Architecture decision:** retain the six-state implementation unless requirements or observed failures justify a 15-state ESKF. If selected, separately specify 3D frames/quaternions, Jacobians, bias/noise, covariance propagation and reset; require numerical checks and independent fusion review before replacing the baseline.

**Gate G6:** each enabled feature has an ablation and registered failure tests. Automatic alignment, road matching and longer outages are advertised only within the tested envelope. No map or confidence display conceals unavailable estimation.

## Phase 7 — Freeze evidence and prepare release

**Owner: A6; all contributors supply artifacts.**

1. Freeze code, model, preprocessing, map assets, operating envelope and evaluation rules before final testing. Register outage intervals and reference exclusions in advance. Keep a final corpus separate from model-development trips.
2. Evaluate open-sky reference-qualified masks of 5/10/20/30 seconds plus longer intervals for failure behavior. Run physical outages as a separate category where valid reference exists. Include turns, stops, different supported phones/mounts and repeated recoveries.
3. Report per-outage peak/endpoint error, normalized drift where eligible, median/p95/worst, initialization success, output coverage, rejection/gap counts and recovery latency. Report trip/device counts and cluster by trip when estimating uncertainty. Show classical, learned and map-assisted ablations on identical inputs.
4. Check current Android lifecycle/permission requirements and release packaging against official documentation at implementation time. Finish diagnostics/history/delete flows, offline failure messages, accessibility, retention controls and relevant security review. Verify the actual data flows; do not infer privacy merely from local inference.
5. Build a reproducible release candidate, test on primary/backup phones, and create a claim-to-evidence index, known-limitations sheet, model card and live demo with a clearly labeled replay backup.

**Gate G7:** every accuracy claim matches the frozen criterion and tested population. If the target is missed, publish a failure analysis and return to development. A previously inspected test set becomes development evidence; a new final holdout is required after tuning. Compiling the APK or achieving a favorable median is not a substitute for the registered pass rule.

## Phase 8 — SDK and pilot

After the app evidence is sufficient, extract a versioned Android SDK API for configuration, sensor input, selected navigation output, validity/age, model identity and diagnostics. Keep UI and data collection policy outside the core API. Supply a sample integration app, lifecycle documentation, artifact compatibility checks, migration policy and rollback path.

Agree a bounded pilot with one use case and partner: supported phones/vehicles, outage exposure, integration responsibilities, reference/evaluation method, retention and success criteria. Start with a small integration cohort before expanding. Track useful output during relevant outages, false position jumps, unavailable coverage, battery cost, integration effort and actual customer value. Partner outreach, paid equipment and commercial commitments require their own authorization.

**Gate G8:** a partner can integrate without changes to core code, reproduce the documented behavior and assess value from measured results. iOS, broad handheld support, country-scale maps and safety-critical positioning remain separate projects justified by evidence and demand.

## First implementation sprint

Execute this backlog next; do not begin a large training run while data/evaluation contracts remain unresolved.

| ID | Owner | Concrete task | Acceptance evidence |
|---|---|---|---|
| R01 | A6 | Create requirement/evaluation contracts | Targets, unknown official requirements and failure accounting explicit |
| R02 | A1/A6 | Install current APK and record first outdoor/static/moving sessions | Phone identity, raw exports, observed timings and defects |
| R03 | A1/A5 | Implement streaming recording inspector | Valid, gapped, incomplete and malformed fixtures yield correct diagnostics |
| R04 | A4/A6 | Correct per-outage evaluation | Multi-outage regression prevents denominator pooling |
| R05 | A2/A6 | Correct null/stale exports and selected-output consistency | UI/JSON/CSV agree for simulation, replay and no-reference inputs |
| R06 | A4 | Add actual-core JVM replay entry point | Same ordered inputs/config reproduce native output |
| R07 | A5 | Build dataset inventory/pairing report | Available files, rights, units, cadence and usable labels recorded |
| R08 | A3/A5 | Define grouped splits and preprocessing | No trip leakage; normalization uses training groups only |
| R09 | A3 | Add CPU-first ML scaffold and isolated memory probe | Tiny correctness fixture passes; no full-data GPU allocation |
| R10 | A2/A3 | Run mobile-runtime compatibility experiment | One chosen runtime and documented conversion/operator evidence |
| R11 | A1/A2 | Fix first device lifecycle/export defects; add session management | Targeted reproductions pass on the test phone |
| R12 | A5/A6 | Secure a feasible independent-reference collection plan | Equipment/access/cost unknowns visible; no unsupported truth designation |

Device-dependent work needs the user's phone/access and exported recordings. Dataset-dependent work needs actual files and rights. Physical accuracy needs suitable reference equipment and collection access. These dependencies do not block evaluator fixes, JVM replay, fixture tests or CPU training scaffolding. Reassess estimates after this sprint using observed device/data failures.
