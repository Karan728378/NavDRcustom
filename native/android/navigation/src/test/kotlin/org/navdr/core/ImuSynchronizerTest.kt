package org.navdr.core

import org.junit.Assert.*
import org.junit.Test

class ImuSynchronizerTest {
    private fun sample(ms: Long, value: Double = 0.0) = SensorSample(ms * 1_000_000, Vector3(value, 0.0, 0.0))
    @Test fun waitsForWatermarkAndUsesOnlyPastGyro() {
        val sync = ImuSynchronizer()
        sync.gyroscope(sample(0, 1.0))
        assertTrue(sync.acceleration(sample(5)).isEmpty())
        val frame = sync.gyroscope(sample(10, 999.0)).single()
        assertEquals(1.0, frame.gyro.x, 0.0)
        assertEquals(0L, frame.gyroTimestampNs)
        assertEquals(5_000_000L, frame.timestampNs)
    }
    @Test fun arrivalOrderDoesNotChangeAValidPair() {
        val a = ImuSynchronizer(); val b = ImuSynchronizer()
        a.acceleration(sample(10)); a.gyroscope(sample(5, 2.0))
        b.gyroscope(sample(5, 2.0)); b.acceleration(sample(10))
        assertEquals(a.gyroscope(sample(15, 4.0)), b.gyroscope(sample(15, 4.0)))
    }
    @Test fun dropsStaleMissingAndOutOfOrderSamplesVisibly() {
        val sync = ImuSynchronizer()
        sync.gyroscope(sample(0)); sync.acceleration(sample(40))
        assertTrue(sync.gyroscope(sample(50)).isEmpty())
        sync.acceleration(sample(40)); sync.gyroscope(sample(10))
        assertEquals(3L, sync.dropped)
    }
    @Test fun boundsPendingDataWhenGyroStops() {
        val sync = ImuSynchronizer()
        for (i in 1..10000) sync.acceleration(sample(i.toLong()))
        assertEquals(9968L, sync.dropped)
        val frames = sync.gyroscope(sample(10000))
        assertEquals(1, frames.size) // No interpolation or invented gyro for the other 31.
        assertEquals(9999L, sync.dropped)
    }
}
