package org.navdr.cli

import org.navdr.core.*
import java.io.File

/** Strict estimator-only wire format. No reference/truth fields exist in this interface. */
fun main(args: Array<String>) {
    require(args.size == 2) { "Usage: navigation inputs.tsv outputs.csv" }
    val target = File(args[1]); require(!target.exists()) { "Output already exists" }
    File(args[0]).bufferedReader().use { input ->
        val mount = input.readLine().split('\t')
        require(mount.size == 7 && mount[0] == "navdr.estimator.v1") { "Invalid input header" }
        val m = mount.drop(1).map(String::toDouble)
        val engine = NavigationEngine(Mount(Vector3(m[0],m[1],m[2]),Vector3(m[3],m[4],m[5])))
        val temporary = File(target.parentFile, target.name + ".partial")
        require(temporary.createNewFile()) { "Partial output already exists" }
        try {
            temporary.bufferedWriter().use { out ->
                out.write("timestampNs,gnssAvailable,mode,lat,lon,speedMps,bearingDegrees,covarianceRadius95M,acceptedFixAgeSeconds,rejectedFixes,discontinuities\n")
                input.lineSequence().forEach { line ->
                    val f = line.split('\t'); require(f.size == 17) { "Expected exactly 17 estimator fields" }
                    require(f[8] in listOf("true","false") && f[9] in listOf("true","false"))
                    val fix = if (f[9] == "true") {
                        require(f[8] == "true" && f[16] in listOf("true","false"))
                        GnssFix(f[10].toLong(), GeoPoint(f[11].toDouble(),f[12].toDouble()),f[13].toDouble(),
                            f[14].takeUnless { it == "null" }?.toDouble(), f[15].takeUnless { it == "null" }?.toDouble(),f[16].toBoolean())
                    } else { require(f.drop(10).all { it == "null" }); null }
                    val sample = ImuSample(f[0].toLong(),Vector3(f[2].toDouble(),f[3].toDouble(),f[4].toDouble()),
                        Vector3(f[5].toDouble(),f[6].toDouble(),f[7].toDouble()),f[1].toLong())
                    val o = engine.step(sample,fix)
                    out.write(listOf(o.timestampNs,f[8],o.mode,o.position?.lat,o.position?.lon,o.speedMps,
                        o.bearingDegrees,o.covarianceRadius95M,o.acceptedFixAgeSeconds,o.rejectedFixes,o.discontinuities)
                        .joinToString(",") { it?.toString() ?: "null" } + "\n")
                }
            }
            check(temporary.renameTo(target)) { "Cannot publish replay output" }
        } catch (e: Exception) { temporary.delete(); throw e }
    }
}
