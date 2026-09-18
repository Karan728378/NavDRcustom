package org.navdr.core

import java.io.File

data class StoredSession(val name: String, val bytes: Long, val modifiedMs: Long, val incomplete: Boolean) {
    val label get() = "$name · ${if (incomplete) "INCOMPLETE" else "Completed"} · $bytes bytes"
}

/** Explicit selection by basename; never chooses the newest file on the caller's behalf. */
class SessionCatalog(private val directory: File) {
    fun list(): List<StoredSession> = directory.listFiles().orEmpty()
        .filter { it.isFile && it.extension in setOf("jsonl", "partial") && it.canonicalFile.parentFile == directory.canonicalFile }
        .map { StoredSession(it.name, it.length(), it.lastModified(), it.extension == "partial") }
        .sortedWith(compareByDescending<StoredSession> { it.modifiedMs }.thenBy { it.name })
    fun resolve(name: String): File {
        require(File(name).name == name && File(name).extension in setOf("jsonl", "partial")) { "Invalid recording name" }
        val file = File(directory, name)
        require(file.isFile && file.canonicalFile.parentFile == directory.canonicalFile) { "Recording no longer available" }
        return file
    }
    fun delete(name: String) { check(resolve(name).delete()) { "Cannot delete recording" } }
}
