package org.navdr.core

import org.junit.Assert.*
import org.junit.Test

class BrowserParityTest {
    @Test fun matchesBrowserStateAndFullCovarianceOnReviewedFixture() {
        val filter = PlanarEkf(GnssFix(0, GeoPoint(28.0, 77.0), 3.0, 10.0, 0.0))
        val lines = javaClass.getResourceAsStream("/browser-planar-parity.csv")!!.bufferedReader().use { it.readLines() }
        for (line in lines.drop(1)) {
            val v = line.split(',').map(String::toDouble)
            filter.predict(v[1], v[2], 0.01)
            if (v[3] == 1.0) assertTrue(filter.observe(GnssFix((v[0] * 1e6).toLong(), GeoPoint(v[4], v[5]), v[8], v[6], v[7]), 0.0))
            for (i in 0..5) assertEquals("state $i at ${v[0]} ms", v[9 + i], filter.x[i], 1e-9)
            for (i in 0..5) for (j in 0..5) assertEquals("P$i$j at ${v[0]} ms", v[15 + i * 6 + j], filter.covariance[i][j], 1e-9)
        }
    }
}
