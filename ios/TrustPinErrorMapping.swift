import Foundation
import TrustPinKit

/// Stable cross-platform error codes
enum TrustPinErrorCode {
    static let invalidProjectConfig = "INVALID_PROJECT_CONFIG"
    static let errorFetchingPinningInfo = "ERROR_FETCHING_PINNING_INFO"
    static let configurationValidationFailed = "CONFIGURATION_VALIDATION_FAILED"
    static let configIntegrityFailed = "CONFIG_INTEGRITY_FAILED"
    static let invalidServerCert = "INVALID_SERVER_CERT"
    static let pinsMismatch = "PINS_MISMATCH"
    static let allPinsExpired = "ALL_PINS_EXPIRED"
    static let domainNotRegistered = "DOMAIN_NOT_REGISTERED"
    static let fetchCertificateTimeout = "FETCH_CERTIFICATE_TIMEOUT"
    static let alreadyInitialized = "ALREADY_INITIALIZED"
    static let cancelled = "CANCELLED"
    // Per-method fallbacks for unclassified errors
    static let awaitConfigurationError = "AWAIT_CONFIGURATION_ERROR"
    static let validateConnectionError = "VALIDATE_CONNECTION_ERROR"
    static let setLogLevelError = "SET_LOG_LEVEL_ERROR"
}

/// Translates a `TrustPinErrors` case into the stable string code. Unknown
/// future cases fall through to `INVALID_PROJECT_CONFIG`.
func mapTrustPinError(_ error: TrustPinErrors) -> String {
    switch error {
    case .invalidProjectConfig:          return TrustPinErrorCode.invalidProjectConfig
    case .alreadyInitialized:            return TrustPinErrorCode.alreadyInitialized
    case .errorFetchingPinningInfo:      return TrustPinErrorCode.errorFetchingPinningInfo
    case .invalidServerCert:             return TrustPinErrorCode.invalidServerCert
    case .pinsMismatch:                  return TrustPinErrorCode.pinsMismatch
    case .allPinsExpired:                return TrustPinErrorCode.allPinsExpired
    case .configurationValidationFailed: return TrustPinErrorCode.configurationValidationFailed
    case .domainNotRegistered:           return TrustPinErrorCode.domainNotRegistered
    case .timeout:                       return TrustPinErrorCode.fetchCertificateTimeout
    case .configIntegrityFailed:         return TrustPinErrorCode.configIntegrityFailed
    @unknown default:                    return TrustPinErrorCode.invalidProjectConfig
    }
}

/// Maps any thrown error to the stable (code, message) pair delivered as a
/// Promise rejection.
func trustPinRejection(from error: Error, defaultCode: String) -> (code: String, message: String) {
    switch error {
    case is CancellationError:
        return (TrustPinErrorCode.cancelled, "Operation was cancelled")
    case let trustPin as TrustPinErrors:
        return (mapTrustPinError(trustPin), trustPin.localizedDescription)
    default:
        return (defaultCode, error.localizedDescription)
    }
}
