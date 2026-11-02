package cloud.trustpin.reactnative.attest

/**
 * Delivers the attestation module's state changes, events and logs to the
 * TurboModule's emitters.
 *
 * Events and logs from before JavaScript exists (the native init helper runs
 * in `Application.onCreate()`) wait in bounded buffers and replay once to the
 * first JavaScript listener of each stream, as in `@trustpin/react-native`.
 * State changes are live only: JavaScript reads the current state when it
 * subscribes.
 */
internal object AttestEventHub {

    private const val CAPACITY = 32

    private val lock = Any()

    private val eventBuffer = ArrayDeque<Map<String, Any?>>()
    private val logBuffer = ArrayDeque<Map<String, Any?>>()
    private var eventsFlushed = false
    private var logsFlushed = false

    private var emitState: ((Map<String, Any?>) -> Unit)? = null
    private var emitEvent: ((Map<String, Any?>) -> Unit)? = null
    private var emitLog: ((Map<String, Any?>) -> Unit)? = null

    fun recordState(state: Map<String, Any?>) {
        val emit = synchronized(lock) { emitState }
        emit?.invoke(state)
    }

    fun recordEvent(event: Map<String, Any?>) {
        val emit = synchronized(lock) {
            if (!eventsFlushed) {
                append(eventBuffer, event)
                return
            }
            emitEvent
        }
        emit?.invoke(event)
    }

    fun recordLog(log: Map<String, Any?>) {
        val emit = synchronized(lock) {
            if (!logsFlushed) {
                append(logBuffer, log)
                return
            }
            emitLog
        }
        emit?.invoke(log)
    }

    /** Called when the TurboModule is created; a reload replaces the callbacks. */
    fun attach(
        emitState: (Map<String, Any?>) -> Unit,
        emitEvent: (Map<String, Any?>) -> Unit,
        emitLog: (Map<String, Any?>) -> Unit,
    ) {
        synchronized(lock) {
            this.emitState = emitState
            this.emitEvent = emitEvent
            this.emitLog = emitLog
        }
    }

    fun flushEvents() = flush(eventBuffer, { eventsFlushed }, { eventsFlushed = true }, { emitEvent })

    fun flushLogs() = flush(logBuffer, { logsFlushed }, { logsFlushed = true }, { emitLog })

    private fun flush(
        buffer: ArrayDeque<Map<String, Any?>>,
        flushed: () -> Boolean,
        markFlushed: () -> Unit,
        emitter: () -> ((Map<String, Any?>) -> Unit)?,
    ) {
        val pending: List<Map<String, Any?>>
        val emit: ((Map<String, Any?>) -> Unit)?
        synchronized(lock) {
            if (flushed()) return
            markFlushed()
            pending = buffer.toList()
            emit = emitter()
            buffer.clear()
        }
        pending.forEach { emit?.invoke(it) }
    }

    private fun append(buffer: ArrayDeque<Map<String, Any?>>, entry: Map<String, Any?>) {
        if (buffer.size >= CAPACITY) buffer.removeFirst()
        buffer.addLast(entry)
    }

    internal fun resetForTesting() {
        synchronized(lock) {
            eventBuffer.clear()
            logBuffer.clear()
            eventsFlushed = false
            logsFlushed = false
            emitState = null
            emitEvent = null
            emitLog = null
        }
    }
}
