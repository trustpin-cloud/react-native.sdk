package cloud.trustpin.reactnative

import cloud.trustpin.kotlin.sdk.TrustPinError
import cloud.trustpin.kotlin.sdk.TrustPinLogLevel
import cloud.trustpin.kotlin.sdk.TrustPinValidationListener
import java.security.cert.X509Certificate

/**
 * Forwards the native SDK's global validation verdicts into the event hub.
 *
 * The payload carries the domain, the stable error code and a timestamp only:
 * no instance id (this plugin exposes the default instance), no message, and
 * never the presented certificate, which is attacker-supplied data that must
 * not cross into JavaScript.
 */
internal class TrustPinValidationForwarder : TrustPinValidationListener {

    override fun onValidationFailure(
        instanceId: String,
        domain: String,
        error: TrustPinError,
        presentedCertificate: X509Certificate,
    ) {
        TrustPinEventHub.recordValidation(
            mapOf(
                EventKey.DOMAIN to domain,
                EventKey.CODE to mapTrustPinError(error),
                EventKey.TIMESTAMP_MS to nowMs(),
            )
        )
    }

    override fun onValidationSuccess(instanceId: String, domain: String) {
        // A null code marks a success event on the JavaScript side.
        TrustPinEventHub.recordValidation(
            mapOf(
                EventKey.DOMAIN to domain,
                EventKey.CODE to null,
                EventKey.TIMESTAMP_MS to nowMs(),
            )
        )
    }
}

/**
 * The wire string for a log level, kept in sync with the JavaScript
 * `TrustPinLogLevel` union. `NONE` never reaches a sink; it only filters.
 */
internal fun TrustPinLogLevel.toWireName(): String = when (this) {
    TrustPinLogLevel.ERROR -> "error"
    TrustPinLogLevel.INFO -> "info"
    TrustPinLogLevel.DEBUG -> "debug"
    TrustPinLogLevel.NONE -> "none"
}

/**
 * Maps the JavaScript-side string to an SDK log level. Unknown or absent
 * values fall back to `ERROR`.
 */
internal fun String?.toTrustPinLogLevel(): TrustPinLogLevel = when (this?.lowercase()) {
    "none" -> TrustPinLogLevel.NONE
    "info" -> TrustPinLogLevel.INFO
    "debug" -> TrustPinLogLevel.DEBUG
    else -> TrustPinLogLevel.ERROR
}

internal fun nowMs(): Double = System.currentTimeMillis().toDouble()
