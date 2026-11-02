package cloud.trustpin.reactnative.attest

import cloud.trustpin.kotlin.attest.TrustPinAttestError
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** An argument JavaScript sent that the native module can't use. */
internal class AttestInvalidArgument(message: String) : Exception(message)

/** A rejection's code, message and reasons. */
internal data class AttestRejection(val code: String, val message: String?, val reasons: List<String>)

internal fun attestRejection(error: Throwable): AttestRejection = when (error) {
    is CancellationException -> AttestRejection(AttestErrorCode.CANCELLED, "Operation was cancelled", emptyList())
    is AttestInvalidArgument -> AttestRejection(AttestErrorCode.INVALID_ARGUMENTS, error.message, emptyList())
    is TrustPinAttestError -> AttestRejection(error.code(), error.message, error.reasonList())
    // `TrustPinAttest.instance(id)` and the configuration loader reject this way.
    is IllegalArgumentException -> AttestRejection(AttestErrorCode.INVALID_CONFIGURATION, error.message, emptyList())
    else -> AttestRejection(AttestErrorCode.ATTEST, error.message, emptyList())
}

/**
 * Runs a module method: the suspending [operation] is launched on [scope] and
 * its result, or its error with a stable code (an attestation failure's
 * reasons in `userInfo.reasons`), delivered through [promise].
 */
internal fun execute(scope: CoroutineScope, promise: Promise, operation: suspend () -> Any?) {
    scope.launch {
        try {
            promise.resolve(operation())
        } catch (e: Exception) {
            val rejection = attestRejection(e)
            val userInfo = Arguments.createMap().apply {
                putArray(AttestKey.REASONS, Arguments.fromList(rejection.reasons))
            }
            promise.reject(rejection.code, rejection.message, userInfo)
            if (e is CancellationException) throw e
        }
    }
}

/** Converts a map for the bridge. Numbers cross as doubles. */
internal fun Map<String, Any?>.toWritableMap(): WritableMap = Arguments.createMap().also { map ->
    forEach { (key, value) ->
        when (value) {
            null -> map.putNull(key)
            is Double -> map.putDouble(key, value)
            is Long -> map.putDouble(key, value.toDouble())
            is Int -> map.putInt(key, value)
            is Boolean -> map.putBoolean(key, value)
            is List<*> -> map.putArray(key, Arguments.fromList(value))
            else -> map.putString(key, value.toString())
        }
    }
}
