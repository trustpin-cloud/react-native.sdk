package cloud.trustpin.reactnative.attest

import cloud.trustpin.kotlin.attest.TrustPinAttestError
import cloud.trustpin.kotlin.attest.TrustPinAttestEvent
import cloud.trustpin.kotlin.attest.TrustPinAttestLogLevel
import cloud.trustpin.kotlin.attest.TrustPinAttestState
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

internal class AttestWireTest {

    private val now = 1_800_000_000_000L

    @Test
    fun `every error case has its own stable code`() {
        val codes = listOf(
            TrustPinAttestError.InvalidConfiguration,
            TrustPinAttestError.AlreadyInitialized,
            TrustPinAttestError.NotSetUp,
            TrustPinAttestError.UnsupportedDevice,
            TrustPinAttestError.EvidenceUnavailable,
            TrustPinAttestError.BindingRequired,
            TrustPinAttestError.AttestationFailed(emptyList()),
            TrustPinAttestError.VerifierUnavailable,
            TrustPinAttestError.VerifierIncompatible,
            TrustPinAttestError.InvalidDigest,
        ).map { it.code() }

        assertEquals(
            listOf(
                "INVALID_CONFIGURATION", "ALREADY_INITIALIZED", "NOT_SET_UP", "UNSUPPORTED_DEVICE",
                "EVIDENCE_UNAVAILABLE", "BINDING_REQUIRED", "ATTESTATION_FAILED", "VERIFIER_UNAVAILABLE",
                "VERIFIER_INCOMPATIBLE", "INVALID_DIGEST",
            ),
            codes,
        )
    }

    @Test
    fun `a failed state carries code, reasons and retry time`() {
        val map = TrustPinAttestState.Failed(
            TrustPinAttestError.AttestationFailed(listOf("app_not_allowed")),
            now + 30_000,
        ).toWireMap(now)

        assertEquals("failed", map[AttestKey.STATE])
        assertEquals("ATTESTATION_FAILED", map[AttestKey.CODE])
        assertEquals(listOf("app_not_allowed"), map[AttestKey.REASONS])
        assertEquals((now + 30_000).toDouble(), map[AttestKey.RETRY_AT_MS])
    }

    @Test
    fun `no retry in this process leaves the retry time out`() {
        val state = TrustPinAttestState.Failed(TrustPinAttestError.BindingRequired, Long.MAX_VALUE).toWireMap(now)
        val event = TrustPinAttestEvent.Refused(Long.MAX_VALUE).toWireMap(now)

        assertFalse(state.containsKey(AttestKey.RETRY_AT_MS))
        assertFalse(event.containsKey(AttestKey.RETRY_AT_MS))
        assertEquals("refused", event[AttestKey.EVENT])
    }

    @Test
    fun `events carry their name and fields`() {
        assertEquals(
            mapOf(AttestKey.EVENT to "keyReplaced", AttestKey.COUNT to 2),
            TrustPinAttestEvent.KeyReplaced(2).toWireMap(now),
        )
        assertEquals(
            mapOf(AttestKey.EVENT to "attestationSucceeded", AttestKey.DURATION_MS to 850.0),
            TrustPinAttestEvent.AttestationSucceeded(850).toWireMap(now),
        )
        assertEquals(
            mapOf(AttestKey.EVENT to "waitEntered", AttestKey.UNTIL_MS to (now + 600_000).toDouble()),
            TrustPinAttestEvent.WaitEntered(now + 600_000).toWireMap(now),
        )
        val failed = TrustPinAttestEvent.AssertionFailed(TrustPinAttestError.InvalidDigest).toWireMap(now)
        assertEquals("assertionFailed", failed[AttestKey.EVENT])
        assertEquals("INVALID_DIGEST", failed[AttestKey.CODE])
    }

    @Test
    fun `a digest crosses as 64 hex characters`() {
        val bytes = ByteArray(32) { it.toByte() }
        val hex = bytes.joinToString("") { "%02x".format(it) }

        assertContentEquals(bytes, hex.hexToBytes())
        assertNull("abc".hexToBytes())
        assertNull("zz".repeat(32).hexToBytes())
    }

    @Test
    fun `log levels round-trip and unknown turns logging off`() {
        for (level in TrustPinAttestLogLevel.entries) {
            assertEquals(level, level.toWireName().toAttestLogLevel())
        }
        assertEquals(TrustPinAttestLogLevel.NONE, "verbose".toAttestLogLevel())
    }
}
