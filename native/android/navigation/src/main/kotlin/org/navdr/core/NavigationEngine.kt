package org.navdr.core

enum class NavigationMode { WAITING_FOR_COURSE, GNSS_AIDED, DEAD_RECKONING, UNAVAILABLE }

data class NavigationOutput(
    val timestampNs: Long = 0,
    val mode: NavigationMode = NavigationMode.WAITING_FOR_COURSE,
    val position: GeoPoint? = null,
    val speedMps: Double? = null,
    val bearingDegrees: Double? = null,
    val covarianceRadius95M: Double? = null,
    val acceptedFixAgeSeconds: Double? = null,
    val rejectedFixes: Long = 0,
    val discontinuities: Long = 0,
    val reason: String = "Waiting for a moving GNSS fix (>2 m/s) with course",
) {
    val available get() = position != null && mode != NavigationMode.UNAVAILABLE
}

/** Thread-confined classical baseline. No learned weights, reference trajectory, or map input.
 * Fixed flat mount only. The 30 s DR limit is a conservative development boundary, not an accuracy claim.
 */
class NavigationEngine(private val mount: Mount = Mount.flatTopForward()) {
    private var filter: PlanarEkf? = null
    private var lastSample = -1L
    private var lastSeenFix = -1L
    private var lastAcceptedFix = -1L
    private var reinitializeAfterNs = -1L
    private var rejected = 0L
    private var gaps = 0L
    var output = NavigationOutput()
        private set

    fun invalidate(reason: String) {
        filter = null
        lastAcceptedFix = -1
        reinitializeAfterNs = lastSample
        output = NavigationOutput(lastSample.coerceAtLeast(0), NavigationMode.UNAVAILABLE,
            rejectedFixes = rejected, discontinuities = gaps, reason = reason)
    }

    fun step(sample: ImuSample, fix: GnssFix? = null): NavigationOutput {
        require(sample.timestampNs > lastSample) { "IMU timestamps must strictly increase" }
        val dt = if (lastSample < 0) 0.0 else (sample.timestampNs - lastSample) / 1e9
        lastSample = sample.timestampNs
        if (dt > 0.1) { gaps++; invalidate("IMU gap >100 ms; fresh moving GNSS required") }
        // Never resume a stale trajectory by integrating one enormous interval.
        if (dt <= 0.1) filter?.predict(mount.acceleration(sample.accel), mount.yawRate(sample.gyro), dt)

        if (lastAcceptedFix >= 0 && sample.timestampNs - lastAcceptedFix > 30_000_000_000L) {
            invalidate("Outage exceeds the 30 s development limit; fresh GNSS required")
        }
        var fixRejected = false
        if (fix != null) {
            val age = (sample.timestampNs - fix.timestampNs) / 1e9
            val usable = fix.timestampNs > lastSeenFix && age in 0.0..0.5 &&
                fix.accuracyM <= 50 && !fix.isMock && kotlin.math.abs(fix.position.lat) < 85 &&
                (fix.speedMps ?: 0.0) <= 60
            // Future samples are rejected without poisoning the timestamp watermark.
            if (fix.timestampNs <= sample.timestampNs) lastSeenFix = maxOf(lastSeenFix, fix.timestampNs)
            if (!usable) { rejected++; fixRejected = true }
            else if (filter == null) {
                if (fix.timestampNs >= reinitializeAfterNs && fix.bearingDegrees != null && (fix.speedMps ?: 0.0) > 2) {
                    filter = PlanarEkf(fix).apply { if (age > 0) predict(0.0, 0.0, age) }
                    lastAcceptedFix = fix.timestampNs
                }
            } else if (filter!!.observe(fix, age)) lastAcceptedFix = fix.timestampNs
            else { rejected++; fixRejected = true }
        }

        val f = filter
        if (f == null) {
            output = output.copy(timestampNs = sample.timestampNs, rejectedFixes = rejected, discontinuities = gaps,
                reason = if (fixRejected) "GNSS rejected; fresh moving fix required" else output.reason)
            return output
        }
        val age = (sample.timestampNs - lastAcceptedFix) / 1e9
        output = NavigationOutput(sample.timestampNs,
            if (age <= 2.0) NavigationMode.GNSS_AIDED else NavigationMode.DEAD_RECKONING,
            f.position(), f.x[2], (Math.toDegrees(f.x[3]) + 360) % 360, f.radius95(), age,
            rejected, gaps,
            if (fixRejected) "GNSS rejected; continuing from accepted state"
            else if (age > 2) "Fixed-mount inertial estimate; field accuracy unvalidated"
            else "GNSS-aided planar filter; field accuracy unvalidated")
        return output
    }
}
