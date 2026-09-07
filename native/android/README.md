# NavDR native recorder

Foreground Android application, Java 17, Android API 30+, compile/target SDK 35, Android Gradle Plugin 8.7.3. Open this directory as a project in Android Studio, use Gradle 8.9 and a local SDK with platform/build-tools 35, then build `:app:assembleDebug`. No native SDK or Gradle installation is bundled with this repository.

1. Fix the phone flat, screen up, top edge pointing forward. Keep this orientation throughout the trip.
2. Start a new recording and grant precise location. IMU sampling requests 100 Hz; actual sensor timestamps determine replay dt.
3. Check GNSS lock and IRNSS count. Zero IRNSS means none observed, not simulated support.
4. Stop and export JSON through Android's document picker. Import this file into NavDR.

Records accelerometer including gravity, gyro, fresh location fixes, per-satellite C/N₀, used-in-fix flags and constellation types. Accelerometer samples with a gyro more than 100 ms away are discarded. GNSS expires after two seconds. Navigation is calculated by the shared browser replay core after import; the Android application is a recorder, not a background navigation service. Recording stops on leaving the foreground and at 200,000 samples.

No GNSS field is copied into an independent reference field. C/N₀ degradation monitoring runs in the shared JavaScript pipeline and is visible during replay. This is a native monitoring/data path, not proof of a proactive NavIC handoff on hardware.

Validation status: source reviewed, but APK compilation and device testing remain unverified because this workspace has no Android SDK, Gradle or connected Android device. Do not present this source project as a tested APK. Real GNSS permission denial, sensor cadence, IRNSS availability and export must be checked on the target device.
