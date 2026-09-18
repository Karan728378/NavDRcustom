# NavDR Android

Native Kotlin development app and a separate JVM navigation library. This replaces the Activity-only Java recorder. The browser remains the experiment/replay workbench.

## Current capabilities

- A user-started location foreground service owns capture and continues when the Activity leaves the foreground. A notification provides Stop. Process death ends the session; no silent restart occurs.
- Requests accelerometer/gyro at 100 Hz, optional magnetometer/rotation vector at 20 Hz, and 20 ms maximum batching latency. Reports actual paired cadence, sensor/FIFO capabilities, sample age and discarded pairs. Requested cadence is not guaranteed hardware delivery.
- Uses native monotonic measurement timestamps. A bounded synchronizer holds the latest causal gyro within 30 ms of each accelerometer sample and never uses future gyro. Satellite status is an independent event stream, even without fixes; its timestamp is explicitly callback time because `GnssStatus` offers no measurement timestamp.
- Runs a six-state planar EKF on device. Position, speed, heading and covariance all come from that filter. Rejected GNSS does not teleport the displayed position or reset the accepted-fix age.
- Shows an offline estimated-path preview, not a street map or reference trajectory.
- Streams raw sensors, fixes, satellites, paired frames, controls and navigation outputs to private JSONL storage. Clean completion produces `.jsonl`; interruption/failure leaves `.partial`. Export requires an explicit document-picker action.
- Recording files are explicitly excluded from cloud backup and device transfer using Android backup rules, including the Android 12+ format ([platform documentation](https://developer.android.com/identity/data/autobackup)).
- A labeled software GNSS mask withholds estimator fixes while preserving raw capture. It is not a physical-outage test.

**Not implemented:** trained ML inference, automatic mount alignment/slip recovery, 15-state ESKF, native HMM/maps, independent reference acquisition, calibrated confidence or real-data accuracy claims. Magnetometer/rotation vector are recorded, not blindly fused into the fixed-mount baseline.

## Build

Use JDK 17, Android SDK platform 35 and build tools 34.0.0 (AGP default; 35.0.0 is also usable). First build needs network access for dependencies. Gradle 8.9 wrapper includes a distribution SHA-256; AGP is 8.7.3, Kotlin 2.1.20, minimum API 30 and target/compile API 35. This is a development baseline, not a claim of current store-publishing eligibility.

Open this directory in Android Studio, select JDK 17, and let Studio configure `local.properties`, or set `ANDROID_HOME` to your SDK. From this directory:

```sh
./gradlew :navigation:test :app:assembleDebug :app:lintDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`. Install through Studio or `adb install -r app/build/outputs/apk/debug/app-debug.apk`. Application ID remains `org.navdr.recorder` for development upgrades; no release signing key is included. Core checks can run independently with `./gradlew :navigation:test`.

From the repository root, `node tools/generate_native_parity.cjs` regenerates the synthetic math fixture from the existing browser filter. Regenerate only when deliberately updating the reviewed baseline. It tests port parity, not field accuracy; native policy changes have separate tests.

## First phone session

1. Secure the phone flat, screen up, top edge forward, and confirm the mount checkbox. Use a passenger/operator for collection; do not interact while driving.
2. Enable device location and start while the app is visible. Grant precise location; approximate-only location cannot initialize this build. Notification permission is requested on Android 13+. Denial does not change Android's foreground-service eligibility rules.
3. Begin stationary, then move safely to initialize a fresh GNSS course above 2 m/s. The filter does not invent heading while stationary. Keep the mount unchanged.
4. Inspect paired Hz, sample age and dropped pairs. Test app switching/screen lock, then return. Measure behavior per phone/OEM; a service and wake lock do not establish reliability.
5. Optionally enable the software GNSS mask. Raw capture continues and the screen identifies the test mode.
6. Stop, allow finalization, then open Session history to select a session for export or deletion. Incomplete entries are labeled INCOMPLETE. This updated UI still requires device acceptance testing. Export does not delete private recordings. After transferring needed data, Android app storage controls can clear retained recordings.

## Validity and resource boundaries

- Fixed flat mount, forward vehicle motion, local geography below 85° absolute latitude. Reverse motion, significant grades and handheld use are unsupported.
- Fixes require finite fields, accuracy ≤50 m, speed ≤60 m/s, non-mock provenance, age ≤500 ms, and moving course for initialization. These are development settings, not universal integrity thresholds.
- GNSS-aided mode expires two seconds after the last accepted fix. Rejected/stale fixes do not reset it. After 30 seconds without an accepted fix, position becomes unavailable until fresh moving GNSS reinitializes it.
- An IMU gap >100 ms invalidates the filter. Delivery age >250 ms or a stalled IMU also makes the displayed position unavailable. Recovery requires fresh data and a new usable fix.
- Covariance radius is **uncalibrated**. No independent reference enters the engine and no drift score is displayed.
- Storage is bounded by a 2,048-event writer queue, 250 MiB/session and a 16 MiB free-space floor. Overflow/write failure stops capture. A partial wake lock is bounded to the two-hour capture cap and released on stop/failure. These caps do not establish tested two-hour operation or battery life.
- Local tangent-plane math and conservative delayed-fix variance inflation are not a delayed-state smoother. Initial delayed fixes are propagated at constant speed to the first sample time.

## Recording and browser replay

Native source format is newline-delimited JSON, schema `navdr.events.v1`. The header contains device/API/version, clocks, mount, model/filter identity, capabilities and no-reference provenance. Raw `sensor`/`gnss` rows retain sample and callback arrival time. `satellites` are independent events. `frame` contains causal paired inputs; `navigation` contains the native selected result/validity. The `end` row records completion, event count and stop reason.

From the repository root:

```sh
python3 tools/import_native_session.py path/to/session.jsonl path/to/new-output-directory
python3 tests/native-importer.test.py
```

The importer validates timestamps/counts, rejects fixes in masked frames, splits at >100 ms gaps and 100,000-frame boundaries, and emits browser `navdr.frames.v1` files. It never invents truth. A split may need another moving fix before replay can initialize.

Incomplete sessions are rejected by default. `--allow-incomplete` explicitly salvages a valid prefix, including a final torn line, while preserving `recordingComplete: false`. Interior corruption and event-count mismatches remain errors. Use an empty destination; exports are not overwritten.

Browser replay re-estimates inputs using browser policies. It does **not** reproduce native selected output exactly: native output gating/timing corrections remain in the browser backlog. For native evaluation, use recorded `navigation` rows. Phone GNSS and a software mask do not create independent field truth.

See [native build progress](../../docs/NATIVE_BUILD_PROGRESS.md) for actual verification results and outstanding hardware checks. A passing JVM suite or compiled APK is not a phone test or real-data <10% result.

Platform references: [AGP 8.7 compatibility](https://developer.android.com/build/releases/agp-8-7-0-release-notes), [foreground-service launch rules](https://developer.android.com/develop/background-work/services/fgs/launch), [Android sensors](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview).
