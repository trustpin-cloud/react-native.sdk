import Foundation

/// Delivers the attestation module's state changes, events and logs to the
/// TurboModule's emitters.
///
/// Events and logs from before JavaScript exists (the native init helper runs
/// at launch) wait in bounded buffers and replay once to the first JavaScript
/// listener of each stream, as in `@trustpin/react-native`. State changes are
/// live only: JavaScript reads the current state when it subscribes.
///
/// Native listeners call from background threads; every path hops onto one
/// serial queue, keeping callbacks non-blocking and order total.
final class TrustPinAttestEventHub: @unchecked Sendable {

    static let shared = TrustPinAttestEventHub()

    /// Bounded per stream; oldest entries drop first.
    private static let capacity = 32

    private let queue = DispatchQueue(label: "cloud.trustpin.reactnative.attest.events")

    private var eventBuffer: [[String: Any]] = []
    private var logBuffer: [[String: Any]] = []
    private var eventsFlushed = false
    private var logsFlushed = false

    private var emitState: (([String: Any]) -> Void)?
    private var emitEvent: (([String: Any]) -> Void)?
    private var emitLog: (([String: Any]) -> Void)?

    private init() {}

    func recordState(_ state: [String: Any]) {
        queue.async { self.emitState?(state) }
    }

    func recordEvent(_ event: [String: Any]) {
        queue.async {
            if self.eventsFlushed {
                self.emitEvent?(event)
            } else {
                self.append(&self.eventBuffer, event)
            }
        }
    }

    func recordLog(_ log: [String: Any]) {
        queue.async {
            if self.logsFlushed {
                self.emitLog?(log)
            } else {
                self.append(&self.logBuffer, log)
            }
        }
    }

    /// Called when the TurboModule is created; a reload replaces the closures.
    func attach(
        emitState: @escaping ([String: Any]) -> Void,
        emitEvent: @escaping ([String: Any]) -> Void,
        emitLog: @escaping ([String: Any]) -> Void
    ) {
        queue.async {
            self.emitState = emitState
            self.emitEvent = emitEvent
            self.emitLog = emitLog
        }
    }

    /// Replay triggers, one per stream, called once its first listener is
    /// attached. Idempotent.
    func flushEvents() {
        queue.async {
            guard !self.eventsFlushed else { return }
            self.eventsFlushed = true
            self.eventBuffer.forEach { self.emitEvent?($0) }
            self.eventBuffer.removeAll()
        }
    }

    func flushLogs() {
        queue.async {
            guard !self.logsFlushed else { return }
            self.logsFlushed = true
            self.logBuffer.forEach { self.emitLog?($0) }
            self.logBuffer.removeAll()
        }
    }

    private func append(_ buffer: inout [[String: Any]], _ entry: [String: Any]) {
        if buffer.count >= Self.capacity {
            buffer.removeFirst()
        }
        buffer.append(entry)
    }
}
