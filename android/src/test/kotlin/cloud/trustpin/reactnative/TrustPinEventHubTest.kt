package cloud.trustpin.reactnative

import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TrustPinEventHubTest {

    private val validation = mutableListOf<Map<String, Any?>>()
    private val logs = mutableListOf<Map<String, Any?>>()

    @BeforeTest
    fun setUp() {
        TrustPinEventHub.resetForTesting()
        validation.clear()
        logs.clear()
    }

    @AfterTest
    fun tearDown() {
        TrustPinEventHub.resetForTesting()
    }

    private fun attach() {
        TrustPinEventHub.attach(
            emitValidation = { validation += it },
            emitLog = { logs += it },
        )
    }

    private fun validationEvent(domain: String) = mapOf(
        EventKey.DOMAIN to domain,
        EventKey.CODE to "PINS_MISMATCH",
        EventKey.TIMESTAMP_MS to 1.0,
    )

    @Test
    fun `events recorded before flush are buffered, not emitted`() {
        attach()
        TrustPinEventHub.recordValidation(validationEvent("a.example.com"))

        assertTrue(validation.isEmpty(), "nothing may be emitted before the replay trigger")

        TrustPinEventHub.flushValidation()
        TrustPinEventHub.flushLog()

        assertEquals(1, validation.size)
        assertEquals("a.example.com", validation.single()[EventKey.DOMAIN])
    }

    @Test
    fun `cold-start events survive when the module attaches later`() {
        // Enforcement runs before JavaScript exists: events recorded with no
        // emitters attached must still reach the first subscriber.
        TrustPinEventHub.recordValidation(validationEvent("early.example.com"))
        attach()
        TrustPinEventHub.flushValidation()
        TrustPinEventHub.flushLog()

        assertEquals(listOf("early.example.com"), validation.map { it[EventKey.DOMAIN] })
    }

    @Test
    fun `replay preserves order across both streams`() {
        attach()
        TrustPinEventHub.recordValidation(validationEvent("first.example.com"))
        TrustPinEventHub.recordValidation(validationEvent("second.example.com"))
        TrustPinEventHub.recordLog(mapOf(EventKey.MESSAGE to "one"))
        TrustPinEventHub.recordLog(mapOf(EventKey.MESSAGE to "two"))

        TrustPinEventHub.flushValidation()
        TrustPinEventHub.flushLog()

        assertEquals(
            listOf("first.example.com", "second.example.com"),
            validation.map { it[EventKey.DOMAIN] },
        )
        assertEquals(listOf("one", "two"), logs.map { it[EventKey.MESSAGE] })
    }

    @Test
    fun `events after flush are delivered live`() {
        attach()
        TrustPinEventHub.flushValidation()
        TrustPinEventHub.flushLog()

        TrustPinEventHub.recordValidation(validationEvent("live.example.com"))

        assertEquals(listOf("live.example.com"), validation.map { it[EventKey.DOMAIN] })
    }

    @Test
    fun `each stream replays independently`() {
        // A shared trigger would drain the log backlog while JavaScript had no
        // log listener attached yet, losing those events.
        TrustPinEventHub.recordValidation(validationEvent("v.example.com"))
        TrustPinEventHub.recordLog(mapOf(EventKey.MESSAGE to "buffered"))
        attach()

        TrustPinEventHub.flushValidation()
        assertEquals(1, validation.size)
        assertTrue(logs.isEmpty(), "the log stream must wait for its own trigger")

        TrustPinEventHub.flushLog()
        assertEquals(listOf("buffered"), logs.map { it[EventKey.MESSAGE] })
    }

    @Test
    fun `flush replays at most once per process`() {
        attach()
        TrustPinEventHub.recordValidation(validationEvent("once.example.com"))

        TrustPinEventHub.flushValidation()
        TrustPinEventHub.flushLog()
        TrustPinEventHub.flushValidation()
        TrustPinEventHub.flushLog()

        assertEquals(1, validation.size, "a second flush must not replay the buffer again")
    }

    @Test
    fun `buffer drops the oldest events beyond capacity`() {
        repeat(40) { TrustPinEventHub.recordValidation(validationEvent("host-$it")) }
        attach()
        TrustPinEventHub.flushValidation()
        TrustPinEventHub.flushLog()

        assertEquals(32, validation.size)
        assertEquals("host-8", validation.first()[EventKey.DOMAIN], "oldest events drop first")
        assertEquals("host-39", validation.last()[EventKey.DOMAIN])
    }
}
