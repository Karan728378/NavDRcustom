package org.navdr.recorder

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import org.navdr.core.SessionCatalog
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.*
import android.view.View
import android.widget.*
import java.io.File
import java.util.Locale

class MainActivity : Activity() {
    private val ui = Handler(Looper.getMainLooper())
    private var service: NavigationService.LocalBinder? = null
    private var bound = false
    private var sessionId = ""
    private var exportFile: File? = null
    private var syncing = false
    private var exporting = false
    private lateinit var status: TextView
    private lateinit var telemetry: TextView
    private lateinit var diagnostics: TextView
    private lateinit var mount: CheckBox
    private lateinit var mask: Switch
    private lateinit var start: Button
    private lateinit var stop: Button
    private lateinit var export: Button
    private lateinit var trajectory: TrajectoryView

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            service = binder as NavigationService.LocalBinder
            render()
        }
        override fun onServiceDisconnected(name: ComponentName) {
            service = null
            status.text = "Session interrupted. A new session must be started explicitly."
            trajectory.update(null, false)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        savedInstanceState?.getString("exportName")?.takeIf { File(it).name == it }?.let {
            exportFile = File(File(filesDir, "recordings"), it)
        }
        val scroll = ScrollView(this).apply { setBackgroundColor(Color.rgb(13, 23, 32)) }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(20), dp(22), dp(24))
        }
        scroll.addView(layout)
        // Target 35 enforces edge-to-edge. Insets keep controls clear of system bars/cutouts.
        scroll.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom); insets
        }
        fun label(text: String, size: Float = 15f, color: Int = Color.rgb(190, 210, 220)): TextView = TextView(this).apply {
            this.text = text; textSize = size; setTextColor(color); setPadding(0, dp(8), 0, dp(8)); layout.addView(this)
        }
        label("NavDR", 32f, Color.rgb(98, 229, 191))
        label("NATIVE NAVIGATION · DEVELOPMENT BUILD", 12f)
        status = label("Connect your phone's sensors to begin.", 18f, Color.WHITE)
        trajectory = TrajectoryView(this)
        layout.addView(trajectory, LinearLayout.LayoutParams(-1, dp(230)))
        telemetry = label("Waiting for a session", 18f, Color.WHITE)
        mount = CheckBox(this).apply {
            text = "Phone is fixed flat, screen up, top edge forward"
            isChecked = savedInstanceState?.getBoolean("mount") ?: false
            setOnCheckedChangeListener { _, _ -> render() }; layout.addView(this)
        }
        label("Start while stationary, then move safely to initialize course. Keep the mount unchanged. This build needs a moving GNSS fix above 2 m/s before estimating a path.", 13f)
        val row = LinearLayout(this)
        start = Button(this).apply { text = "Start session"; setOnClickListener { requestStart() } }
        stop = Button(this).apply { text = "Stop"; setOnClickListener {
            startService(Intent(this@MainActivity, NavigationService::class.java).setAction(NavigationService.ACTION_STOP))
        } }
        row.addView(start, LinearLayout.LayoutParams(0, -2, 1f)); row.addView(stop, LinearLayout.LayoutParams(0, -2, 1f))
        layout.addView(row)
        mask = Switch(this).apply {
            text = "Software GNSS mask · test only"
            setPadding(0, dp(12), 0, dp(12))
            setOnCheckedChangeListener { _, enabled -> if (!syncing) service?.setMask(enabled) }
            layout.addView(this)
        }
        label("The test mask withholds fixes from the estimator. Raw GNSS continues recording. It is not a physical signal outage or independent accuracy reference.", 12f)
        export = Button(this).apply { text = "Session history · export / delete"; setOnClickListener { showHistory() }; layout.addView(this) }
        diagnostics = label("", 13f)
        label("Classical six-state filter · no trained AI model installed\nFixed mount only · 30 s development outage limit\nField accuracy and background reliability are unvalidated.\nRaw recordings stay on this device until you export them.", 12f)
        setContentView(scroll)
        render()
    }

    override fun onStart() {
        super.onStart()
        bound = bindService(Intent(this, NavigationService::class.java), connection, Context.BIND_AUTO_CREATE)
        ui.post(refresh)
    }
    override fun onStop() {
        ui.removeCallbacks(refresh)
        if (bound) { unbindService(connection); bound = false }
        service = null
        super.onStop() // Capture is owned by the foreground service, not this screen.
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("mount", mount.isChecked)
        exportFile?.let { outState.putString("exportName", it.name) }
        super.onSaveInstanceState(outState)
    }
    private val refresh = object : Runnable {
        override fun run() { render(); ui.postDelayed(this, 200) }
    }

    private fun render() {
        if (!::start.isInitialized) return
        val s = service?.state() ?: CaptureSnapshot()
        if (s.sessionId != sessionId) { sessionId = s.sessionId; trajectory.reset() }
        val ageMs = if (s.lastSampleNs > 0) (SystemClock.elapsedRealtimeNanos() - s.lastSampleNs) / 1e6 else null
        val fresh = s.recording && ageMs != null && ageMs in 0.0..250.0
        val o = s.output
        val valid = fresh && o.available
        status.text = when {
            s.finalizing -> "Saving session…"
            s.recording && s.lastSampleNs > 0 && !fresh -> "IMU data stale · position unavailable"
            s.recording -> (if (s.gnssMasked) "TEST MASK · " else "") + o.mode.name.replace('_', ' ') + "\n" + s.message
            else -> s.message
        }
        trajectory.update(if (valid) o.position else null, valid)
        telemetry.text = if (valid) {
            val p = o.position!!
            "${fmt(o.speedMps!! * 3.6, 1)} km/h    ${fmt(o.bearingDegrees!!, 0)}°\n" +
                "${fmt(p.lat, 6)}, ${fmt(p.lon, 6)}\n" +
                "Accepted GNSS age ${fmt(o.acceptedFixAgeSeconds!!, 1)} s\n" +
                "Covariance radius ${fmt(o.covarianceRadius95M!!, 1)} m · uncalibrated"
        } else "Position unavailable\n${s.frames} synchronized IMU frames"
        start.isEnabled = service != null && mount.isChecked && !s.recording && !s.finalizing && !exporting
        stop.isEnabled = s.recording
        mount.isEnabled = !s.recording
        mask.isEnabled = s.recording
        syncing = true; mask.isChecked = s.gnssMasked; syncing = false
        export.isEnabled = service != null && !s.recording && !s.finalizing && !exporting
        val satelliteAge = if (s.satelliteTimeNs > 0) (SystemClock.elapsedRealtimeNanos() - s.satelliteTimeNs) / 1e9 else null
        diagnostics.text = "Session ${s.elapsedSeconds}s · ${fmt(s.sampleRateHz, 1)} Hz paired\n" +
            "Output age ${ageMs?.let { fmt(it, 0) + " ms" } ?: "—"} · dropped pairs ${s.droppedPairs}\n" +
            "Rejected GNSS ${o.rejectedFixes} · IMU gaps ${o.discontinuities}\n" +
            "IRNSS observed ${s.irnssCount} · status age ${satelliteAge?.let { fmt(it, 1) + " s" } ?: "—"}\n\n" + s.capabilities
    }

    private fun requestStart() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION), LOCATION_REQUEST)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_REQUEST)
            return
        }
        begin()
    }
    private fun begin() {
        if (!mount.isChecked) return
        try {
            startForegroundService(Intent(this, NavigationService::class.java).setAction(NavigationService.ACTION_START))
        } catch (e: Exception) { Toast.makeText(this, "Cannot start: ${e.message}", Toast.LENGTH_LONG).show() }
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LOCATION_REQUEST) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) requestStart()
            else Toast.makeText(this, "Precise location is required; approximate location cannot initialize this build.", Toast.LENGTH_LONG).show()
        }
        if (requestCode == NOTIFICATION_REQUEST) begin() // Denial does not prevent an eligible foreground service.
    }

    private fun canManageSessions(): Boolean {
        val state = service?.state() ?: return false
        return !state.recording && !state.finalizing && !exporting
    }
    private fun showHistory() {
        if (!canManageSessions()) return
        val catalog = SessionCatalog(File(filesDir, "recordings"))
        val sessions = catalog.list()
        if (sessions.isEmpty()) { Toast.makeText(this, "No recordings yet", Toast.LENGTH_SHORT).show(); return }
        AlertDialog.Builder(this).setTitle("Session history")
            .setItems(sessions.map { it.label }.toTypedArray()) { _, index ->
                val selected = sessions[index]
                AlertDialog.Builder(this).setTitle(selected.name)
                    .setMessage(if (selected.incomplete) "INCOMPLETE recording. Export preserves the partial data label." else "Completed recording")
                    .setPositiveButton("Export") { _, _ ->
                        if (canManageSessions()) runCatching { chooseExport(catalog.resolve(selected.name)) }
                            .onFailure { Toast.makeText(this, it.message, Toast.LENGTH_LONG).show() }
                    }
                    .setNeutralButton("Delete") { _, _ ->
                        AlertDialog.Builder(this).setTitle("Delete this recording?").setMessage(selected.name)
                            .setNegativeButton("Cancel", null).setPositiveButton("Delete") { _, _ ->
                                if (canManageSessions()) runCatching { catalog.delete(selected.name) }
                                    .onSuccess { showHistory() }
                                    .onFailure { Toast.makeText(this, it.message, Toast.LENGTH_LONG).show() }
                            }.show()
                    }.setNegativeButton("Cancel", null).show()
            }.setNegativeButton("Close", null).show()
    }
    private fun chooseExport(file: File) {
        exportFile = file
        startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/x-ndjson").putExtra(Intent.EXTRA_TITLE, file.name), EXPORT_REQUEST)
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != EXPORT_REQUEST || resultCode != RESULT_OK) return
        val uri = data?.data ?: return
        val file = exportFile ?: run {
            Toast.makeText(this, "Export interrupted; select the recording again.", Toast.LENGTH_LONG).show(); return
        }
        exporting = true; render()
        Thread {
            val result = runCatching {
                check(service?.state()?.recording != true) { "Stop the session before exporting" }
                contentResolver.openOutputStream(uri, "wt").use { output ->
                    checkNotNull(output) { "Cannot open export destination" }
                    file.inputStream().use { it.copyTo(output) }
                }
            }
            ui.post {
                exporting = false
                Toast.makeText(this, result.fold({ "Recording exported${if (file.extension == "partial") " (incomplete session)" else ""}" },
                    { "Export failed: ${it.message}" }), Toast.LENGTH_LONG).show()
                render()
            }
        }.start()
    }
    private fun fmt(value: Double, digits: Int) = String.format(Locale.US, "%.${digits}f", value)
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    companion object { private const val LOCATION_REQUEST = 1; private const val NOTIFICATION_REQUEST = 2; private const val EXPORT_REQUEST = 3 }
}
