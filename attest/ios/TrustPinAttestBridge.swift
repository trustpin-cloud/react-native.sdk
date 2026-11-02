import Foundation
import TrustPinAttestKit

/// Boxes the ObjC promise blocks so they can cross into a `@Sendable` task
/// under Swift 6 strict concurrency, and guarantees exactly one delivery.
private final class AttestPromiseBox: @unchecked Sendable {
    private let lock = NSLock()
    private var resolve: ((Any?) -> Void)?
    private var reject: ((String, String, [String]) -> Void)?

    init(resolve: @escaping (Any?) -> Void, reject: @escaping (String, String, [String]) -> Void) {
        self.resolve = resolve
        self.reject = reject
    }

    func fulfill(_ value: Any?) {
        take()?.resolve(value)
    }

    func fail(_ code: String, _ message: String, _ reasons: [String]) {
        take()?.reject(code, message, reasons)
    }

    private func take() -> (resolve: (Any?) -> Void, reject: (String, String, [String]) -> Void)? {
        lock.lock()
        defer { lock.unlock() }
        guard let resolve, let reject else { return nil }
        self.resolve = nil
        self.reject = nil
        return (resolve, reject)
    }
}

/// The method implementations behind the TurboModule adapter, against
/// `TrustPinAttest.default`. Each forwards to the native call of the same
/// name; setup happens in the native init helper.
@objc public final class TrustPinAttestBridge: NSObject {

    private static func run(
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void,
        operation: @escaping @Sendable () async throws -> Any?
    ) {
        let box = AttestPromiseBox(resolve: resolve, reject: reject)
        Task {
            do {
                box.fulfill(try await operation())
            } catch {
                let rejection = attestRejection(from: error)
                box.fail(rejection.code, rejection.message, rejection.reasons)
            }
        }
    }

    @objc public static func prefetch(
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void
    ) {
        run(resolve: resolve, reject: reject) {
            TrustPinAttest.default.prefetch()
            return nil
        }
    }

    @objc public static func getToken(
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void
    ) {
        run(resolve: resolve, reject: reject) {
            try await TrustPinAttest.default.getToken()
        }
    }

    @objc public static func attestationHeaders(
        _ url: String,
        method: String,
        headers: [String: Any],
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void
    ) {
        let fields = headers.compactMapValues { $0 as? String }
        run(resolve: resolve, reject: reject) {
            guard let parsed = URL(string: url), parsed.scheme != nil, parsed.host != nil else {
                throw AttestInvalidArgument(message: "attestationHeaders: invalid url")
            }
            var request = URLRequest(url: parsed)
            request.httpMethod = method
            for (name, value) in fields {
                request.setValue(value, forHTTPHeaderField: name)
            }
            return await TrustPinAttest.default.attestationHeaders(for: request)
        }
    }

    @objc public static func assertionHeaders(
        _ payloadDigestHex: String,
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void
    ) {
        run(resolve: resolve, reject: reject) {
            guard let digest = Data(hex: payloadDigestHex) else {
                throw TrustPinAttestError.invalidDigest
            }
            return try await TrustPinAttest.default.assertionHeaders(payloadDigest: digest)
        }
    }

    @objc public static func setTokenBinding(
        _ value: String?,
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void
    ) {
        run(resolve: resolve, reject: reject) {
            TrustPinAttest.default.setTokenBinding(value)
            return nil
        }
    }

    @objc public static func bindToHeader(
        _ name: String?,
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void
    ) {
        run(resolve: resolve, reject: reject) {
            TrustPinAttest.default.bindToHeader(name)
            return nil
        }
    }

    @objc public static func getState(
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void
    ) {
        run(resolve: resolve, reject: reject) {
            TrustPinAttest.default.state.wireMap
        }
    }

    @objc public static func reset(
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void
    ) {
        run(resolve: resolve, reject: reject) {
            await TrustPinAttest.default.reset()
            return nil
        }
    }

    @objc public static func setLogLevel(
        _ level: String,
        resolve: @escaping (Any?) -> Void,
        reject: @escaping (String, String, [String]) -> Void
    ) {
        run(resolve: resolve, reject: reject) {
            TrustPinAttest.default.set(logLevel: TrustPinAttestLogLevel(wireName: level))
            return nil
        }
    }

    @objc public static func flushEarlyEvents() {
        TrustPinAttestEventHub.shared.flushEvents()
    }

    @objc public static func flushEarlyLogEvents() {
        TrustPinAttestEventHub.shared.flushLogs()
    }

    /// Wires the TurboModule's codegen emitters into the event hub. The blocks
    /// must tolerate any calling thread.
    @objc public static func attachEmitters(
        state: @escaping (NSDictionary) -> Void,
        event: @escaping (NSDictionary) -> Void,
        log: @escaping (NSDictionary) -> Void
    ) {
        TrustPinAttestEventHub.shared.attach(
            emitState: { state($0 as NSDictionary) },
            emitEvent: { event($0 as NSDictionary) },
            emitLog: { log($0 as NSDictionary) }
        )
    }
}

private extension Data {
    /// Exactly 64 hex characters, or nil.
    init?(hex: String) {
        guard hex.count == 64 else { return nil }
        var bytes = [UInt8]()
        bytes.reserveCapacity(32)
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
            bytes.append(byte)
            index = next
        }
        self.init(bytes)
    }
}
