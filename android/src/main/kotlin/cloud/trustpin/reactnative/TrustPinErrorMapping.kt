package cloud.trustpin.reactnative

import cloud.trustpin.kotlin.sdk.TrustPinError
import com.facebook.react.bridge.Promise
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch

/** Stable cross-platform error codes, identical across the iOS and Android layers. */
internal object ErrorCode {
    const val INVALID_PROJECT_CONFIG = "INVALID_PROJECT_CONFIG"
    const val ERROR_FETCHING_PINNING_INFO = "ERROR_FETCHING_PINNING_INFO"
    const val CONFIGURATION_VALIDATION_FAILED = "CONFIGURATION_VALIDATION_FAILED"
    const val CONFIG_INTEGRITY_FAILED = "CONFIG_INTEGRITY_FAILED"
    const val INVALID_SERVER_CERT = "INVALID_SERVER_CERT"
    const val PINS_MISMATCH = "PINS_MISMATCH"
    const val ALL_PINS_EXPIRED = "ALL_PINS_EXPIRED"
    const val DOMAIN_NOT_REGISTERED = "DOMAIN_NOT_REGISTERED"
    const val FETCH_CERTIFICATE_TIMEOUT = "FETCH_CERTIFICATE_TIMEOUT"
    const val ALREADY_INITIALIZED = "ALREADY_INITIALIZED"
    const val INVALID_ARGUMENTS = "INVALID_ARGUMENTS"
    const val CANCELLED = "CANCELLED"

    // Android-only conditions, surfaced as-is.
    const val SETUP_IN_PROGRESS = "SETUP_IN_PROGRESS"
    const val LOCK_TIMEOUT = "LOCK_TIMEOUT"
    const val SSL_CONTEXT_SETUP_FAILED = "SSL_CONTEXT_SETUP_FAILED"
    const val UNSUPPORTED_DEVICE = "UNSUPPORTED_DEVICE"

    // Per-method fallbacks for unclassified errors.
    const val AWAIT_CONFIGURATION_ERROR = "AWAIT_CONFIGURATION_ERROR"
    const val VALIDATE_CONNECTION_ERROR = "VALIDATE_CONNECTION_ERROR"
    const val SET_LOG_LEVEL_ERROR = "SET_LOG_LEVEL_ERROR"
}

/** A unit of work produced by a method's synchronous parse phase. */
internal typealias HandlerOperation = suspend () -> Any?

/**
 * Translates a [TrustPinError] into the stable string code sent to JavaScript.
 * Unknown future cases fall through to `INVALID_PROJECT_CONFIG`.
 */
internal fun mapTrustPinError(error: TrustPinError): String = when (error) {
    is TrustPinError.InvalidProjectConfig -> ErrorCode.INVALID_PROJECT_CONFIG
    is TrustPinError.AlreadyInitialized -> ErrorCode.ALREADY_INITIALIZED
    is TrustPinError.ErrorFetchingPinningInfo -> ErrorCode.ERROR_FETCHING_PINNING_INFO
    is TrustPinError.InvalidServerCert -> ErrorCode.INVALID_SERVER_CERT
    is TrustPinError.PinsMismatch -> ErrorCode.PINS_MISMATCH
    is TrustPinError.AllPinsExpired -> ErrorCode.ALL_PINS_EXPIRED
    is TrustPinError.ConfigurationValidationFailed -> ErrorCode.CONFIGURATION_VALIDATION_FAILED
    is TrustPinError.DomainNotRegistered -> ErrorCode.DOMAIN_NOT_REGISTERED
    is TrustPinError.Timeout -> ErrorCode.FETCH_CERTIFICATE_TIMEOUT
    is TrustPinError.ConfigIntegrityError -> ErrorCode.CONFIG_INTEGRITY_FAILED
    // Operations before setup surface as INVALID_PROJECT_CONFIG, matching the
    // iOS SDK, which has no separate not-initialized case.
    is TrustPinError.NotInitialized -> ErrorCode.INVALID_PROJECT_CONFIG
    is TrustPinError.SetupInProgress -> ErrorCode.SETUP_IN_PROGRESS
    is TrustPinError.LockTimeout -> ErrorCode.LOCK_TIMEOUT
    is TrustPinError.SSLContextSetupFailed -> ErrorCode.SSL_CONTEXT_SETUP_FAILED
    is TrustPinError.UnsupportedDevice -> ErrorCode.UNSUPPORTED_DEVICE
    else -> ErrorCode.INVALID_PROJECT_CONFIG
}

/**
 * Rejects [this] promise with the stable code for [error]. Returns `true` only
 * for a plain [CancellationException] (cooperative cancellation) so the caller
 * can re-throw and honour structured concurrency. A
 * [TimeoutCancellationException] is a terminal outcome of the call, not a
 * cancellation of the surrounding scope, and must stay matched before its
 * superclass.
 */
internal fun Promise.rejectWith(error: Throwable, defaultCode: String): Boolean = when (error) {
    is TimeoutCancellationException -> {
        reject(ErrorCode.FETCH_CERTIFICATE_TIMEOUT, "Timed out")
        false
    }
    is CancellationException -> {
        reject(ErrorCode.CANCELLED, "Operation was cancelled")
        true
    }
    is TrustPinError -> {
        reject(mapTrustPinError(error), error.message)
        false
    }
    else -> {
        reject(defaultCode, error.message)
        false
    }
}

/**
 * Runs a module method in two phases: [parse] executes synchronously on the
 * calling thread and returns the suspending work, which is then launched on
 * [scope] with its result or mapped error delivered through [promise].
 */
internal fun execute(
    scope: CoroutineScope,
    promise: Promise,
    defaultCode: String,
    parse: () -> HandlerOperation,
) {
    val operation: HandlerOperation = try {
        parse()
    } catch (e: Exception) {
        promise.rejectWith(e, defaultCode)
        return
    }

    scope.launch {
        try {
            promise.resolve(operation())
        } catch (e: Exception) {
            val shouldRethrow = promise.rejectWith(e, defaultCode)
            if (shouldRethrow) throw e
        }
    }
}
