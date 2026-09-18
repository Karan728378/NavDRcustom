# Software-tool acceptance commands

Run from the repository root. These are synthetic software checks, not phone or field validation. Exact outputs are retained in `docs/evidence/2026-09-16/`.

```sh
python3 tests/inspector-acceptance.py
node tests/outage-acceptance.cjs
python3 tests/offline-evaluator-acceptance.py
```

Inspect an actual recording after the user collects one:

```sh
python3 tools/inspect_native_session.py /path/to/session.jsonl
```

Exit 0 means structurally accepted (check `status` for complete versus incomplete); malformed data exits 1; inaccessible files exit 2. Reports use milliseconds for intervals/delay/age. Raw gap counts use 1.5 times the requested period as a diagnostic heuristic, not a hardware-loss count. Synchronizer rejection comes from the last recorded cumulative navigation counter; there is no final counter in the existing end event. Pending-at-stop samples, stale-delivery rejections and unpaired raw events must not be conflated with hardware loss. The tool explicitly reports hardware loss as unknown.

Build the real Kotlin runner with JDK 17 and the Android project's configured Gradle environment:

```sh
cd native/android
./gradlew :navigation:test :navigation:installDist :app:assembleDebug :app:lintDebug
cd ../..
python3 tools/replay_native.py /path/to/session.jsonl /path/to/run-1.csv
python3 tools/replay_native.py /path/to/session.jsonl /path/to/run-2.csv
cmp /path/to/run-1.csv /path/to/run-2.csv
python3 tools/evaluate_navigation.py /path/to/run-1.csv --reference /path/to/independent-reference.csv
```

`JAVA_HOME` must reference JDK 17 when launching the runner. Outputs must be new files. The wrapper validates the native journal and creates an allowlisted TSV containing mount, IMU and GNSS only. The JVM runner invokes `NavigationEngine`; it never receives reference data. Paired-frame replay does not reproduce sensor delivery watchdog timing or asynchronous UI/service events. Real-recording parity with selected on-phone output therefore remains untested; the acceptance check here establishes repeatable execution of the core on a synthetic native-format fixture.

The evaluator's reference CSV has `timestampNs,lat,lon`, separate from estimator input. It uses exact timestamp matches and returns null on incomplete-reference/output intervals; it does not invent interpolation or an authenticated PS pass criterion. An analyst must qualify reference uncertainty and timing before interpreting position metrics. Zero-distance intervals remain unscored. The browser scorer retains existing 3-second/5-metre development eligibility limits; these are not authenticated organizer requirements.

## Session-history device acceptance — USER PENDING

The retained `MainActivity.before.kt` source shows the prior latest-only export selection. `session-history-jvm.log` shows a fixture directory's prior latest selection, the new explicit older-file export, and the exact incomplete label used by the Android dialog. This is **not** a before/after phone UI recording.

On the user's phone, create two stopped sessions and one interrupted session. Open **Session history · export / delete**, select the older completed session, export it, and compare the exported header/session ID with that selected entry. Confirm the interrupted entry visibly says **INCOMPLETE** and retains `.partial` on export. Delete one selected session and confirm the others remain. Try cancelling both the export picker and delete confirmation. Report screenshots/recordings and file checks back. Until this is run, UI behavior, SAF export and deletion are **untested on Android**, and the requested end-to-end history acceptance is not complete.

R01 authenticated requirements, R02 physical testing, R07 actual IO-VNBD inventory/pairing, R12 reference collection and final architecture/runtime choices remain with the user. Do not fabricate stand-ins for those tasks.
