package org.navdr.recorder

import org.navdr.core.NavigationOutput

/** Immutable, bounded UI snapshot; raw streams never cross the UI thread. */
data class CaptureSnapshot(
    val recording: Boolean = false,
    val finalizing: Boolean = false,
    val sessionId: String = "",
    val message: String = "Ready to start a fixed-mount session",
    val output: NavigationOutput = NavigationOutput(),
    val frames: Long = 0,
    val droppedPairs: Long = 0,
    val sampleRateHz: Double = 0.0,
    val lastSampleNs: Long = 0,
    val irnssCount: Int = 0,
    val satelliteTimeNs: Long = 0,
    val capabilities: String = "Sensor capabilities will be measured at start",
    val gnssMasked: Boolean = false,
    val elapsedSeconds: Long = 0,
)
