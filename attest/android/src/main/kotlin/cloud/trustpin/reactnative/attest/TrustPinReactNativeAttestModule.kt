package cloud.trustpin.reactnative.attest

import cloud.trustpin.kotlin.attest.TrustPinAttest
import cloud.trustpin.kotlin.attest.TrustPinAttestError
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/**
 * The attestation TurboModule. Each method forwards to the native call of the
 * same name on `TrustPinAttest.default`; setup happens in the native init
 * helper, before JavaScript exists.
 */
@ReactModule(name = TrustPinReactNativeAttestModule.NAME)
class TrustPinReactNativeAttestModule(
    reactContext: ReactApplicationContext,
) : NativeTrustPinReactNativeAttestSpec(reactContext) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val attest: TrustPinAttest get() = TrustPinAttest.default

    init {
        // A reload creates a new module, which replaces these callbacks.
        AttestEventHub.attach(
            emitState = { emitOnStateChange(it.toWritableMap()) },
            emitEvent = { emitOnEvent(it.toWritableMap()) },
            emitLog = { emitOnLogEvent(it.toWritableMap()) },
        )
    }

    override fun invalidate() {
        scope.cancel()
        super.invalidate()
    }

    override fun prefetch(promise: Promise) {
        execute(scope, promise) {
            attest.prefetch()
            null
        }
    }

    override fun getToken(promise: Promise) {
        execute(scope, promise) { attest.getToken() }
    }

    override fun attestationHeaders(url: String, method: String, headers: ReadableMap, promise: Promise) {
        // The native call takes the request's headers, each as a list of values.
        val requestHeaders = buildMap {
            for ((name, value) in headers.toHashMap()) {
                if (value is String) put(name, listOf(value))
            }
        }
        execute(scope, promise) {
            attest.attestationHeaders(url, requestHeaders).toWritableMap()
        }
    }

    override fun assertionHeaders(payloadDigestHex: String, promise: Promise) {
        execute(scope, promise) {
            val digest = payloadDigestHex.hexToBytes() ?: throw TrustPinAttestError.InvalidDigest
            attest.assertionHeaders(digest).toWritableMap()
        }
    }

    override fun setTokenBinding(value: String?, promise: Promise) {
        execute(scope, promise) {
            attest.setTokenBinding(value)
            null
        }
    }

    override fun bindToHeader(name: String?, promise: Promise) {
        execute(scope, promise) {
            attest.bindToHeader(name)
            null
        }
    }

    override fun getState(promise: Promise) {
        execute(scope, promise) { attest.state.toWireMap().toWritableMap() }
    }

    override fun reset(promise: Promise) {
        execute(scope, promise) {
            try {
                attest.reset()
            } catch (_: TrustPinAttestError.NotSetUp) {
                // A no-op before setup, as on iOS.
            }
            null
        }
    }

    override fun setLogLevel(level: String, promise: Promise) {
        execute(scope, promise) {
            attest.setLogLevel(level.toAttestLogLevel())
            null
        }
    }

    override fun flushEarlyEvents() {
        AttestEventHub.flushEvents()
    }

    override fun flushEarlyLogEvents() {
        AttestEventHub.flushLogs()
    }

    companion object {
        const val NAME: String = "TrustPinReactNativeAttest"
    }
}
