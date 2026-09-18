package org.navdr.core
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files

class SessionCatalogTest {
    @Test fun historicalSelectionAndIncompleteLabel() {
        val dir = Files.createTempDirectory("navdr-history").toFile()
        try {
            val old = File(dir,"old.jsonl").apply { writeText("OLDER CONTENT"); setLastModified(1000) }
            File(dir,"new.jsonl").apply { writeText("NEWER CONTENT"); setLastModified(2000) }
            File(dir,"interrupted.partial").apply { writeText("PARTIAL CONTENT"); setLastModified(3000) }
            val catalog = SessionCatalog(dir)
            val before = dir.listFiles()!!.maxBy { it.lastModified() }
            val after = catalog.resolve(old.name)
            assertNotEquals(old.name,before.name)
            val exported = File(dir,"selected-export.txt")
            after.inputStream().use { input -> exported.outputStream().use { input.copyTo(it) } }
            assertEquals("OLDER CONTENT",exported.readText())
            assertTrue(catalog.list().first().label.contains("INCOMPLETE"))
            println("BEFORE latest-only selection: ${before.name}")
            println("AFTER explicit historical export: ${after.name} -> ${exported.readText()}")
            println("UI label supplied by catalog: ${catalog.list().first().label}")
            catalog.delete(old.name);assertFalse(old.exists());assertTrue(File(dir,"new.jsonl").exists())
            assertThrows(IllegalArgumentException::class.java) { catalog.resolve("../other.jsonl") }
        } finally { dir.deleteRecursively() }
    }
}
