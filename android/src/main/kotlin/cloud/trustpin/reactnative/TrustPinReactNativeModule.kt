package cloud.trustpin.reactnative

import cloud.trustpin.kotlin.sdk.TrustPin
import cloud.trustpin.kotlin.sdk.TrustPinError
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/**
 * The observe-only TurboModule. It exposes readiness, manual validation, log
 * verbosity and the two event streams; it holds no lever that configures,
 * weakens or disables pinning — setup happens natively, before JavaScript
 * exists.
 */
@ReactModule(name = TrustPinReactNativeModule.NAME)
class TrustPinReactNativeModule(
    reactContext: ReactApplicationContext,
) : NativeTrustPinReactNativeSpec(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    init {
        // Route buffered and live events through this instance's emitters. A
        // reload creates a new module, which replaces these callbacks.
        TrustPinEventHub.attach(
            emitValidation = { emitOnValidationEvent(it.toReadableMap()) },
            emitLog = { emitOnLogEvent(it.toReadableMap()) },
        )
    }

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }

    override fun awaitConfiguration(timeoutMs: Double?, promise: Promise) {
        execute(scope, promise, ErrorCode.AWAIT_CONFIGURATION_ERROR) {
            suspend {
                // A null or non-positive timeout defers to the SDK's default.
                if (timeoutMs != null && timeoutMs > 0) {
                    TrustPin.default.awaitConfiguration(timeoutMs.toLong())
                } else {
                    TrustPin.default.awaitConfiguration()
                }
                null
            }
        }
    }

    override fun isConfigurationLoaded(promise: Promise) {
        execute(scope, promise, ErrorCode.AWAIT_CONFIGURATION_ERROR) {
            suspend { TrustPin.default.isConfigurationLoaded }
        }
    }

    override fun validateConnection(
        host: String,
        port: Double,
        timeoutMs: Double?,
        promise: Promise,
    ) {
        execute(scope, promise, ErrorCode.VALIDATE_CONNECTION_ERROR) {
            val portNumber = port.toInt()
            suspend {
                val trustPin = TrustPin.default
                if (timeoutMs != null && timeoutMs > 0) {
                    // Share the single timeout budget across the two native calls.
                    val budgetMs = timeoutMs.toLong()
                    val start = System.nanoTime()
                    val pem = trustPin.fetchCertificate(host, portNumber, budgetMs)
                    val remainingMs = budgetMs - (System.nanoTime() - start) / 1_000_000
                    if (remainingMs <= 0) throw TrustPinError.Timeout
                    trustPin.verify(host, pem, remainingMs)
                } else {
                    val pem = trustPin.fetchCertificate(host, portNumber)
                    trustPin.verify(host, pem)
                }
                null
            }
        }
    }

    override fun setLogLevel(level: String, promise: Promise) {
        execute(scope, promise, ErrorCode.SET_LOG_LEVEL_ERROR) {
            val logLevel = level.toTrustPinLogLevel()
            suspend {
                TrustPin.setLogLevel(logLevel)
                null
            }
        }
    }

    override fun flushEarlyValidationEvents() {
        TrustPinEventHub.flushValidation()
    }

    override fun flushEarlyLogEvents() {
        TrustPinEventHub.flushLog()
    }

    companion object {
        const val NAME: String = "TrustPinReactNative"
    }
}

/**
 * Converts an event map to the bridge representation. Numbers cross as
 * doubles; a null code marks a validation success event.
 */
private fun Map<String, Any?>.toReadableMap() = Arguments.createMap().also { map ->
    forEach { (key, value) ->
        when (value) {
            null -> map.putNull(key)
            is Double -> map.putDouble(key, value)
            is Int -> map.putInt(key, value)
            is Boolean -> map.putBoolean(key, value)
            else -> map.putString(key, value.toString())
        }
    }
}
