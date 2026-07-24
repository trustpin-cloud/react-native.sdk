import Foundation
import TrustPinKit

/// Boxes the ObjC promise blocks so they can cross into a `@Sendable` task
/// under Swift 6 strict concurrency, and guarantees exactly one delivery.
private final class PromiseBox: @unchecked Sendable {
    private let lock = NSLock()
    private var resolve: ((Any?) -> Void)?
    private var reject: ((String, String) -> Void)?

    init(resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        self.resolve = resolve
        self.reject = reject
    }

    func fulfill(_ value: Any?) {
        take()?.resolve(value)
    }

    func fail(_ code: String, _ message: String) {
        take()?.reject(code, message)
    }

    private func take() -> (resolve: (Any?) -> Void, reject: (String, String) -> Void)? {
        lock.lock()
        defer { lock.unlock() }
        guard let resolve, let reject else { return nil }
        self.resolve = nil
        self.reject = nil
        return (resolve, reject)
    }
}

/// Async method implementations behind the TurboModule adapter, against the
/// `default` TrustPin instance, minus setup and the certificate APIs.
@objc public final class TrustPinBridge: NSObject {

    private static func run(
        defaultCode: String,
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String) -> Void,
        operation: @escaping @Sendable () async throws -> Any?
    ) {
        let box = PromiseBox(resolve: resolve, reject: reject)
        Task {
            do {
                try Task.checkCancellation()
                let value = try await operation()
                try Task.checkCancellation()
                box.fulfill(value)
            } catch {
                let (code, message) = trustPinRejection(from: error, defaultCode: defaultCode)
                box.fail(code, message)
            }
        }
    }

    /// A nil/non-positive timeout defers to the native SDK's default.
    @objc public static func awaitConfiguration(
        _ timeoutMs: NSNumber?,
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String) -> Void
    ) {
        let timeoutMsValue = timeoutMs?.doubleValue
        run(defaultCode: TrustPinErrorCode.awaitConfigurationError, resolve: resolve, reject: reject) {
            if let timeoutMsValue, timeoutMsValue > 0 {
                try await TrustPin.default.awaitConfiguration(timeout: timeoutMsValue / 1000.0)
            } else {
                try await TrustPin.default.awaitConfiguration()
            }
            return nil
        }
    }

    @objc public static func isConfigurationLoaded(
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String) -> Void
    ) {
        run(defaultCode: TrustPinErrorCode.awaitConfigurationError, resolve: resolve, reject: reject) {
            await TrustPin.default.isConfigurationLoaded
        }
    }

    /// Validates the certificate natively with a shared timeout budget.
    /// Certificate material stays native.
    @objc public static func validateConnection(
        _ host: String,
        port: Int,
        timeoutMs: NSNumber?,
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String) -> Void
    ) {
        let timeoutMsValue = timeoutMs?.doubleValue
        run(defaultCode: TrustPinErrorCode.validateConnectionError, resolve: resolve, reject: reject) {
            let trustPin = TrustPin.default
            if let timeoutMsValue, timeoutMsValue > 0 {
                let timeout = timeoutMsValue / 1000.0
                let start = Date()
                let pem = try await trustPin.fetchCertificate(host: host, port: port, timeout: timeout)
                let remaining = timeout - Date().timeIntervalSince(start)
                guard remaining > 0 else { throw TrustPinErrors.timeout }
                try await trustPin.verify(domain: host, certificate: pem, timeout: remaining)
            } else {
                let pem = try await trustPin.fetchCertificate(host: host, port: port)
                try await trustPin.verify(domain: host, certificate: pem)
            }
            return nil
        }
    }

    @objc public static func setLogLevel(
        _ level: String,
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String) -> Void
    ) {
        run(defaultCode: TrustPinErrorCode.setLogLevelError, resolve: resolve, reject: reject) {
            TrustPin.default.set(logLevel: TrustPinLogLevel(wireName: level))
            return nil
        }
    }

    /// Replay triggers forwarded by the adapter, one per stream.
    @objc public static func flushEarlyValidationEvents() {
        TrustPinEventHub.shared.flushValidation()
    }

    @objc public static func flushEarlyLogEvents() {
        TrustPinEventHub.shared.flushLog()
    }

    /// Wires the TurboModule's codegen emitters into the event hub. Called
    /// once from the adapter's init; the blocks must tolerate any calling
    /// thread (the codegen callback schedules onto the JS runtime).
    @objc public static func attachEmitters(
        validation: @escaping (NSDictionary) -> Void,
        log: @escaping (NSDictionary) -> Void
    ) {
        TrustPinEventHub.shared.attach(
            emitValidation: { validation($0 as NSDictionary) },
            emitLog: { log($0 as NSDictionary) }
        )
    }
}
