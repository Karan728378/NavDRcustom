package org.navdr.core

import kotlin.math.*

/** Six-state [north, east, forward speed, heading, acceleration bias, yaw bias].
 * Port of the reviewed browser baseline, with one consistently filtered output policy.
 * Process noise is an engineering default. Covariance is not calibrated field accuracy.
 */
internal class PlanarEkf(fix: GnssFix) {
    val origin = fix.position
    var x = doubleArrayOf(0.0, 0.0, fix.speedMps!!, Math.toRadians(fix.bearingDegrees!!), 0.0, 0.0)
        private set
    var covariance = identity()
        private set

    init {
        val diagonals = doubleArrayOf(fix.accuracyM.pow(2), fix.accuracyM.pow(2), 4.0, 0.25, 0.04, 0.0025)
        diagonals.forEachIndexed { i, v -> covariance[i][i] = v }
    }

    fun predict(acceleration: Double, yawRate: Double, dt: Double) {
        val v = x[2]; val h = x[3]; val c = cos(h); val s = sin(h)
        val f = identity()
        f[0][2] = c * dt; f[0][3] = -v * s * dt
        f[1][2] = s * dt; f[1][3] = v * c * dt
        f[2][4] = -dt; f[3][5] = -dt
        x = doubleArrayOf(x[0] + v * c * dt, x[1] + v * s * dt,
            (v + (acceleration - x[4]) * dt).coerceIn(0.0, 60.0),
            wrap(h + (yawRate - x[5]) * dt), x[4], x[5])
        covariance = multiply(multiply(f, covariance), transpose(f))
        doubleArrayOf(0.02, 0.02, 0.6, 0.003, 0.0001, 0.00001).forEachIndexed { i, q ->
            covariance[i][i] += q * dt
        }
    }

    fun observe(fix: GnssFix, ageSeconds: Double): Boolean {
        val z = local(fix.position, origin)
        // No delayed-state smoother yet: conservatively include motion over measurement age.
        val r = max(1.0, fix.accuracyM).pow(2) + (max(x[2], fix.speedMps ?: 0.0) * ageSeconds).pow(2)
        val dn = z[0] - x[0]; val de = z[1] - x[1]
        val a = covariance[0][0] + r; val b = covariance[0][1]; val c = covariance[1][1] + r
        val determinant = a * c - b * b
        val innovation = (c * dn * dn - 2 * b * dn * de + a * de * de) / determinant
        if (!innovation.isFinite() || determinant <= 0 || innovation > 9.21034) return false
        scalar(z[0], 0, r); scalar(z[1], 1, r)
        fix.speedMps?.let { scalar(it, 2, 1.0, gate = 9.0) }
        if (fix.bearingDegrees != null && (fix.speedMps ?: 0.0) > 2.0) {
            scalar(Math.toRadians(fix.bearingDegrees), 3, 0.03, angle = true, gate = 9.0)
        }
        return true
    }

    private fun scalar(z: Double, index: Int, variance: Double, angle: Boolean = false, gate: Double = Double.POSITIVE_INFINITY) {
        val s = covariance[index][index] + variance
        val residual = if (angle) wrap(z - x[index]) else z - x[index]
        if (residual * residual / s > gate) return
        val k = DoubleArray(6) { covariance[it][index] / s }
        for (i in 0..5) x[i] += k[i] * residual
        x[2] = x[2].coerceIn(0.0, 60.0); x[3] = wrap(x[3])
        val a = identity()
        for (i in 0..5) a[i][index] -= k[i]
        val updated = multiply(multiply(a, covariance), transpose(a))
        for (i in 0..5) for (j in 0..5) updated[i][j] += k[i] * k[j] * variance
        // Joseph update plus explicit symmetrization to limit floating-point asymmetry.
        covariance = Array(6) { i -> DoubleArray(6) { j -> (updated[i][j] + updated[j][i]) / 2 } }
    }

    fun position() = geographic(x[0], x[1], origin)
    fun radius95(): Double {
        val a = covariance[0][0]; val b = covariance[0][1]; val c = covariance[1][1]
        return sqrt(max(0.0, 5.991 * (a + c + sqrt((a - c).pow(2) + 4 * b * b)) / 2))
    }

    private fun identity() = Array(6) { i -> DoubleArray(6) { j -> if (i == j) 1.0 else 0.0 } }
    private fun transpose(a: Array<DoubleArray>) = Array(6) { i -> DoubleArray(6) { j -> a[j][i] } }
    private fun multiply(a: Array<DoubleArray>, b: Array<DoubleArray>) = Array(6) { i ->
        DoubleArray(6) { j -> (0..5).sumOf { k -> a[i][k] * b[k][j] } }
    }
}
