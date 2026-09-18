package org.navdr.recorder

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.*
import android.location.*
import android.os.*
import org.json.JSONArray
import org.json.JSONObject
import org.navdr.core.*
import java.io.File
import java.util.UUID

/** User-started location foreground service. All capture/estimator state is worker-confined. */
class NavigationService : Service(), SensorEventListener, LocationListener {
    private lateinit var sensors: SensorManager
    private lateinit var locations: LocationManager
    private lateinit var workerThread: HandlerThread
    private lateinit var worker: Handler
    private val main = Handler(Looper.getMainLooper())
    private val binder = LocalBinder()
    @Volatile var snapshot = CaptureSnapshot()
        private set
    private var running = false
    private var masked = false
    @Volatile private var journal: SessionJournal? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var engine = NavigationEngine()
    private var synchronizer = ImuSynchronizer()
    private var fixes = GnssBuffer()
    private var sessionStartNs = 0L
    private var firstSampleNs = 0L
    private var lastPublishNs = 0L
    private var frames = 0L
    private var lastOutput = NavigationOutput()

    inner class LocalBinder : Binder() {
        fun state() = snapshot.let { if (it.finalizing && journal?.finished == true) it.copy(finalizing = false) else it }
        fun setMask(enabled: Boolean) { worker.post {
            if (running) {
                masked = enabled; fixes.clear()
                record(JSONObject().put("type", "control").put("timestampNs", now()).put("gnssMasked", masked))
                publish()
            }
        } }
    }

    override fun onCreate() {
        super.onCreate()
        sensors = getSystemService(SensorManager::class.java)
        locations = getSystemService(LocationManager::class.java)
        workerThread = HandlerThread("navdr-acquisition", Process.THREAD_PRIORITY_MORE_FAVORABLE).apply { start() }
        worker = Handler(workerThread.looper)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Navigation sessions", NotificationManager.IMPORTANCE_LOW))
    }

    override fun onBind(intent: Intent): IBinder = binder

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            worker.post { stopCapture("Stopped by user") }
            return START_NOT_STICKY
        }
        if (intent?.action != ACTION_START) { stopSelf(); return START_NOT_STICKY }
        // Called only from a visible Activity after a user action and precise-location permission.
        try {
            check(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                "Precise location permission is required"
            }
            startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            worker.post { startCapture() }
        } catch (e: Exception) {
            snapshot = CaptureSnapshot(message = "Cannot start: ${e.message}")
            stopSelf()
        }
        // A process restart never silently resumes an interrupted recording.
        return START_NOT_STICKY
    }

    private fun notification(): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, NavigationService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_navigation)
            .setContentTitle("NavDR session active").setContentText("Recording sensors and native navigation")
            .setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null, "Stop", stop).build()).build()
    }

    private fun startCapture() {
        if (running || journal?.finished == false) return
        try {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                throw SecurityException("Precise location permission is required")
            }
            check(locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) { "Enable device location/GPS first" }
            val required = listOf(Sensor.TYPE_ACCELEROMETER, Sensor.TYPE_GYROSCOPE)
            val types = required + listOf(Sensor.TYPE_MAGNETIC_FIELD, Sensor.TYPE_ROTATION_VECTOR)
            required.forEach { check(sensors.getDefaultSensor(it) != null) { "Required IMU sensor missing: $it" } }
            engine = NavigationEngine(); synchronizer = ImuSynchronizer(); fixes = GnssBuffer()
            masked = false; frames = 0; firstSampleNs = 0; lastPublishNs = 0; lastOutput = NavigationOutput()
            sessionStartNs = now()
            val id = "navdr-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(8)}"
            val capabilities = JSONArray()
            val labels = mutableListOf<String>()
            for (type in types) {
                val s = sensors.getDefaultSensor(type)
                labels += "${sensorName(type)}: ${if (s == null) "unavailable" else "FIFO ${s.fifoMaxEventCount}, min ${s.minDelay} µs"}"
                capabilities.put(JSONObject().put("type", type).put("available", s != null).apply {
                    if (s != null) put("name", s.name).put("vendor", s.vendor).put("minDelayUs", s.minDelay)
                        .put("fifoMaxEvents", s.fifoMaxEventCount).put("fifoReservedEvents", s.fifoReservedEventCount)
                        .put("resolution", s.resolution.toDouble()).put("maximumRange", s.maximumRange.toDouble())
                        .put("powerMa", s.power.toDouble()).put("wakeUp", s.isWakeUpSensor)
                })
            }
            val header = JSONObject().put("type", "session").put("schema", "navdr.events.v1").put("sessionId", id)
                .put("startedWallTimeMs", System.currentTimeMillis()).put("startedElapsedRealtimeNs", sessionStartNs)
                .put("device", "${Build.MANUFACTURER} ${Build.MODEL}").put("androidApi", Build.VERSION.SDK_INT)
                .put("appVersion", "0.2.0").put("reference", "none").put("model", "none")
                .put("filter", "planar-ekf-six-state-v1").put("requestedImuPeriodUs", 10000)
                .put("maxReportLatencyUs", 20000).put("sensors", capabilities)
                .put("mount", JSONObject().put("up", JSONArray(listOf(0, 0, 1))).put("forward", JSONArray(listOf(0, 1, 0))))
            journal = SessionJournal(File(filesDir, "recordings"), id, header.toString(), onFailure = { message ->
                worker.post { stopCapture(message) }
            })
            snapshot = CaptureSnapshot(recording = true, sessionId = id, capabilities = labels.joinToString("\n"))
            running = true
            wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,
                "NavDR:Capture").apply { setReferenceCounted(false); acquire(MAX_SESSION_MS + 10_000) }
            types.forEach { type ->
                sensors.getDefaultSensor(type)?.let { s ->
                    val ok = sensors.registerListener(this, s, if (type in required) 10000 else 50000, 20000, worker)
                    record(JSONObject().put("type", "registration").put("sensorType", type).put("registered", ok))
                    check(ok || type !in required) { "Cannot register required sensor $type" }
                }
            }
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this, workerThread.looper)
            check(locations.registerGnssStatusCallback(satelliteCallback, worker)) { "Cannot register satellite status" }
            worker.post(healthCheck)
            publish()
        } catch (e: Exception) { stopCapture("Start failed: ${e.message}") }
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!running) return
        try {
            val arrival = now()
            val values = event.values.map { it.toDouble() }
            record(JSONObject().put("type", "sensor").put("sensorType", event.sensor.type)
                .put("timestampNs", event.timestamp).put("arrivalTimestampNs", arrival)
                .put("accuracy", event.accuracy).put("values", JSONArray(values)))
            if (event.sensor.type !in listOf(Sensor.TYPE_ACCELEROMETER, Sensor.TYPE_GYROSCOPE)) return
            if (event.timestamp > arrival || arrival - event.timestamp > 250_000_000) {
                engine.invalidate("Sensor delivery is stale; waiting for fresh data and GNSS")
                lastOutput = engine.output; publish(); return
            }
            val sample = SensorSample(event.timestamp, Vector3(values[0], values[1], values[2]))
            val paired = if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) synchronizer.acceleration(sample)
                else synchronizer.gyroscope(sample)
            for (imu in paired) processFrame(imu)
        } catch (e: Exception) { stopCapture("Sensor processing failed: ${e.message}") }
    }

    private fun processFrame(imu: ImuSample) {
        val input = fixes.at(imu.timestampNs)
        val fix = if (masked) null else input.fix
        if (input.staleFixDiscarded) {
            record(JSONObject().put("type", "warning").put("message", "GNSS delivery >500 ms; observation withheld"))
        }
        lastOutput = engine.step(imu, fix)
        frames++
        if (firstSampleNs == 0L) firstSampleNs = imu.timestampNs
        val frame = JSONObject().put("type", "frame").put("timestampMs", imu.timestampNs / 1e6)
            .put("gyroTimestampNs", imu.gyroTimestampNs).put("accel", vector(imu.accel)).put("gyro", vector(imu.gyro))
            .put("gnssAvailable", !masked && input.available)
            .put("gnssMasked", masked)
        if (fix != null) frame.put("gnss", fixJson(fix)).put("gnssAvailable", true)
        record(frame)
        if (imu.timestampNs - lastPublishNs >= 200_000_000) { lastPublishNs = imu.timestampNs; publish() }
    }

    override fun onLocationChanged(location: Location) {
        if (!running) return
        try {
            val fix = GnssFix(location.elapsedRealtimeNanos, GeoPoint(location.latitude, location.longitude),
                if (location.hasAccuracy()) location.accuracy.toDouble() else Double.POSITIVE_INFINITY,
                if (location.hasSpeed()) location.speed.toDouble() else null,
                if (location.hasBearing()) location.bearing.toDouble() else null,
                if (Build.VERSION.SDK_INT >= 31) location.isMock else location.isFromMockProvider)
            record(JSONObject().put("type", "gnss").put("arrivalTimestampNs", now()).put("fix", fixJson(fix)))
            if (!masked) {
                val before = fixes.overflows
                fixes.offer(fix, now())
                if (fixes.overflows != before) record(JSONObject().put("type", "warning").put("message", "GNSS queue overflow"))
            }
        } catch (e: IllegalArgumentException) {
            record(JSONObject().put("type", "warning").put("message", "Invalid GNSS fix: ${e.message}"))
        }
    }

    private val satelliteCallback = object : GnssStatus.Callback() {
        override fun onSatelliteStatusChanged(status: GnssStatus) {
            if (!running) return
            val satellites = JSONArray(); var irnss = 0
            for (i in 0 until status.satelliteCount) {
                if (status.getConstellationType(i) == GnssStatus.CONSTELLATION_IRNSS) irnss++
                satellites.put(JSONObject().put("svid", status.getSvid(i)).put("constellationType", status.getConstellationType(i))
                    .put("cn0DbHz", status.getCn0DbHz(i).toDouble()).put("usedInFix", status.usedInFix(i))
                    .put("elevationDegrees", status.getElevationDegrees(i).toDouble()))
            }
            val timestamp = now() // GnssStatus offers no independent measurement timestamp.
            record(JSONObject().put("type", "satellites").put("timestampNs", timestamp)
                .put("timestampKind", "callback_elapsed_realtime").put("satellites", satellites))
            snapshot = snapshot.copy(irnssCount = irnss, satelliteTimeNs = timestamp)
        }
        override fun onStopped() {
            if (running) record(JSONObject().put("type", "gnss_stopped").put("timestampNs", now()))
        }
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        if (running) record(JSONObject().put("type", "sensor_accuracy").put("sensorType", sensor.type)
            .put("timestampNs", now()).put("accuracy", accuracy))
    }
    override fun onProviderDisabled(provider: String) {
        if (running) { fixes.clear(); record(JSONObject().put("type", "provider_disabled").put("provider", provider).put("timestampNs", now())) }
    }
    override fun onProviderEnabled(provider: String) {
        if (running) record(JSONObject().put("type", "provider_enabled").put("provider", provider).put("timestampNs", now()))
    }

    private val healthCheck = object : Runnable {
        override fun run() {
            if (!running) return
            if (now() - sessionStartNs >= MAX_SESSION_MS * 1_000_000) { stopCapture("Two-hour capture limit reached"); return }
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                stopCapture("Precise location permission revoked"); return
            }
            if (lastOutput.timestampNs > 0 && now() - lastOutput.timestampNs > 250_000_000) {
                engine.invalidate("IMU stalled; navigation unavailable")
                lastOutput = engine.output
            }
            publish(); worker.postDelayed(this, 1000)
        }
    }

    private fun publish() {
        val span = if (firstSampleNs > 0) (lastOutput.timestampNs - firstSampleNs) / 1e9 else 0.0
        snapshot = snapshot.copy(recording = running, output = lastOutput, frames = frames,
            droppedPairs = synchronizer.dropped, lastSampleNs = lastOutput.timestampNs,
            sampleRateHz = if (span > 0 && frames > 1) (frames - 1) / span else 0.0,
            message = if (running) lastOutput.reason else snapshot.message, gnssMasked = masked,
            elapsedSeconds = if (sessionStartNs > 0) (now() - sessionStartNs) / 1_000_000_000 else 0)
        if (running) record(JSONObject().put("type", "navigation").put("timestampNs", lastOutput.timestampNs)
            .put("mode", lastOutput.mode.name).put("reason", lastOutput.reason)
            .put("position", lastOutput.position?.let { JSONObject().put("lat", it.lat).put("lon", it.lon) } ?: JSONObject.NULL)
            .put("speedMps", lastOutput.speedMps ?: JSONObject.NULL).put("bearingDegrees", lastOutput.bearingDegrees ?: JSONObject.NULL)
            .put("covarianceRadius95M", lastOutput.covarianceRadius95M ?: JSONObject.NULL)
            .put("uncertaintyCalibrated", false).put("rejectedFixes", lastOutput.rejectedFixes)
            .put("discontinuities", lastOutput.discontinuities).put("droppedPairs", synchronizer.dropped))
    }

    private fun stopCapture(reason: String) {
        running = false
        worker.removeCallbacks(healthCheck)
        sensors.unregisterListener(this)
        try { locations.removeUpdates(this); locations.unregisterGnssStatusCallback(satelliteCallback) } catch (_: SecurityException) { }
        wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null
        engine.invalidate(reason); lastOutput = engine.output
        val closing = journal
        closing?.close(reason)
        snapshot = snapshot.copy(recording = false, finalizing = closing?.finished == false,
            output = lastOutput, message = reason)
        // Drain off the UI thread before giving up the service's foreground lifetime.
        if (closing != null) {
            closing.awaitClosed(2000)
            snapshot = snapshot.copy(finalizing = !closing.finished, message = closing.failure ?: reason)
        }
        finishStop(closing)
    }

    private fun finishStop(closing: SessionJournal?) {
        if (closing != null && !closing.finished) {
            worker.postDelayed({ finishStop(closing) }, 250)
            return
        }
        snapshot = snapshot.copy(finalizing = false)
        main.post { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
    }

    override fun onDestroy() {
        worker.post { if (running) stopCapture("Service stopped"); workerThread.quitSafely() }
        super.onDestroy()
    }

    private fun record(event: JSONObject) { journal?.append(event.toString()) }
    private fun vector(v: Vector3) = JSONArray(listOf(v.x, v.y, v.z))
    private fun fixJson(f: GnssFix) = JSONObject().put("timestampMs", f.timestampNs / 1e6)
        .put("lat", f.position.lat).put("lon", f.position.lon).put("accuracy", f.accuracyM)
        .put("isMock", f.isMock).apply { f.speedMps?.let { put("speedMps", it) }; f.bearingDegrees?.let { put("heading", it) } }
    private fun now() = SystemClock.elapsedRealtimeNanos()
    private fun sensorName(type: Int) = when (type) {
        Sensor.TYPE_ACCELEROMETER -> "Accelerometer"; Sensor.TYPE_GYROSCOPE -> "Gyroscope"
        Sensor.TYPE_MAGNETIC_FIELD -> "Magnetometer"; else -> "Rotation vector"
    }
    companion object {
        const val ACTION_START = "org.navdr.START"
        const val ACTION_STOP = "org.navdr.STOP"
        private const val CHANNEL = "navdr_navigation"
        private const val NOTIFICATION_ID = 26_168
        private const val MAX_SESSION_MS = 2L * 60 * 60 * 1000
    }
}
