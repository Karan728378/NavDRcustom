package org.navdr.core

import java.util.ArrayDeque

/** Bounded causal zero-order hold, not interpolation. Sensor callbacks may interleave.
 * Wait for the gyro watermark to reach each accelerometer timestamp; never use future gyro.
 */
class ImuSynchronizer {
    private val accelerometers = ArrayDeque<SensorSample>()
    private val gyroscopes = ArrayDeque<SensorSample>()
    private var lastAccel = -1L
    private var lastGyro = -1L
    var dropped = 0L
        private set

    fun acceleration(sample: SensorSample): List<ImuSample> {
        if (sample.timestampNs <= lastAccel) { dropped++; return emptyList() }
        lastAccel = sample.timestampNs
        accelerometers.addLast(sample)
        if (accelerometers.size > 32) { accelerometers.removeFirst(); dropped++ }
        return drain()
    }

    fun gyroscope(sample: SensorSample): List<ImuSample> {
        if (sample.timestampNs <= lastGyro) { dropped++; return emptyList() }
        lastGyro = sample.timestampNs
        gyroscopes.addLast(sample)
        if (gyroscopes.size > 64) gyroscopes.removeFirst()
        return drain()
    }

    private fun drain(): List<ImuSample> {
        val result = mutableListOf<ImuSample>()
        while (accelerometers.isNotEmpty() && lastGyro >= accelerometers.first.timestampNs) {
            val a = accelerometers.removeFirst()
            while (gyroscopes.size > 1 && gyroscopes.elementAt(1).timestampNs <= a.timestampNs) {
                gyroscopes.removeFirst()
            }
            val g = gyroscopes.peekFirst()
            if (g == null || g.timestampNs > a.timestampNs || a.timestampNs - g.timestampNs > 30_000_000) {
                dropped++
            } else result.add(ImuSample(a.timestampNs, a.value, g.value, g.timestampNs))
        }
        return result
    }
}
