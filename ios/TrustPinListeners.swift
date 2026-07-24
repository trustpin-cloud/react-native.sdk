import Foundation
import TrustPinKit

/// Forwards the native SDK's global validation verdicts into the event hub.
///
/// Payload per domain + code + timestamp only. No
/// `instanceId`, no message, and never the
/// presented certificate. Callbacks arrive synchronously on TLS-handshake
/// threads; the hub's serial queue keeps them non-blocking.
final class TrustPinValidationForwarder: TrustPinValidationListener, @unchecked Sendable {

    func onValidationFailure(
        instanceId: String,
        domain: String,
        error: TrustPinErrors,
        presentedCertificate: Data
    ) {
        TrustPinEventHub.shared.recordValidation([
            TrustPinEventKey.domain: domain,
            TrustPinEventKey.code: mapTrustPinError(error),
            TrustPinEventKey.timestampMs: trustPinNowMs(),
        ])
    }

    func onValidationSuccess(instanceId: String, domain: String) {
        // Absent `code` decodes as a success event in JS (code: null).
        TrustPinEventHub.shared.recordValidation([
            TrustPinEventKey.domain: domain,
            TrustPinEventKey.timestampMs: trustPinNowMs(),
        ])
    }
}

/// Forwards native SDK log output (already filtered by the configured log
/// level) into the event hub.
final class TrustPinLogForwarder: TrustPinLogSink, @unchecked Sendable {

    func log(level: TrustPinLogLevel, instanceId: String, message: String) {
        TrustPinEventHub.shared.recordLog([
            TrustPinEventKey.level: wireName(for: level),
            TrustPinEventKey.message: message,
            TrustPinEventKey.timestampMs: trustPinNowMs(),
        ])
    }
}

/// Wire string for a log level, keep in sync with the JS
/// `TrustPinLogLevel` union (`none` never reaches a sink; it only filters).
func wireName(for level: TrustPinLogLevel) -> String {
    switch level {
    case .none:  return "none"
    case .error: return "error"
    case .info:  return "info"
    case .debug: return "debug"
    @unknown default: return "info"
    }
}

extension TrustPinLogLevel {
    /// Maps the JS-side string to a Swift SDK log level. Unknown / nil values
    /// fall back to `.error`.
    init(wireName raw: String?) {
        switch raw?.lowercased() {
        case "none":  self = .none
        case "info":  self = .info
        case "debug": self = .debug
        default:      self = .error
        }
    }
}
