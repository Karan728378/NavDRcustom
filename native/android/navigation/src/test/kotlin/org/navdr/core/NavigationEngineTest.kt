package org.navdr.core

import org.junit.Assert.*
import org.junit.Test

class NavigationEngineTest {
    private val base = 1_000_000_000L
    private fun imu(ms: Long, acceleration: Double = 0.0, yaw: Double = 0.0) =
        ImuSample(base + ms * 1_000_000, Vector3(0.0, acceleration, 9.80665), Vector3(0.0, 0.0, -yaw), base + ms * 1_000_000)
    private fun fix(ms: Long, north: Double = 0.0, speed: Double = 10.0, heading: Double? = 0.0) =
        GnssFix(base + ms * 1_000_000, geographic(north, 0.0, GeoPoint(28.0, 77.0)), 3.0, speed, heading)

    @Test fun requiresMovingCourseRatherThanInventingNorth() {
        val engine = NavigationEngine()
        assertFalse(engine.step(imu(0), fix(0, speed = 0.0, heading = null)).available)
        assertFalse(engine.step(imu(10), fix(10, heading = null)).available)
        assertTrue(engine.step(imu(20), fix(20, heading = 90.0)).available)
        assertEquals(90.0, engine.output.bearingDegrees!!, 1e-9)
    }

    @Test fun integratesTenSecondOutageWithoutReferenceOrNetwork() {
        val engine = NavigationEngine()
        engine.step(imu(0), fix(0))
        for (i in 1..1000) engine.step(imu(i * 10L))
        val result = engine.output
        assertEquals(NavigationMode.DEAD_RECKONING, result.mode)
        assertEquals(100.0, local(result.position!!, GeoPoint(28.0, 77.0))[0], 1e-5)
        assertEquals(10.0, result.speedMps!!, 1e-9)
        assertTrue(result.covarianceRadius95M!! > 3.0)
    }

    @Test fun rejectedOutlierDoesNotTeleportSelectedOutputOrResetOutageAge() {
        val engine = NavigationEngine()
        engine.step(imu(0), fix(0))
        val result = engine.step(imu(10), fix(10, north = 1000.0))
        assertEquals(1L, result.rejectedFixes)
        assertEquals(0.1, local(result.position!!, GeoPoint(28.0, 77.0))[0], 1e-5)
        assertEquals(0.01, result.acceptedFixAgeSeconds!!, 1e-9)
    }

    @Test fun acceptedPositionIsFilteredRatherThanBypassingCovarianceUpdate() {
        val engine = NavigationEngine()
        engine.step(imu(0), fix(0))
        val result = engine.step(imu(10), fix(10, north = 2.0))
        val north = local(result.position!!, GeoPoint(28.0, 77.0))[0]
        assertTrue(north > 0.1 && north < 2.0)
        assertEquals(0L, result.rejectedFixes)
    }

    @Test fun staleFutureDuplicateAndMockFixesCannotInitialize() {
        val engine = NavigationEngine()
        assertFalse(engine.step(imu(1000), fix(0)).available)
        assertFalse(engine.step(imu(1010), fix(2000)).available)
        assertFalse(engine.step(imu(1020), fix(1020).copy(isMock = true)).available)
        assertFalse(engine.step(imu(1030), fix(1020)).available)
        // Future timestamp rejection must not poison acceptance of the next real fix.
        assertTrue(engine.step(imu(1040), fix(1040)).available)
        assertEquals(4L, engine.output.rejectedFixes)
    }

    @Test fun sensorGapInvalidatesUntilFreshMovingFix() {
        val engine = NavigationEngine()
        engine.step(imu(0), fix(0))
        assertFalse(engine.step(imu(200)).available)
        assertEquals(1L, engine.output.discontinuities)
        assertFalse(engine.step(imu(210)).available)
        assertTrue(engine.step(imu(220), fix(220, north = 50.0)).available)
    }

    @Test fun aQueuedPreGapFixCannotReinitializeAnInvalidTrajectory() {
        val engine = NavigationEngine()
        engine.step(imu(0), fix(0))
        assertFalse(engine.step(imu(200), fix(100, north = 1.0)).available)
        assertTrue(engine.step(imu(210), fix(210, north = 2.1)).available)
    }

    @Test fun delayedInitializationPropagatesToMeasurementTime() {
        val engine = NavigationEngine()
        val result = engine.step(imu(100), fix(0))
        assertTrue(result.available)
        assertEquals(1.0, local(result.position!!, GeoPoint(28.0, 77.0))[0], 1e-5)
        assertEquals(0.1, result.acceptedFixAgeSeconds!!, 1e-9)
    }

    @Test fun expiresLongOutageAndCanReinitializeAtNewOrigin() {
        val engine = NavigationEngine()
        engine.step(imu(0), fix(0))
        for (i in 1..3001) engine.step(imu(i * 10L))
        assertFalse(engine.output.available)
        assertNull(engine.output.position)
        assertTrue(engine.output.reason.contains("30 s"))
        val recovered = engine.step(imu(30020), fix(30020, north = 500.0))
        assertTrue(recovered.available)
        assertEquals(500.0, local(recovered.position!!, GeoPoint(28.0, 77.0))[0], 1e-5)
    }

    @Test(expected = IllegalArgumentException::class) fun rejectsDuplicateImuTime() {
        val engine = NavigationEngine(); engine.step(imu(0)); engine.step(imu(0))
    }

    @Test fun mountTransformsGravityAndClockwiseYaw() {
        val flat = Mount.flatTopForward()
        assertEquals(2.0, flat.acceleration(Vector3(0.0, 2.0, 9.80665)), 1e-9)
        assertEquals(0.2, flat.yawRate(Vector3(0.0, 0.0, -0.2)), 1e-9)
        val side = Mount(Vector3(1.0, 0.0, 0.0), Vector3(0.0, 1.0, 0.0))
        assertEquals(2.0, side.acceleration(Vector3(9.80665, 2.0, 0.0)), 1e-9)
        assertEquals(0.2, side.yawRate(Vector3(-0.2, 0.0, 0.0)), 1e-9)
    }

    @Test fun josephCovarianceRemainsSymmetricPositiveUnderRepeatedUpdates() {
        val f = PlanarEkf(fix(0))
        for (i in 1..1000) {
            f.predict(0.0, 0.0, 0.01)
            if (i % 100 == 0) assertTrue(f.observe(fix(i * 10L, north = i * 0.1), 0.0))
            val p = f.covariance
            for (r in 0..5) {
                assertTrue(p[r][r].isFinite() && p[r][r] > 0)
                for (c in 0..5) assertEquals(p[r][c], p[c][r], 1e-10)
            }
            // Cholesky decomposition checks positive definiteness beyond positive diagonals.
            val l = Array(6) { DoubleArray(6) }
            for (r in 0..5) for (c in 0..r) {
                val v = p[r][c] - (0 until c).sumOf { l[r][it] * l[c][it] }
                if (r == c) { assertTrue(v > 0); l[r][c] = kotlin.math.sqrt(v) }
                else l[r][c] = v / l[c][c]
            }
        }
    }
}
