package cloud.trustpin.reactnative

import cloud.trustpin.kotlin.sdk.TrustPinLogLevel
import kotlin.test.Test
import kotlin.test.assertEquals

class TrustPinLogLevelTest {

    @Test
    fun `wire names match the JavaScript union`() {
        assertEquals("none", TrustPinLogLevel.NONE.toWireName())
        assertEquals("error", TrustPinLogLevel.ERROR.toWireName())
        assertEquals("info", TrustPinLogLevel.INFO.toWireName())
        assertEquals("debug", TrustPinLogLevel.DEBUG.toWireName())
    }

    @Test
    fun `known level strings parse case-insensitively`() {
        assertEquals(TrustPinLogLevel.NONE, "none".toTrustPinLogLevel())
        assertEquals(TrustPinLogLevel.INFO, "INFO".toTrustPinLogLevel())
        assertEquals(TrustPinLogLevel.DEBUG, "Debug".toTrustPinLogLevel())
        assertEquals(TrustPinLogLevel.ERROR, "error".toTrustPinLogLevel())
    }

    @Test
    fun `unknown and absent levels fall back to error`() {
        assertEquals(TrustPinLogLevel.ERROR, "verbose".toTrustPinLogLevel())
        assertEquals(TrustPinLogLevel.ERROR, "".toTrustPinLogLevel())
        assertEquals(TrustPinLogLevel.ERROR, null.toTrustPinLogLevel())
    }

    @Test
    fun `round trip is stable for levels that reach a sink`() {
        listOf(TrustPinLogLevel.ERROR, TrustPinLogLevel.INFO, TrustPinLogLevel.DEBUG).forEach {
            assertEquals(it, it.toWireName().toTrustPinLogLevel())
        }
    }
}
