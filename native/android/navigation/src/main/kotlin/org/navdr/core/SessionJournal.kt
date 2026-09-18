package org.navdr.core

import java.io.File
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/** Streaming JSON-lines journal. A crash leaves .partial; only a clean drain produces .jsonl.
 * Location payloads stay in the caller's private directory. Queue overflow fails visibly.
 */
class SessionJournal(
    directory: File,
    sessionId: String,
    headerJson: String,
    private val maxBytes: Long = 250L * 1024 * 1024,
    queueCapacity: Int = 2048,
    private val onFailure: (String) -> Unit = {},
) {
    private val queue = ArrayBlockingQueue<String>(queueCapacity)
    private val lock = Any()
    @Volatile private var closing = false
    @Volatile private var closeReason = "Stopped by user"
    @Volatile var failure: String? = null
        private set
    @Volatile var finished = false
        private set
    @Volatile var file: File
        private set
    @Volatile var writtenEvents = 0L
        private set
    private val thread: Thread

    init {
        require(sessionId.matches(Regex("[A-Za-z0-9_-]+")))
        require(headerJson.length < 65536 && !headerJson.contains('\n'))
        require(directory.isDirectory || directory.mkdirs()) { "Cannot create recording directory" }
        file = File(directory, "$sessionId.partial")
        check(file.createNewFile()) { "Session already exists" }
        val stream = file.outputStream().bufferedWriter(Charsets.UTF_8)
        try { stream.write(headerJson); stream.newLine(); stream.flush() }
        catch (e: Exception) { stream.close(); throw e }
        thread = Thread({
            var bytes = headerJson.toByteArray(Charsets.UTF_8).size.toLong() + 1
            var lastFlush = System.nanoTime()
            try {
                stream.use { out ->
                    while (!closing || queue.isNotEmpty()) {
                        val line = queue.poll(250, TimeUnit.MILLISECONDS)
                        if (line != null) {
                            bytes += line.toByteArray(Charsets.UTF_8).size + 1
                            if (bytes > maxBytes || (writtenEvents % 1000 == 0L && directory.usableSpace < 16L * 1024 * 1024)) {
                                fail("Recording storage limit reached")
                                queue.clear()
                                break
                            }
                            out.write(line); out.newLine(); writtenEvents++
                        }
                        if (System.nanoTime() - lastFlush >= 1_000_000_000) {
                            out.flush(); lastFlush = System.nanoTime()
                        }
                    }
                    out.write("{\"type\":\"end\",\"complete\":${failure == null},\"eventCount\":$writtenEvents,\"reason\":${quote(failure ?: closeReason)}}")
                    out.newLine()
                }
                if (failure == null) {
                    val complete = File(directory, "$sessionId.jsonl")
                    if (!file.renameTo(complete)) fail("Cannot finalize recording") else file = complete
                }
            } catch (e: Exception) { fail("Recording write failed: ${e.message}") }
            finally { finished = true }
        }, "navdr-journal").apply { isDaemon = true; start() }
    }

    fun append(json: String): Boolean = synchronized(lock) {
        if (closing) return false
        if (json.length > 65536 || json.contains('\n')) { fail("Invalid journal event"); return false }
        if (!queue.offer(json)) { fail("Recording queue overflow; session incomplete"); return false }
        true
    }

    private fun fail(message: String) {
        val notify = synchronized(lock) {
            if (failure != null) false else { failure = message; closing = true; true }
        }
        if (notify) onFailure(message)
    }

    fun close(reason: String = "Stopped by user") {
        synchronized(lock) { closeReason = reason; closing = true }
    }
    fun awaitClosed(timeoutMs: Long = 2000): Boolean {
        require(timeoutMs in 1..10000) { "Use a bounded join" }
        thread.join(timeoutMs)
        return finished
    }

    private fun quote(value: String): String = buildString {
        append('"')
        value.forEach { c ->
            when (c) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                else -> if (c.code < 32) append("\\u%04x".format(c.code)) else append(c)
            }
        }
        append('"')
    }
}
