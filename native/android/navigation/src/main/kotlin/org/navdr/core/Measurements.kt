package org.navdr.core

import kotlin.math.*

/** All sample times use Android elapsedRealtimeNanos, never wall time or callback time. */
data class Vector3(val x: Double, val y: Double, val z: Double) {
    init { require(listOf(x, y, z).all { it.isFinite() }) { "Non-finite sensor value" } }
    operator fun minus(v: Vector3) = Vector3(x - v.x, y - v.y, z - v.z)
    operator fun times(s: Double) = Vector3(x * s, y * s, z * s)
    fun dot(v: Vector3) = x * v.x + y * v.y + z * v.z
    fun norm() = sqrt(dot(this))
    fun unit(): Vector3 { require(norm() > 1e-8) { "Degenerate mount axis" }; return this * (1 / norm()) }
}

data class SensorSample(val timestampNs: Long, val value: Vector3) {
    init { require(timestampNs >= 0) }
}

data class ImuSample(val timestampNs: Long, val accel: Vector3, val gyro: Vector3, val gyroTimestampNs: Long) {
    init {
        require(timestampNs >= 0 && gyroTimestampNs in 0..timestampNs)
        require(timestampNs - gyroTimestampNs <= 30_000_000) { "Gyro is stale" }
    }
}

data class GeoPoint(val lat: Double, val lon: Double) {
    init { require(lat.isFinite() && lon.isFinite() && abs(lat) <= 90 && abs(lon) <= 180) }
}

data class GnssFix(
    val timestampNs: Long,
    val position: GeoPoint,
    val accuracyM: Double,
    val speedMps: Double? = null,
    val bearingDegrees: Double? = null,
    val isMock: Boolean = false,
) {
    init {
        require(timestampNs >= 0 && accuracyM.isFinite() && accuracyM > 0)
        require(speedMps == null || (speedMps.isFinite() && speedMps >= 0))
        require(bearingDegrees == null || (bearingDegrees.isFinite() && bearingDegrees in 0.0..360.0))
    }
}

/** Explicit fixed mount. Gravity cannot identify forward yaw. */
class Mount(up: Vector3, forward: Vector3) {
    val up = up.unit()
    val forward = (forward - this.up * forward.dot(this.up)).unit()
    fun acceleration(a: Vector3) = (a - up * 9.80665).dot(forward)
    fun yawRate(g: Vector3) = -g.dot(up) // geographic bearing increases clockwise
    companion object { fun flatTopForward() = Mount(Vector3(0.0, 0.0, 1.0), Vector3(0.0, 1.0, 0.0)) }
}

internal const val EARTH_RADIUS_M = 6371000.0
internal fun local(p: GeoPoint, origin: GeoPoint) = doubleArrayOf(
    Math.toRadians(p.lat - origin.lat) * EARTH_RADIUS_M,
    Math.toRadians(p.lon - origin.lon) * EARTH_RADIUS_M * cos(Math.toRadians(origin.lat)),
)
internal fun geographic(north: Double, east: Double, origin: GeoPoint) = GeoPoint(
    origin.lat + Math.toDegrees(north / EARTH_RADIUS_M),
    origin.lon + Math.toDegrees(east / (EARTH_RADIUS_M * cos(Math.toRadians(origin.lat)))),
)
internal fun wrap(radians: Double) = atan2(sin(radians), cos(radians))
