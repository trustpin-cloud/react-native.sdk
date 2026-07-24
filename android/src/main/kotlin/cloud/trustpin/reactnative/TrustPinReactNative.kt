package cloud.trustpin.reactnative

import android.content.Context
import cloud.trustpin.kotlin.sdk.TrustPin
import cloud.trustpin.kotlin.sdk.TrustPinConfiguration
import cloud.trustpin.kotlin.sdk.TrustPinError
import cloud.trustpin.kotlin.sdk.TrustPinLogLevel
import cloud.trustpin.kotlin.sdk.fromAssets
import com.facebook.react.modules.network.OkHttpClientProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The one-line native init helper, called as the **first statement** of
 * `Application.onCreate()`, before `loadReactNative(this)`:
 *
 * ```kotlin
 * override fun onCreate() {
 *     TrustPinReactNative.start(this)
 *     // or: TrustPinReactNative.start(this, TrustPinLogLevel.DEBUG)
 *     super.onCreate()
 *     loadReactNative(this)
 * }
 * ```
 *
 * The ordering matters: the OkHttp client factory must be installed before
 * React Native creates its networking client, so that every request the JS
 * stack makes — including images loaded through Fresco, which is built from
 * the same provider — goes through a pinned client.
 *
 * The helper loads the bundled `assets/trustpin.json` through the native SDK's
 * own loader, launches the non-blocking setup, and installs the global
 * validation listener and log sink feeding the early-event buffer.
 *
 * Setup failures never crash the host app: they surface through the log event
 * stream and logcat, and enforcement stays fail-closed because the trust
 * manager rejects every connection until a validated configuration exists.
 */
object TrustPinReactNative {

    // Supervised so one failed child never cancels the scope, and detached
    // from any lifecycle: the SDK's configuration fetch outlives the call.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var initialized = false

    @JvmStatic
    @JvmOverloads
    fun start(context: Context, logLevel: TrustPinLogLevel = TrustPinLogLevel.ERROR) {
        synchronized(this) {
            if (initialized) return
            initialized = true
        }

        val applicationContext = context.applicationContext

        TrustPin.setValidationListener(TrustPinValidationForwarder())
        TrustPin.setLogSink { level, _, message ->
            TrustPinEventHub.recordLog(
                mapOf(
                    EventKey.LEVEL to level.toWireName(),
                    EventKey.MESSAGE to message,
                    EventKey.TIMESTAMP_MS to nowMs(),
                )
            )
        }
        TrustPin.setLogLevel(logLevel)

        installOkHttpFactory(applicationContext)

        scope.launch {
            try {
                // Load the bundled configuration and start the native setup.
                TrustPin.default.setup(TrustPinConfiguration.fromAssets(applicationContext))
            } catch (e: Exception) {
                recordInitFailure("setup", e)
            }
        }
    }

    /**
     * Java-friendly entry point taking the wire-format log level name, used by
     * the Expo config plugin's generated init line.
     */
    @JvmStatic
    fun start(context: Context, logLevelName: String?) {
        start(context, logLevelName.toTrustPinLogLevel())
    }

    /**
     * Routes every React Native OkHttp client through TrustPin's matched
     * socket-factory / trust-manager pair, so pin validation runs inside the
     * real TLS handshake.
     *
     * A failure here is environmental (the platform's TLS stack cannot be
     * configured, or the SDK refuses to run on this device) and is rethrown
     * rather than swallowed: returning React Native's default client would
     * silently ship unpinned traffic, which is exactly what this SDK exists to
     * prevent.
     */
    private fun installOkHttpFactory(applicationContext: Context) {
        OkHttpClientProvider.setOkHttpClientFactory {
            try {
                val tls = TrustPin.default.makeTlsPair()
                OkHttpClientProvider.createClientBuilder(applicationContext)
                    .sslSocketFactory(tls.sslSocketFactory, tls.trustManager)
                    .build()
            } catch (e: Exception) {
                recordInitFailure("OkHttp client creation", e)
                throw e
            }
        }
    }

    private fun recordInitFailure(phase: String, error: Throwable) {
        val code = (error as? TrustPinError)?.let { mapTrustPinError(it) }
            ?: ErrorCode.INVALID_PROJECT_CONFIG
        TrustPinEventHub.recordLog(
            mapOf(
                EventKey.LEVEL to "error",
                EventKey.MESSAGE to "TrustPin native $phase failed [$code]: ${error.message}",
                EventKey.TIMESTAMP_MS to nowMs(),
            )
        )
    }
}
