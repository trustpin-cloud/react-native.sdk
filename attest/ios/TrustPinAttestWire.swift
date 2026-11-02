import Foundation
import TrustPinAttestKit

/// Keys of the maps sent to JavaScript. Keep in sync with
/// `src/NativeTrustPinReactNativeAttest.ts`.
enum AttestKey {
    static let state = "state"
    static let event = "event"
    static let expiresAtMs = "expiresAtMs"
    static let retryAtMs = "retryAtMs"
    static let untilMs = "untilMs"
    static let durationMs = "durationMs"
    static let count = "count"
    static let code = "code"
    static let message = "message"
    static let reasons = "reasons"
    static let level = "level"
    static let timestampMs = "timestampMs"
}

/// Error codes sent to JavaScript. Keep in sync with `src/errors.ts`.
enum AttestErrorCode {
    static let invalidConfiguration = "INVALID_CONFIGURATION"
    static let alreadyInitialized = "ALREADY_INITIALIZED"
    static let notSetUp = "NOT_SET_UP"
    static let unsupportedDevice = "UNSUPPORTED_DEVICE"
    static let evidenceUnavailable = "EVIDENCE_UNAVAILABLE"
    static let bindingRequired = "BINDING_REQUIRED"
    static let attestationFailed = "ATTESTATION_FAILED"
    static let verifierUnavailable = "VERIFIER_UNAVAILABLE"
    static let verifierIncompatible = "VERIFIER_INCOMPATIBLE"
    static let invalidDigest = "INVALID_DIGEST"
    static let invalidArguments = "INVALID_ARGUMENTS"
    static let cancelled = "CANCELLED"
    static let attest = "ATTEST_ERROR"
}

/// The stable code of each `TrustPinAttestError` case.
func attestErrorCode(_ error: TrustPinAttestError) -> String {
    switch error {
    case .invalidConfiguration: return AttestErrorCode.invalidConfiguration
    case .alreadyInitialized:   return AttestErrorCode.alreadyInitialized
    case .notSetUp:             return AttestErrorCode.notSetUp
    case .invalidDigest:        return AttestErrorCode.invalidDigest
    case .unsupportedDevice:    return AttestErrorCode.unsupportedDevice
    case .evidenceUnavailable:  return AttestErrorCode.evidenceUnavailable
    case .bindingRequired:      return AttestErrorCode.bindingRequired
    case .attestationFailed:    return AttestErrorCode.attestationFailed
    case .verifierUnavailable:  return AttestErrorCode.verifierUnavailable
    case .verifierIncompatible: return AttestErrorCode.verifierIncompatible
    @unknown default:           return AttestErrorCode.attest
    }
}

/// The reasons an `attestationFailed` error carries; empty for other cases.
func attestReasons(_ error: TrustPinAttestError) -> [String] {
    if case .attestationFailed(let reasons) = error { return reasons }
    return []
}

/// A rejection's code, message and reasons for any error a call throws.
func attestRejection(from error: Error) -> (code: String, message: String, reasons: [String]) {
    switch error {
    case is CancellationError:
        return (AttestErrorCode.cancelled, "Operation was cancelled", [])
    case let invalid as AttestInvalidArgument:
        return (AttestErrorCode.invalidArguments, invalid.message, [])
    case let attest as TrustPinAttestError:
        return (attestErrorCode(attest), attest.localizedDescription, attestReasons(attest))
    default:
        return (AttestErrorCode.attest, error.localizedDescription, [])
    }
}

/// An argument JavaScript sent that the native module can't use.
struct AttestInvalidArgument: Error {
    let message: String
}

extension TrustPinAttestLogLevel {
    /// Maps the JavaScript name to a level; unknown names turn logging off.
    init(wireName: String?) {
        switch wireName?.lowercased() {
        case "error":   self = .error
        case "warning": self = .warning
        case "info":    self = .info
        case "debug":   self = .debug
        default:        self = .none
        }
    }

    var wireName: String {
        switch self {
        case .none:    return "none"
        case .error:   return "error"
        case .warning: return "warning"
        case .info:    return "info"
        case .debug:   return "debug"
        @unknown default: return "info"
        }
    }
}

extension TrustPinAttestState {
    /// The map sent to JavaScript. A retry time a year or more away
    /// (`.distantFuture`) is left out: no new attempt in this launch.
    var wireMap: [String: Any] {
        var map: [String: Any] = [:]
        switch self {
        case .unavailable:
            map[AttestKey.state] = "unavailable"
        case .attesting:
            map[AttestKey.state] = "attesting"
        case .ready(let expiresAt):
            map[AttestKey.state] = "ready"
            map[AttestKey.expiresAtMs] = milliseconds(expiresAt)
        case .failed(let error, let retryAt):
            map[AttestKey.state] = "failed"
            map.merge(error.wireFields) { $1 }
            map[AttestKey.retryAtMs] = retryTime(retryAt)
        @unknown default:
            map[AttestKey.state] = "unavailable"
        }
        return map
    }
}

extension TrustPinAttestEvent {
    /// The map sent to JavaScript: the event's name and its own fields.
    /// Durations and times are milliseconds.
    var wireMap: [String: Any] {
        var map: [String: Any] = [:]
        switch self {
        case .keyGenerated:
            map[AttestKey.event] = "keyGenerated"
        case .keyReplaced(let count):
            map[AttestKey.event] = "keyReplaced"
            map[AttestKey.count] = count
        case .attestationSucceeded(let duration):
            map[AttestKey.event] = "attestationSucceeded"
            map[AttestKey.durationMs] = milliseconds(duration)
        case .refused(let retryAt):
            map[AttestKey.event] = "refused"
            map[AttestKey.retryAtMs] = retryTime(retryAt)
        case .attestationFailed(let reasons, let retryAt):
            map[AttestKey.event] = "attestationFailed"
            map[AttestKey.reasons] = reasons
            map[AttestKey.retryAtMs] = retryTime(retryAt)
        case .refreshSucceeded(let duration):
            map[AttestKey.event] = "refreshSucceeded"
            map[AttestKey.durationMs] = milliseconds(duration)
        case .refreshFailed(let error):
            map[AttestKey.event] = "refreshFailed"
            map.merge(error.wireFields) { $1 }
        case .waitEntered(let until):
            map[AttestKey.event] = "waitEntered"
            map[AttestKey.untilMs] = milliseconds(until)
        case .waitCleared:
            map[AttestKey.event] = "waitCleared"
        case .deviceUnsupported:
            map[AttestKey.event] = "deviceUnsupported"
        case .verifierUnavailable:
            map[AttestKey.event] = "verifierUnavailable"
        case .assertionSucceeded(let duration):
            map[AttestKey.event] = "assertionSucceeded"
            map[AttestKey.durationMs] = milliseconds(duration)
        case .assertionFailed(let error):
            map[AttestKey.event] = "assertionFailed"
            map.merge(error.wireFields) { $1 }
        @unknown default:
            // A newer native event: JavaScript skips names it doesn't know.
            map[AttestKey.event] = "unknown"
        }
        return map
    }
}

private extension TrustPinAttestError {
    var wireFields: [String: Any] {
        [
            AttestKey.code: attestErrorCode(self),
            AttestKey.message: localizedDescription,
            AttestKey.reasons: attestReasons(self),
        ]
    }
}

/// `nil` (the key left out) for a retry a year or more away.
private func retryTime(_ date: Date) -> Double? {
    date.timeIntervalSinceNow < 365 * 24 * 3600 ? milliseconds(date) : nil
}

private func milliseconds(_ date: Date) -> Double {
    (date.timeIntervalSince1970 * 1000).rounded()
}

private func milliseconds(_ interval: TimeInterval) -> Double {
    (interval * 1000).rounded()
}

func attestNowMs() -> Double {
    (Date().timeIntervalSince1970 * 1000).rounded()
}
