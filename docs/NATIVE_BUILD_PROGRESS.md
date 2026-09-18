# Native product build — first implementation slice

**15 September 2026.** The user approved starting product implementation with the recommended Kotlin-native architecture. This updates the planning-only boundary of the earlier roadmap; it does not approve or claim a completed 15-state ESKF, trained model, field benchmark, or commercial release.

The workstation has a user-reported **6 GB VRAM limit**. Future ML work must follow [development constraints](DEVELOPMENT_CONSTRAINTS.md); the current Android/JVM build uses CPU/system RAM. No GPU training has been started.

## Implemented

| Area | Result |
|---|---|
| Architecture | Separate pure Kotlin/JVM `navigation` module and native Android `app`; retained application ID for development upgrades. Browser code remains unchanged. |
| Build | Pinned AGP/Kotlin configuration, Gradle wrapper/distribution checksum, JVM tests. |
| Acquisition | Location foreground service, worker-thread sensor/GNSS capture, optional magnetometer/rotation vector, FIFO capabilities, requested batching and native timestamps. |
| Synchronization | Bounded causal IMU pairing, 30 ms gyro age limit, discarded-pair accounting. |
| Navigation | Six-state filter port, gated fixes, consistently filtered outputs, timing invalidation, moving-course initialization and bounded outage operation. |
| Recording | Private streaming JSONL, bounded queue/storage, completion accounting, incomplete-session markers, explicit export. Satellite events survive lack of fixes. |
| Interface | Native controls/diagnostics, offline estimated path, labeled software GNSS mask, uncalibrated/no-model labels. |
| Replay bridge | Validated JSONL conversion, segmented gaps/large files, no fabricated truth, explicit incomplete-data recovery. |

## Verification

Verified on 15 September 2026 with JDK 17, Gradle 8.9, Kotlin 2.1.20 and Android SDK 35:

- `:navigation:test`: **24 tests passed**, zero failures/errors. Covers filter behavior/covariance, browser math parity, causal synchronization, asynchronous GNSS buffering, and journal completion/failure behavior.
- `:app:assembleDebug`: **passed**. Development APK: `native/android/app/build/outputs/apk/debug/app-debug.apk`, application ID `org.navdr.recorder`, version `0.2.0`, minimum Android API 30 (Android 11), target API 35.
- `:app:lintDebug`: **passed**, zero errors and 23 warnings (22 for English UI strings needing localization, one for the deliberately required GPS feature). Backup-rule, launcher-icon and per-point drawing-allocation warnings were addressed.
- APK signature verified with SDK `apksigner`; packaged identity, permissions and SDK levels inspected with `aapt`. This is debug signing, not release signing.
- `python3 tests/native-importer.test.py`: **5 tests passed**, including browser parsing and explicit handling of missing truth, masks, gaps and damaged recordings.
- Existing browser navigation, TCN, road-route, integration and importer regression suites passed during this implementation. Synthetic filter parity/regressions establish software behavior, not field accuracy.
- `git diff --check`: passed.

APK SHA-256 for this build: `fa0b329a88f45797aad96a51ecce163ac0dda5b76dcc9575ab003e725884fa13`.

No physical phone was connected at the device check. Installation, visual behavior, live sensors, screen-off persistence, backup/transfer exclusion, export and energy therefore still require device verification. GPU training has not run; the NVIDIA driver was unavailable from this execution environment.

The local build toolchain and dependency cache are under ignored `.local-tools/navdr/`; `local.properties` is machine-specific and ignored. Source builds use the checked-in Gradle wrapper with a standard JDK/SDK installation as described in the native README. System-RAM limits are two Gradle workers, a 2 GiB Gradle heap and a 768 MiB Kotlin daemon heap; these are not GPU allocations.

## Remaining product work

The next execution sequence, team ownership, acceptance gates and first-sprint backlog are in [remaining implementation plan](REMAINING_IMPLEMENTATION_PLAN.md).

1. Install on supported phones and measure cadence, dropped pairs, GNSS delivery latency, screen-off/OEM behavior, permission/notification denial, process death, storage/export and energy. Exercise physical mount and interruption flows.
2. Authenticate the organizer's exact current PS/scoring contract and arrange independently referenced collection. No official date or equipment/data budget has been supplied.
3. Establish verified IO-VNBD pairings, units, rights and grouped splits; train/evaluate a genuine velocity model. No trained checkpoint or dataset corpus was found in the repository.
4. Export and validate actual mobile inference, then quantify improvement over this classical baseline. Seeded random weights are not a product feature.
5. Add validated automatic alignment/mount-change handling, GNSS quality/recovery improvements and native map matching. Decide on a 15-state ESKF against requirements and measured failures.
6. Implement independent per-outage evaluation and fix remaining browser benchmark/export issues before headline comparisons.
7. Expand into SDK integration and a qualified customer pilot after evidence supports the core value.

The 30-second outage and 100/250 ms timing limits are conservative development policies, not validated accuracy/performance guarantees. This app has no independent reference and cannot report real drift accuracy by itself.

## 16 September software follow-up

The original 15 September counts/hash above describe the initial build, not the latest APK. The latest source adds session history/actions, a native replay CLI, corrected browser scoring/export and user-operated ML tooling. Exact code/line references, acceptance commands, raw outputs and current build hash are in [software acceptance handoff](SOFTWARE_ACCEPTANCE_2026-09-16.md). History UI acceptance and GPU allocation remain untested/blocked; IO-VNBD inventory is paused by the user's instruction. This update does not mark those tasks complete.
