# NavDR software implementation and acceptance handoff

16 September 2026. This report distinguishes executed software checks, untested device/GPU behavior and user-controlled STOP boundaries. Fixtures are synthetic and labeled; none represents a physical recording or independently referenced field run. At the time of the original software checks, no real IO-VNBD training, inventory/pair selection, authenticated PS drafting, equipment decision or production architecture/runtime selection was performed. **Subsequent R07 update:** the user supplied the dataset, all CSV payloads were retrieved and inventoried; [the current review handoff](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/IO_VNBD_REVIEW.md:1) supersedes the historical dataset-availability status below. Pairing approval, real splitting and training remain pending.

## 1. Session inspector — fixture acceptance passed

Built [inspect_native_session.py](/home/rimuru/Downloads/Antigravity/SIH_Pototype/tools/inspect_native_session.py:26) to report intervals, arrival delays, raw gaps, frame gaps, pairing counts, recorded synchronizer rejections, GNSS age, event counts and completion. It uses bounded online statistics and a bounded raw-sample matching cache. Hardware loss is explicitly unknown: raw timestamp gaps cannot prove whether hardware, OS scheduling or differing actual cadence caused missing callbacks. The synchronizer counter is a last-published snapshot, not a final loss total.

Acceptance command: `python3 tests/inspector-acceptance.py`. Fixture generator/assertions: [inspector-acceptance.py](/home/rimuru/Downloads/Antigravity/SIH_Pototype/tests/inspector-acceptance.py:1). Actual summary output:
```text
{"fixture": "valid.jsonl", "status": "complete", "frameGaps": 0, "rawGaps": {}, "syncRejected": 0, "hardwareLoss": null, "errors": []}
{"fixture": "gapped.jsonl", "status": "complete", "frameGaps": 1, "rawGaps": {"1": 1, "4": 1}, "syncRejected": 1, "hardwareLoss": null, "errors": []}
{"fixture": "incomplete.partial", "status": "incomplete", "frameGaps": 0, "rawGaps": {}, "syncRejected": 0, "hardwareLoss": null, "errors": []}
{"fixture": "malformed.jsonl", "status": "malformed", "frameGaps": 0, "rawGaps": {}, "syncRejected": 0, "hardwareLoss": null, "errors": [{"line": 4, "message": "invalid frame vectors"}]}
PASS: valid, gapped, incomplete and malformed fixtures inspected via CLI.
```
| Fixture file | Full raw inspector output |
|---|---|
| [valid.jsonl](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/fixtures/valid.jsonl:1) | [valid.inspection.json](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/valid.inspection.json:1) |
| [gapped.jsonl](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/fixtures/gapped.jsonl:1) | [gapped.inspection.json](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/gapped.inspection.json:1) |
| [incomplete.partial](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/fixtures/incomplete.partial:1) | [incomplete.inspection.json](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/incomplete.inspection.json:1) |
| [malformed.jsonl](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/fixtures/malformed.jsonl:1) | [malformed.inspection.json](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/malformed.inspection.json:1) |

The malformed invocation exits 1; complete and incomplete valid-prefix reports exit 0 with their status explicit. This is a diagnostics tool, not proof that real phone acquisition is reliable.

## 2. Independent outage scoring — exact requested case passed

Built the per-interval [OutageScorer](/home/rimuru/Downloads/Antigravity/SIH_Pototype/js/navigation-core.js:220) and connected it after estimation at [navigation-core.js](/home/rimuru/Downloads/Antigravity/SIH_Pototype/js/navigation-core.js:369). The latest interval drives live metrics; separate intervals remain available for export. Missing reference/output makes an interval unscored. Existing short-interval eligibility limits remain development rules; no official pass target has been assumed.

Acceptance command: `node tests/outage-acceptance.cjs`. The [full synthetic scenario](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/fixtures/two-outages.json:1) contains two distinct 100 m outages, with a 15 m offset at each outage sample. The actual corrected scorer output is in [two-outages.output.json](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/two-outages.output.json:1). The exact console output (including the export test below):
```text
EXACT TWO-OUTAGE ACCEPTANCE:
[
  {
    "id": 1,
    "distanceM": 100,
    "peakErrorM": 15.000000000000005,
    "driftPercent": 15.000000000000005
  },
  {
    "id": 2,
    "distanceM": 100,
    "peakErrorM": 14.999999999999995,
    "driftPercent": 14.999999999999995
  }
]
INCOMPLETE REFERENCE EXPORT:
source,id,outageSeconds,outageDistance,maxRaw,maxOutput,driftPercent,status
"replay",1,10,80,15.000000000000005,15.000000000000005,null,"INCOMPLETE REFERENCE"

PASS: current device result clears prior replay metrics; no stale history export.
PASS: unavailable/mount-uncalibrated output remains counted and unscored.
```

Both values equal 15% within the declared 1e-8 percentage-point numeric tolerance. Neither interval reports 7.5%. This is a software regression check, not measured vehicle accuracy.

## 3. Null-preserving current-result export — acceptance passed

Built [current-result synchronization](/home/rimuru/Downloads/Antigravity/SIH_Pototype/js/accuracy-benchmark.js:242), [detached result export](/home/rimuru/Downloads/Antigravity/SIH_Pototype/js/accuracy-benchmark.js:253) and [per-interval CSV export](/home/rimuru/Downloads/Antigravity/SIH_Pototype/js/accuracy-benchmark.js:261). The workbench updates synchronization for every source, and export reads the current output again instead of reusing scenario-history rows. Unavailable averages and error metrics initialize to null.

The acceptance test deliberately removes truth at one timestamp and seeds stale history with a zero-score sentinel. It asserts the current replay export is incomplete/null and then changes to a device-source object with no reference, asserting previous metrics clear. This source-switch test is a synthetic software test, not a live phone session.

Actual [JSON export](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/incomplete-export.json:1) and [CSV export](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/incomplete-export.csv:1):
```text
source,id,outageSeconds,outageDistance,maxRaw,maxOutput,driftPercent,status
"replay",1,10,80,15.000000000000005,15.000000000000005,null,"INCOMPLETE REFERENCE"
```

## 4. Kotlin CLI and offline evaluator — synthetic repeatability passed

Built the actual-engine [JVM runner](/home/rimuru/Downloads/Antigravity/SIH_Pototype/native/android/navigation/src/main/kotlin/org/navdr/cli/ReplayMain.kt:7), [journal-to-estimator adapter](/home/rimuru/Downloads/Antigravity/SIH_Pototype/tools/replay_native.py:9) and [offline evaluator](/home/rimuru/Downloads/Antigravity/SIH_Pototype/tools/evaluate_navigation.py:17). The adapter validates a native recording and emits an explicit estimator-only TSV. Reference data is supplied separately to the evaluator. Injected reference fields in native sensor frames are rejected before invoking the engine.

Acceptance commands (with `JAVA_HOME` pointing to JDK 17):

```sh
python3 tests/replay-acceptance.py
python3 tests/offline-evaluator-acceptance.py
```

The [601-frame synthetic recording](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/fixtures/replay.jsonl:1) contains initialization, a masked outage and GNSS return. Both runs used the actual compiled Kotlin engine. Actual output:
```text
{
  "provenance": "synthetic native-format recording; not a physical phone run",
  "rows": 601,
  "byteIdentical": true,
  "numericTolerance": 0,
  "maximumAbsoluteDifference": 0,
  "injectedReferenceRejectedBeforeEstimator": true,
  "observedModes": [
    "DEAD_RECKONING",
    "GNSS_AIDED"
  ]
}
RUN 1 first/last:
10000000,true,GNSS_AIDED,28.0,77.0,10.0,0.0,4.895303872079853,0.0,0,0
6010000000,true,GNSS_AIDED,28.000539592963552,77.0,10.000000000010044,0.0,6.2516816207083075,1.0,0,0
RUN 2 first/last:
10000000,true,GNSS_AIDED,28.0,77.0,10.0,0.0,4.895303872079853,0.0,0,0
6010000000,true,GNSS_AIDED,28.000539592963552,77.0,10.000000000010044,0.0,6.2516816207083075,1.0,0,0
```
Both full CSVs: [run 1](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/replay-run-1.csv:1) and [run 2](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/replay-run-2.csv:1). Byte comparison and numeric tolerance are both zero. The evaluator also executed against separate synthetic reference/no-reference inputs:
```text
PASS: offline evaluator reports two independent 15% synthetic intervals; missing reference yields null for both.
```
Full evaluator evidence: [offline-evaluator-acceptance.json](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/offline-evaluator-acceptance.json:1); actual CLI output evaluated without truth: [replay-evaluation.json](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/replay-evaluation.json:1).

A development-test failure is retained in [replay-test-development-failure.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/replay-test-development-failure.log:1): the first new reference-injection assertion expected silent stripping, but the validator correctly rejected invented truth. The test was corrected to require rejection and rerun successfully. No estimator restriction was weakened.

Real phone recordings and parity with Android watchdog/lifecycle events remain **untested**. Paired-frame CLI replay is narrower than replaying the entire Android service.

## 5. Session history/export/delete — implemented, device acceptance UNTESTED

Before source: [latest-only export selection](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/MainActivity.before.kt:176). After source: [history dialog and selected-session actions](/home/rimuru/Downloads/Antigravity/SIH_Pototype/native/android/app/src/main/kotlin/org/navdr/recorder/MainActivity.kt:182) backed by [explicit catalog selection](/home/rimuru/Downloads/Antigravity/SIH_Pototype/native/android/navigation/src/main/kotlin/org/navdr/core/SessionCatalog.kt:10). The UI offers per-session export and confirmed deletion, and includes INCOMPLETE in partial-session labels. Those are source-level observations; visible Android rendering has not been observed.

Executed JVM acceptance: `:navigation:test`, specifically [historicalSelectionAndIncompleteLabel](/home/rimuru/Downloads/Antigravity/SIH_Pototype/native/android/navigation/src/test/kotlin/org/navdr/core/SessionCatalogTest.kt:8). Actual fixture before/after:
```text
{'name': 'org.navdr.core.SessionCatalogTest', 'tests': '1', 'skipped': '0', 'failures': '0', 'errors': '0', 'timestamp': '2026-09-16T02:20:32', 'hostname': 'ciel', 'time': '0.034'}
BEFORE latest-only selection: interrupted.partial
AFTER explicit historical export: old.jsonl -> OLDER CONTENT
UI label supplied by catalog: interrupted.partial · INCOMPLETE · 15 bytes
```
The test exports older fixture bytes, checks the label, deletes only the selected fixture and rejects path traversal. This is **not** the requested end-to-end phone UI before/after. The Android build/lint ran successfully; that does not verify the document picker, actual screen labels or device deletion. The phone acceptance steps are in [TOOLS_ACCEPTANCE_GUIDE.md](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/TOOLS_ACCEPTANCE_GUIDE.md:35). This task is not reported complete until the user runs that device acceptance.

## 6. ML scaffold — toy acceptance passed; GPU budget NOT verified

Built [pinned dependency lock](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/requirements.lock:1), [existing-topology TCN adapter](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/model.py:8), [CPU preprocessing](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/preprocess.py:15), [grouped/memory-mapped window loader](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/dataset.py:9), [training entry point](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/train.py:10), [evaluation entry point](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/evaluate.py:10) and [isolated GPU probe](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/memory_probe.py:7). Versioned config, normalization, split/model/config hashes, optimizer state and environment metadata are retained in checkpoints. The detailed commands and limitations are in [README.md](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/README.md:1).

Acceptance command: `.local-tools/ml-venv/bin/python ml/toy_acceptance.py`. Actual output:
```text
{"status": "completed", "synthetic": true, "optimizerSteps": 2, "checkpoint": "/tmp/navdr-ml-toy-79ezpqxv/toy.pt", "realDataTraining": false}
{
  "status": "PASS",
  "syntheticOnly": true,
  "realDataTraining": false,
  "splitStatus": "DRAFT_REQUIRES_USER_REVIEW",
  "tripCount": 6,
  "checks": [
    "whole trips grouped before windows",
    "shared vehicle never crosses splits",
    "transitive shared phone/route links preserved",
    "deliberate group leakage rejected",
    "normalization matches train rows only",
    "two CPU optimizer steps",
    "held-out dev entry point executes",
    "checkpoint reload identical",
    "49665 parameters"
  ],
  "devWindowsExecuted": 8
}
DRAFT TOY SPLIT (not a real-data split):
toy-1-0 v1 p1-0 r1-0 test
toy-1-1 v1 p1-1 r1-1 test
toy-0-0 v0 p0-0 r0-0 dev
toy-0-1 v0 p0-1 r0-1 dev
toy-2-0 v2 p2-0 r2-0 train
toy-2-1 v2 p2-1 r2-1 train
```

Only six tiny fake trips, two CPU optimizer steps and eight dev windows were used. Temporary toy checkpoints were removed by test cleanup. No real training or real-loss interpretation occurred.

Memory acceptance command: `python3 ml/memory_probe.py --config ml/configs/toy-v1.json`. The parent launched a child and the child stopped on the driver check, returning nonzero. Actual output:

```text
{"status": "blocked_or_failed", "synthetic": true, "budgetVerified": false, "error": "nvidia-smi failed: NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver. Make sure that the latest NVIDIA driver is installed and running.", "limitReservedBytes": 4294967296, "requiredHeadroomBytes": 1073741824}
```

**BLOCKED, not passed:** no GPU tensors were allocated, so neither 4 GiB reserved memory nor 1 GiB headroom was verified. The reproducible environment is also CPU-only; the user needs a working driver plus a separately pinned CUDA environment before allocation can be tested. No driver changes were made. The probe enforces the budget in code but enforcing it in code is not measured proof.

**STOP observed:** no real IO-VNBD preprocessing/training/evaluation was run, and no real training result was interpreted. No larger GPU, paid cloud run or production model size was selected.

## 7. IO-VNBD inventory — historical STOP before dataset supplied

The user clarified that IO-VNBD is not downloaded and instructed us not to proceed with R07 until an exact path is supplied. No R07 scanner/inventory run or raw inventory output is claimed. No candidate pairing was approved. This is an explicit user boundary, not a simulated empty dataset standing in for real files.

## 8. Split logic — toy tests passed; real manifest awaits review

Built [split.py](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/split.py:6) using connected components of shared vehicle/phone/route identifiers before generating windows. The preprocessing path checks source hashes and rejects cross-split group leakage; normalization fits training rows only. Missing metadata is reported, not inferred. A real-data manifest requires the user to review its exact hash before preprocessing/training.

The toy acceptance above checks shared vehicles, transitive phone/route connections, leakage rejection and train-only normalization. The resulting [DRAFT toy manifest](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/toy-split-manifest.json:1) is available for inspection:

| Split | Toy trips | Shared vehicle group |
|---|---|---|
| Train | toy-2-0, toy-2-1 | v2 |
| Dev | toy-0-0, toy-0-1 | v0 |
| Test | toy-1-0, toy-1-1 | v1 |

**STOP observed:** this is a synthetic correctness manifest, not an IO-VNBD split. No real manifest was generated or finalized, and no real training followed it.

## 9. LiteRT versus ONNX — random-weight desktop experiment executed

As explicitly authorized, [compare_runtimes.py](/home/rimuru/Downloads/Antigravity/SIH_Pototype/ml/compare_runtimes.py:9) uses the architecture in [ai-motion-estimator.js](/home/rimuru/Downloads/Antigravity/SIH_Pototype/js/ai-motion-estimator.js:7) with fresh weights of the same shape. The adapter is checked against the original JS streaming implementation with identical fresh weights. Input is `[1,6,231]`; output is `[1,1]`; parameters total 49,665. The GNSS-anchor wrapper is outside this operator experiment.

Command: `.local-tools/ml-venv/bin/python ml/compare_runtimes.py --output .local-tools/runtime-comparison`. Raw results:
```text
[
  {
    "runtime": "onnx",
    "weights": "fresh random, untrained",
    "parameters": 49665,
    "inputShape": [
      1,
      6,
      231
    ],
    "outputShape": [
      1,
      1
    ],
    "jsParityMaxAbsDifference": 2.8559741793721116e-09,
    "numericTolerance": 1e-05,
    "onAndroidDevice": "UNTESTED",
    "runtimeDecision": "reserved for user/team",
    "operators": [
      "Add",
      "Cast",
      "Concat",
      "Constant",
      "ConstantOfShape",
      "Conv",
      "Gather",
      "Pad",
      "Reshape",
      "Slice",
      "Tanh",
      "Transpose"
    ],
    "runtimeVersion": "1.23.2",
    "exportVersion": "1.19.1",
    "status": "converted_and_desktop_cpu_executed",
    "maxAbsDifference": 0.0,
    "artifact": ".local-tools/runtime-comparison/tcn-random.onnx",
    "torchVersion": "2.10.0+cpu"
  },
  {
    "runtime": "litert",
    "weights": "fresh random, untrained",
    "parameters": 49665,
    "inputShape": [
      1,
      6,
      231
    ],
    "outputShape": [
      1,
      1
    ],
    "jsParityMaxAbsDifference": 2.8559741793721116e-09,
    "numericTolerance": 1e-05,
    "onAndroidDevice": "UNTESTED",
    "runtimeDecision": "reserved for user/team",
    "operators": [
      "ADD",
      "CONV_2D",
      "DELEGATE",
      "PAD",
      "RESHAPE",
      "SLICE",
      "TANH",
      "TRANSPOSE"
    ],
    "runtimeVersion": "2.2.0",
    "status": "converted_and_desktop_cpu_executed",
    "maxAbsDifference": 9.313225746154785e-09,
    "artifact": ".local-tools/runtime-comparison/tcn-random.tflite",
    "torchVersion": "2.10.0+cpu"
  }
]
```

| Finding | ONNX | LiteRT |
|---|---|---|
| Conversion and desktop FP32 CPU execution | Passed | Passed |
| Maximum absolute difference vs PyTorch | 0.0 | 9.313225746154785e-09 |
| Stated tolerance | 1e-5 | 1e-5 |
| JS adapter parity difference | 2.8559741793721116e-09 | Same |
| Android/mobile provider execution | UNTESTED | UNTESTED |
| Quantization / battery / phone latency | UNTESTED | UNTESTED |

Artifacts: [random ONNX model](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/runtime/tcn-random.onnx:1) and [random LiteRT model](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/runtime/tcn-random.tflite:1). Full warnings and execution logs: [onnx.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/runtime/onnx.log:1) and [litert.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/runtime/litert.log:1).

ONNX used the legacy exporter and emitted deprecation/constant-folding warnings. LiteRT skipped optional torchao C++ extensions because the installed Torch version was below their expected version; the recorded FP32 conversion and interpreter call still succeeded. No conversion failure occurred in these runs. This is one fixed-shape FP32 operator experiment, not proof of Android deployment readiness or trained-model quality.

**STOP observed:** no production runtime was chosen. No quantization, phone benchmark, real-model training or final architecture decision followed the comparison.

## Build/regression evidence and remaining user actions

Actual Gradle output: [android-build.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/android-build.log:1). Parsed counts/hash: [build-summary.json](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/build-summary.json:1). The build ran 25 JVM tests with zero failures/errors and produced an APK; lint reported zero errors and 23 warnings. Additional executed outputs: [navigation-tests.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/navigation-tests.log:1), [integration-tests.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/integration-tests.log:1), [native-importer-tests.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/native-importer-tests.log:1), [importer-tests.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/importer-tests.log:1), [tcn-tests.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/tcn-tests.log:1), [road-tests.log](/home/rimuru/Downloads/Antigravity/SIH_Pototype/docs/evidence/2026-09-16/road-tests.log:1).

The dependency-install approval initially timed out; the explicitly permitted retry succeeded. A package-download network timeout was retried successfully. Neither is a remaining block.

Remaining actions belong to the user: review real pairings and the eventual real split; run device-history acceptance and phone/runtime tests; restore a usable GPU environment for the allocation probe; provide authenticated PS text and reference instrumentation decisions. The IO-VNBD path was subsequently supplied and its CSV retrieval/inventory completed; see the current review handoff linked above. The user/team retains six-state versus 15-state, final model size and shipping runtime decisions.

There was no further experimentation beyond the stated boundaries. A CPU toy pass was not used as a substitute for the blocked GPU test; desktop conversion was not represented as a phone result; synthetic fixtures were not substituted for actual dataset inventory or field evidence.
