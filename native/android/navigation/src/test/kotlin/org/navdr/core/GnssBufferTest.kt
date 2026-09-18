package org.navdr.core

import org.junit.Assert.*
import org.junit.Test

class GnssBufferTest {
    private fun fix(ms: Long) = GnssFix(ms * 1_000_000, GeoPoint(28.0, 77.0), 3.0, 10.0, 0.0)

    @Test fun futureCallbackDoesNotHideEarlierAvailableFix() {
        val buffer = GnssBuffer()
        buffer.offer(fix(1000), 1_000_000_000)
        assertNotNull(buffer.at(1_000_000_000).fix)
        buffer.offer(fix(2000), 2_000_000_000)
        val before = buffer.at(1_990_000_000)
        assertNull(before.fix)
        assertTrue(before.available)
        assertNotNull(buffer.at(2_000_000_000).fix)
    }

    @Test fun expiryAndStaleObservationAreDistinctFromFixCadence() {
        val buffer = GnssBuffer()
        buffer.offer(fix(1000), 1_000_000_000)
        val delayed = buffer.at(1_600_000_000)
        assertTrue(delayed.available)
        assertTrue(delayed.staleFixDiscarded)
        assertNull(delayed.fix)
        assertFalse(buffer.at(3_000_000_001).available)
    }

    @Test fun clearPreventsMaskLeakageAndOldDuplicateReentry() {
        val buffer = GnssBuffer()
        buffer.offer(fix(1000), 1_000_000_000)
        buffer.clear()
        assertFalse(buffer.at(1_000_000_000).available)
        assertFalse(buffer.offer(fix(1000), 1_010_000_000))
        assertTrue(buffer.offer(fix(1100), 1_100_000_000))
        assertNotNull(buffer.at(1_100_000_000).fix)
    }

    @Test fun rejectsFutureMeasurementsAndBoundsPendingQueue() {
        val buffer = GnssBuffer()
        assertFalse(buffer.offer(fix(100), 99_000_000))
        for (i in 1..100) buffer.offer(fix(i.toLong()), i * 1_000_000L)
        assertEquals(84L, buffer.overflows)
        assertEquals(100_000_000L, buffer.at(100_000_000).fix!!.timestampNs)
    }
}
