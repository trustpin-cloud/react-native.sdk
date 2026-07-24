import Foundation

/// Collects validation/log events from process start and delivers them to the
/// TurboModule's emitters.
///
/// Lifecycle:
/// 1. Native init installs the global listener/sink, which `record(...)` into
///    the bounded ring buffers — enforcement is active before JS exists, so
///    cold-start pin failures land here.
/// 2. The TurboModule attaches its emit closures when it is created.
/// 3. The JS wrapper calls `flush()` once, after its first listener attached:
///    buffered events replay in order, the buffers clear, and every later
///    event is delivered live. Replay happens at most once per process; JS
///    reloads reattach to live delivery only.
///
/// Listener callbacks arrive synchronously from TLS-handshake threads; every
/// path through the hub hops onto one serial queue, keeping callbacks
/// non-blocking and event order total.
final class TrustPinEventHub: @unchecked Sendable {

    static let shared = TrustPinEventHub()

    /// Bounded per stream; oldest events drop first.
    private static let capacity = 32

    private let queue = DispatchQueue(label: "cloud.trustpin.reactnative.events")

    private var validationBuffer: [[String: Any]] = []
    private var logBuffer: [[String: Any]] = []
    private var validationFlushed = false
    private var logFlushed = false

    private var emitValidation: (([String: Any]) -> Void)?
    private var emitLog: (([String: Any]) -> Void)?

    private init() {}

    // MARK: Recording (called by the TrustPinKit listener/sink forwarders)

    func recordValidation(_ event: [String: Any]) {
        queue.async {
            if self.validationFlushed {
                self.emitValidation?(event)
            } else {
                self.append(&self.validationBuffer, event)
            }
        }
    }

    func recordLog(_ event: [String: Any]) {
        queue.async {
            if self.logFlushed {
                self.emitLog?(event)
            } else {
                self.append(&self.logBuffer, event)
            }
        }
    }

    // MARK: TurboModule wiring

    /// Called when the TurboModule instance is created. Closures must be safe
    /// to invoke from the hub's serial queue (the codegen event emitter
    /// callback schedules onto the JS runtime itself).
    func attach(
        emitValidation: @escaping ([String: Any]) -> Void,
        emitLog: @escaping ([String: Any]) -> Void
    ) {
        queue.async {
            self.emitValidation = emitValidation
            self.emitLog = emitLog
        }
    }

    /// Replay triggers, called by the JS wrapper once that stream's listener is
    /// attached. Each stream replays independently: a shared trigger would
    /// drain one backlog while the other stream still had no listener, and
    /// those events would be emitted into the void. Idempotent per stream.
    func flushValidation() {
        queue.async {
            guard !self.validationFlushed else { return }
            self.validationFlushed = true
            self.validationBuffer.forEach { self.emitValidation?($0) }
            self.validationBuffer.removeAll()
        }
    }

    func flushLog() {
        queue.async {
            guard !self.logFlushed else { return }
            self.logFlushed = true
            self.logBuffer.forEach { self.emitLog?($0) }
            self.logBuffer.removeAll()
        }
    }

    private func append(_ buffer: inout [[String: Any]], _ event: [String: Any]) {
        if buffer.count >= Self.capacity {
            buffer.removeFirst()
        }
        buffer.append(event)
    }

    #if DEBUG
    /// Restores the hub to its process-start state so each unit test observes a
    /// clean buffer/flush/emitter set. Mirrors the Kotlin hub's
    /// `resetForTesting()`. Never compiled into release builds.
    func resetForTesting() {
        queue.sync {
            validationBuffer.removeAll()
            logBuffer.removeAll()
            validationFlushed = false
            logFlushed = false
            emitValidation = nil
            emitLog = nil
        }
    }

    /// Drains the serial queue so pending async `record`/`attach`/`flush` work
    /// has completed before a test reads its collectors. A `sync` barrier after
    /// the serial async blocks guarantees they all ran and their writes are
    /// visible to the caller.
    func syncForTesting() {
        queue.sync {}
    }
    #endif
}

enum TrustPinEventKey {
    static let domain = "domain"
    static let code = "code"
    static let level = "level"
    static let message = "message"
    static let timestampMs = "timestampMs"
}

func trustPinNowMs() -> Double {
    (Date().timeIntervalSince1970 * 1000).rounded()
}
