package cloud.trustpin.reactnative

/**
 * Collects validation and log events from process start and delivers them to
 * the TurboModule's emitters.
 *
 * Lifecycle:
 * 1. Native init installs the global listener and log sink, which record into
 *    the bounded ring buffers. Enforcement is active before JavaScript exists,
 *    so cold-start pin failures land here rather than being lost.
 * 2. The TurboModule attaches its emit callbacks when it is created.
 * 3. The JavaScript wrapper calls [flush] once, after its first listener has
 *    attached: buffered events replay in order, the buffers clear, and every
 *    later event is delivered live. Replay happens at most once per process;
 *    JavaScript reloads reattach to live delivery only.
 *
 * Listener callbacks arrive synchronously on TLS-handshake threads, so every
 * path through the hub is guarded by one lock and does no blocking work.
 */
internal object TrustPinEventHub {

    /** Bounded per stream; the oldest event is dropped first. */
    private const val CAPACITY = 32

    private val lock = Any()

    private val validationBuffer = ArrayDeque<Map<String, Any?>>()
    private val logBuffer = ArrayDeque<Map<String, Any?>>()
    private var validationFlushed = false
    private var logFlushed = false

    private var emitValidation: ((Map<String, Any?>) -> Unit)? = null
    private var emitLog: ((Map<String, Any?>) -> Unit)? = null

    fun recordValidation(event: Map<String, Any?>) {
        val emit = synchronized(lock) {
            if (!validationFlushed) {
                append(validationBuffer, event)
                return
            }
            emitValidation
        }
        emit?.invoke(event)
    }

    fun recordLog(event: Map<String, Any?>) {
        val emit = synchronized(lock) {
            if (!logFlushed) {
                append(logBuffer, event)
                return
            }
            emitLog
        }
        emit?.invoke(event)
    }

    /**
     * Called when the TurboModule instance is created. A later instance (after
     * a JavaScript reload) replaces the previous callbacks.
     */
    fun attach(
        emitValidation: (Map<String, Any?>) -> Unit,
        emitLog: (Map<String, Any?>) -> Unit,
    ) {
        synchronized(lock) {
            this.emitValidation = emitValidation
            this.emitLog = emitLog
        }
    }

    /**
     * Replay triggers, called once that stream's JavaScript listener is
     * attached. Each stream replays independently: a shared trigger would drain
     * one backlog while the other stream still had no listener, and those
     * events would be emitted into the void. Idempotent per stream.
     */
    fun flushValidation() {
        val pending: List<Map<String, Any?>>
        val emit: ((Map<String, Any?>) -> Unit)?
        synchronized(lock) {
            if (validationFlushed) return
            validationFlushed = true
            pending = validationBuffer.toList()
            emit = emitValidation
            validationBuffer.clear()
        }
        pending.forEach { emit?.invoke(it) }
    }

    fun flushLog() {
        val pending: List<Map<String, Any?>>
        val emit: ((Map<String, Any?>) -> Unit)?
        synchronized(lock) {
            if (logFlushed) return
            logFlushed = true
            pending = logBuffer.toList()
            emit = emitLog
            logBuffer.clear()
        }
        pending.forEach { emit?.invoke(it) }
    }

    /** Test hook: restores the pre-init state so cases stay independent. */
    internal fun resetForTesting() {
        synchronized(lock) {
            validationBuffer.clear()
            logBuffer.clear()
            validationFlushed = false
            logFlushed = false
            emitValidation = null
            emitLog = null
        }
    }

    private fun append(buffer: ArrayDeque<Map<String, Any?>>, event: Map<String, Any?>) {
        if (buffer.size >= CAPACITY) {
            buffer.removeFirst()
        }
        buffer.addLast(event)
    }
}

internal object EventKey {
    const val DOMAIN = "domain"
    const val CODE = "code"
    const val LEVEL = "level"
    const val MESSAGE = "message"
    const val TIMESTAMP_MS = "timestampMs"
}
