package org.navdr.core

import java.util.ArrayDeque

data class GnssInput(val fix: GnssFix?, val available: Boolean, val staleFixDiscarded: Boolean)

/** Align asynchronous GNSS callbacks to IMU measurement time. A future queued fix
 * must neither enter a frame nor hide the previously available fix between callbacks.
 */
class GnssBuffer {
    private val pending = ArrayDeque<GnssFix>()
    private var lastReceivedNs = -1L
    private var lastConsumedNs = -1L
    var overflows = 0L
        private set

    fun offer(fix: GnssFix, arrivalNs: Long): Boolean {
        if (fix.timestampNs <= lastReceivedNs || fix.timestampNs > arrivalNs) return false
        lastReceivedNs = fix.timestampNs
        if (pending.size == 16) { pending.removeFirst(); overflows++ }
        pending.addLast(fix)
        return true
    }

    fun at(timestampNs: Long): GnssInput {
        var candidate: GnssFix? = null
        while (pending.isNotEmpty() && pending.first.timestampNs <= timestampNs) candidate = pending.removeFirst()
        candidate?.let { lastConsumedNs = it.timestampNs }
        val stale = candidate != null && timestampNs - candidate.timestampNs > 500_000_000
        return GnssInput(if (stale) null else candidate,
            lastConsumedNs >= 0 && timestampNs - lastConsumedNs in 0..2_000_000_000L, stale)
    }

    /** Mask/provider transitions discard pending fixes without accepting duplicates later. */
    fun clear() { pending.clear(); lastConsumedNs = -1 }
}
