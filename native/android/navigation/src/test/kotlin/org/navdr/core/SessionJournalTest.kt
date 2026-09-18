package org.navdr.core

import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class SessionJournalTest {
    @Test fun streamsFinalizesAndRejectsLateWrites() {
        val dir = Files.createTempDirectory("navdr-journal-test").toFile()
        try {
            val journal = SessionJournal(dir, "test", "{\"type\":\"session\"}")
            repeat(100) { assertTrue(journal.append("{\"sequence\":$it}")) }
            journal.close("Stopped \"normally\"\n")
            assertFalse(journal.append("{}"))
            assertTrue(journal.awaitClosed())
            assertNull(journal.failure)
            assertEquals("jsonl", journal.file.extension)
            val lines = journal.file.readLines()
            assertEquals(102, lines.size)
            assertTrue(lines.last().contains("\"complete\":true"))
            assertTrue(lines.last().contains("\\\"normally\\\"\\u000a"))
        } finally { dir.deleteRecursively() }
    }
    @Test fun storageLimitLeavesExplicitIncompleteSession() {
        val dir = Files.createTempDirectory("navdr-journal-limit").toFile()
        try {
            val journal = SessionJournal(dir, "test", "{}", maxBytes = 20)
            journal.append("{\"payload\":\"too much data for this limit\"}")
            journal.close()
            assertTrue(journal.awaitClosed())
            assertNotNull(journal.failure)
            assertEquals("partial", journal.file.extension)
            assertTrue(journal.file.readLines().last().contains("\"complete\":false"))
        } finally { dir.deleteRecursively() }
    }
    @Test(expected = IllegalArgumentException::class) fun preventsSessionPathTraversal() {
        val dir = Files.createTempDirectory("navdr-journal-path").toFile()
        try { SessionJournal(dir, "../elsewhere", "{}") } finally { dir.deleteRecursively() }
    }
}
