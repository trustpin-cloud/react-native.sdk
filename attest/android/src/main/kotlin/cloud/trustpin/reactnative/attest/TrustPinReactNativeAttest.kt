package cloud.trustpin.reactnative.attest

import android.content.Context
import cloud.trustpin.kotlin.attest.TrustPinAttest
import cloud.trustpin.kotlin.attest.TrustPinAttestConfiguration
import cloud.trustpin.kotlin.attest.TrustPinAttestLogLevel
import cloud.trustpin.kotlin.attest.fromAssets
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The native init helper of app attestation, called right after
 * `TrustPinReactNative.start(this)` in `Application.onCreate()`:
 *
 * ```kotlin
 * override fun onCreate() {
 *     TrustPinReactNative.start(this)
 *     TrustPinReactNativeAttest.start(this)
 *     // or: TrustPinReactNativeAttest.start(this, TrustPinAttestLogLevel.DEBUG, BuildConfig.TRUSTPIN_DEBUG_TOKEN)
 *     super.onCreate()
 *     loadReactNative(this)
 * }
 * ```
 *
 * It reads `attest_verifier_url`, `attested_hosts` and
 * `google_cloud_project_number` from the bundled `assets/trustpin.json`, the
 * file pinning reads, through the native SDK's own loader, and sets up
 * `TrustPinAttest.default`, which registers itself on the pinning SDK's
 * default instance. From then on React Native's HTTPS requests to the
 * attested hosts carry the `TrustPin-Attestation` header.
 *
 * Setup failures never crash the host app: they surface through the log
 * stream and the state, and requests go out without the header.
 */
object TrustPinReactNativeAttest {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var initialized = false

    /**
     * @param debugToken a debug token for emulators and debug devices, from a
     *   debug-only build field; never from a bundled file. The native SDK uses
     *   it only in debuggable apps, and only when your policy and your
     *   verifier allow debug tokens.
     */
    @JvmStatic
    @JvmOverloads
    fun start(
        context: Context,
        logLevel: TrustPinAttestLogLevel = TrustPinAttestLogLevel.ERROR,
        debugToken: String? = null,
    ) {
        synchronized(this) {
            if (initialized) return
            initialized = true
        }

        val applicationContext = context.applicationContext
        val attest = TrustPinAttest.default

        TrustPinAttest.setLogSink { level, _, message ->
            AttestEventHub.recordLog(
                mapOf(
                    AttestKey.LEVEL to level.toWireName(),
                    AttestKey.MESSAGE to message,
                    AttestKey.TIMESTAMP_MS to nowMs(),
                )
            )
        }
        attest.setStateListener { state -> AttestEventHub.recordState(state.toWireMap()) }
        attest.setEventListener { event -> AttestEventHub.recordEvent(event.toWireMap()) }
        attest.setLogLevel(logLevel)

        scope.launch {
            try {
                val loaded = TrustPinAttestConfiguration.fromAssets(applicationContext)
                // The asset loader never reads a debug token: it comes from the
                // build, through this helper.
                val configuration = if (debugToken.isNullOrEmpty()) loaded else TrustPinAttestConfiguration(
                    loaded.verifierUrl,
                    loaded.attestedHosts,
                    loaded.googleCloudProjectNumber,
                    debugToken,
                )
                attest.setup(applicationContext, configuration)
            } catch (e: Exception) {
                val rejection = attestRejection(e)
                AttestEventHub.recordLog(
                    mapOf(
                        AttestKey.LEVEL to "error",
                        AttestKey.MESSAGE to
                            "TrustPin attestation native init failed [${rejection.code}]: ${rejection.message}",
                        AttestKey.TIMESTAMP_MS to nowMs(),
                    )
                )
            }
        }
    }

    /**
     * Java-friendly entry point taking the log level's wire name, used by the
     * Expo config plugin's generated init line.
     */
    @JvmStatic
    fun start(context: Context, logLevelName: String?, debugToken: String?) {
        start(
            context,
            if (logLevelName.isNullOrEmpty()) TrustPinAttestLogLevel.ERROR else logLevelName.toAttestLogLevel(),
            debugToken,
        )
    }
}
