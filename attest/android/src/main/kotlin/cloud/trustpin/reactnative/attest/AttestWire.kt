package cloud.trustpin.reactnative.attest

import cloud.trustpin.kotlin.attest.TrustPinAttestError
import cloud.trustpin.kotlin.attest.TrustPinAttestEvent
import cloud.trustpin.kotlin.attest.TrustPinAttestLogLevel
import cloud.trustpin.kotlin.attest.TrustPinAttestState

/** Keys of the maps sent to JavaScript. Keep in sync with the TypeScript spec. */
internal object AttestKey {
    const val STATE = "state"
    const val EVENT = "event"
    const val EXPIRES_AT_MS = "expiresAtMs"
    const val RETRY_AT_MS = "retryAtMs"
    const val UNTIL_MS = "untilMs"
    const val DURATION_MS = "durationMs"
    const val COUNT = "count"
    const val CODE = "code"
    const val MESSAGE = "message"
    const val REASONS = "reasons"
    const val LEVEL = "level"
    const val TIMESTAMP_MS = "timestampMs"
}

/** Error codes sent to JavaScript. Keep in sync with `src/errors.ts`. */
internal object AttestErrorCode {
    const val INVALID_CONFIGURATION = "INVALID_CONFIGURATION"
    const val ALREADY_INITIALIZED = "ALREADY_INITIALIZED"
    const val NOT_SET_UP = "NOT_SET_UP"
    const val UNSUPPORTED_DEVICE = "UNSUPPORTED_DEVICE"
    const val EVIDENCE_UNAVAILABLE = "EVIDENCE_UNAVAILABLE"
    const val BINDING_REQUIRED = "BINDING_REQUIRED"
    const val ATTESTATION_FAILED = "ATTESTATION_FAILED"
    const val VERIFIER_UNAVAILABLE = "VERIFIER_UNAVAILABLE"
    const val VERIFIER_INCOMPATIBLE = "VERIFIER_INCOMPATIBLE"
    const val INVALID_DIGEST = "INVALID_DIGEST"
    const val INVALID_ARGUMENTS = "INVALID_ARGUMENTS"
    const val CANCELLED = "CANCELLED"
    const val ATTEST = "ATTEST_ERROR"
}

/** A retry time at least this far away is sent as "no retry": the key is left out. */
private const val NO_RETRY_THRESHOLD_MS: Long = 365L * 24 * 3600 * 1000

/** The stable code of each [TrustPinAttestError] case. */
internal fun TrustPinAttestError.code(): String = when (this) {
    is TrustPinAttestError.InvalidConfiguration -> AttestErrorCode.INVALID_CONFIGURATION
    is TrustPinAttestError.AlreadyInitialized -> AttestErrorCode.ALREADY_INITIALIZED
    is TrustPinAttestError.NotSetUp -> AttestErrorCode.NOT_SET_UP
    is TrustPinAttestError.UnsupportedDevice -> AttestErrorCode.UNSUPPORTED_DEVICE
    is TrustPinAttestError.EvidenceUnavailable -> AttestErrorCode.EVIDENCE_UNAVAILABLE
    is TrustPinAttestError.BindingRequired -> AttestErrorCode.BINDING_REQUIRED
    is TrustPinAttestError.AttestationFailed -> AttestErrorCode.ATTESTATION_FAILED
    is TrustPinAttestError.VerifierUnavailable -> AttestErrorCode.VERIFIER_UNAVAILABLE
    is TrustPinAttestError.VerifierIncompatible -> AttestErrorCode.VERIFIER_INCOMPATIBLE
    is TrustPinAttestError.InvalidDigest -> AttestErrorCode.INVALID_DIGEST
}

/** The reasons an `AttestationFailed` error carries; empty for other cases. */
internal fun TrustPinAttestError.reasonList(): List<String> =
    (this as? TrustPinAttestError.AttestationFailed)?.reasons ?: emptyList()

/** The map sent to JavaScript for this state. */
internal fun TrustPinAttestState.toWireMap(nowMillis: Long = System.currentTimeMillis()): Map<String, Any?> =
    when (this) {
        is TrustPinAttestState.Unavailable -> mapOf(AttestKey.STATE to "unavailable")
        is TrustPinAttestState.Attesting -> mapOf(AttestKey.STATE to "attesting")
        is TrustPinAttestState.Ready -> mapOf(
            AttestKey.STATE to "ready",
            AttestKey.EXPIRES_AT_MS to expiresAtMillis.toDouble(),
        )
        is TrustPinAttestState.Failed ->
            mapOf(AttestKey.STATE to "failed") + error.wireFields() + retryField(retryAtMillis, nowMillis)
    }

/** The map sent to JavaScript for this event: its name and its own fields. */
internal fun TrustPinAttestEvent.toWireMap(nowMillis: Long = System.currentTimeMillis()): Map<String, Any?> =
    when (this) {
        is TrustPinAttestEvent.KeyGenerated -> mapOf(AttestKey.EVENT to "keyGenerated")
        is TrustPinAttestEvent.KeyReplaced -> mapOf(AttestKey.EVENT to "keyReplaced", AttestKey.COUNT to count)
        is TrustPinAttestEvent.AttestationSucceeded ->
            mapOf(AttestKey.EVENT to "attestationSucceeded", AttestKey.DURATION_MS to durationMillis.toDouble())
        is TrustPinAttestEvent.Refused ->
            mapOf(AttestKey.EVENT to "refused") + retryField(retryAtMillis, nowMillis)
        is TrustPinAttestEvent.AttestationFailed ->
            mapOf(AttestKey.EVENT to "attestationFailed", AttestKey.REASONS to reasons) +
                retryField(retryAtMillis, nowMillis)
        is TrustPinAttestEvent.RefreshSucceeded ->
            mapOf(AttestKey.EVENT to "refreshSucceeded", AttestKey.DURATION_MS to durationMillis.toDouble())
        is TrustPinAttestEvent.RefreshFailed -> mapOf(AttestKey.EVENT to "refreshFailed") + error.wireFields()
        is TrustPinAttestEvent.WaitEntered ->
            mapOf(AttestKey.EVENT to "waitEntered", AttestKey.UNTIL_MS to untilMillis.toDouble())
        is TrustPinAttestEvent.WaitCleared -> mapOf(AttestKey.EVENT to "waitCleared")
        is TrustPinAttestEvent.DeviceUnsupported -> mapOf(AttestKey.EVENT to "deviceUnsupported")
        is TrustPinAttestEvent.VerifierUnavailable -> mapOf(AttestKey.EVENT to "verifierUnavailable")
        is TrustPinAttestEvent.AssertionSucceeded ->
            mapOf(AttestKey.EVENT to "assertionSucceeded", AttestKey.DURATION_MS to durationMillis.toDouble())
        is TrustPinAttestEvent.AssertionFailed -> mapOf(AttestKey.EVENT to "assertionFailed") + error.wireFields()
    }

private fun TrustPinAttestError.wireFields(): Map<String, Any?> = mapOf(
    AttestKey.CODE to code(),
    AttestKey.MESSAGE to message,
    AttestKey.REASONS to reasonList(),
)

/** Long.MAX_VALUE means no new attempt in this process: the key is left out. */
private fun retryField(retryAtMillis: Long, nowMillis: Long): Map<String, Any?> =
    if (retryAtMillis - nowMillis < NO_RETRY_THRESHOLD_MS) {
        mapOf(AttestKey.RETRY_AT_MS to retryAtMillis.toDouble())
    } else {
        emptyMap()
    }

/** Maps the JavaScript name to a level; unknown names turn logging off. */
internal fun String?.toAttestLogLevel(): TrustPinAttestLogLevel = when (this?.lowercase()) {
    "error" -> TrustPinAttestLogLevel.ERROR
    "warning" -> TrustPinAttestLogLevel.WARNING
    "info" -> TrustPinAttestLogLevel.INFO
    "debug" -> TrustPinAttestLogLevel.DEBUG
    else -> TrustPinAttestLogLevel.NONE
}

internal fun TrustPinAttestLogLevel.toWireName(): String = when (this) {
    TrustPinAttestLogLevel.NONE -> "none"
    TrustPinAttestLogLevel.ERROR -> "error"
    TrustPinAttestLogLevel.WARNING -> "warning"
    TrustPinAttestLogLevel.INFO -> "info"
    TrustPinAttestLogLevel.DEBUG -> "debug"
}

/** Exactly 64 hex characters as 32 bytes, or null. */
internal fun String.hexToBytes(): ByteArray? {
    if (length != 64) return null
    return ByteArray(32) { index ->
        substring(index * 2, index * 2 + 2).toIntOrNull(16)?.toByte() ?: return null
    }
}

internal fun nowMs(): Double = System.currentTimeMillis().toDouble()
