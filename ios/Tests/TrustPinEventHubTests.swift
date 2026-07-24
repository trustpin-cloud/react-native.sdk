import XCTest

/// Swift port of `TrustPinEventHubTest.kt`. Verifies the cold-start buffering,
/// independent per-stream replay, at-most-once flush, and bounded-ring
/// behaviour of `TrustPinEventHub`.
///
/// The hub does every mutation on its serial queue via `async`, so each phase
/// calls `syncForTesting()` to drain that queue before the collectors are read.
final class TrustPinEventHubTests: XCTestCase {

    private var validation: [[String: Any]] = []
    private var logs: [[String: Any]] = []

    private var hub: TrustPinEventHub { .shared }

    override func setUp() {
        super.setUp()
        hub.resetForTesting()
        validation.removeAll()
        logs.removeAll()
    }

    override func tearDown() {
        hub.resetForTesting()
        super.tearDown()
    }

    private func attach() {
        hub.attach(
            emitValidation: { [weak self] in self?.validation.append($0) },
            emitLog: { [weak self] in self?.logs.append($0) }
        )
    }

    private func validationEvent(_ domain: String) -> [String: Any] {
        [
            TrustPinEventKey.domain: domain,
            TrustPinEventKey.code: "PINS_MISMATCH",
            TrustPinEventKey.timestampMs: 1.0,
        ]
    }

    private func domains(_ events: [[String: Any]]) -> [String] {
        events.compactMap { $0[TrustPinEventKey.domain] as? String }
    }

    private func messages(_ events: [[String: Any]]) -> [String] {
        events.compactMap { $0[TrustPinEventKey.message] as? String }
    }

    func testEventsRecordedBeforeFlushAreBufferedNotEmitted() {
        attach()
        hub.recordValidation(validationEvent("a.example.com"))
        hub.syncForTesting()

        XCTAssertTrue(validation.isEmpty, "nothing may be emitted before the replay trigger")

        hub.flushValidation()
        hub.flushLog()
        hub.syncForTesting()

        XCTAssertEqual(validation.count, 1)
        XCTAssertEqual(validation.first?[TrustPinEventKey.domain] as? String, "a.example.com")
    }

    func testColdStartEventsSurviveWhenModuleAttachesLater() {
        // Enforcement runs before JavaScript exists: events recorded with no
        // emitters attached must still reach the first subscriber.
        hub.recordValidation(validationEvent("early.example.com"))
        attach()
        hub.flushValidation()
        hub.flushLog()
        hub.syncForTesting()

        XCTAssertEqual(domains(validation), ["early.example.com"])
    }

    func testReplayPreservesOrderAcrossBothStreams() {
        attach()
        hub.recordValidation(validationEvent("first.example.com"))
        hub.recordValidation(validationEvent("second.example.com"))
        hub.recordLog([TrustPinEventKey.message: "one"])
        hub.recordLog([TrustPinEventKey.message: "two"])

        hub.flushValidation()
        hub.flushLog()
        hub.syncForTesting()

        XCTAssertEqual(domains(validation), ["first.example.com", "second.example.com"])
        XCTAssertEqual(messages(logs), ["one", "two"])
    }

    func testEventsAfterFlushAreDeliveredLive() {
        attach()
        hub.flushValidation()
        hub.flushLog()
        hub.syncForTesting()

        hub.recordValidation(validationEvent("live.example.com"))
        hub.syncForTesting()

        XCTAssertEqual(domains(validation), ["live.example.com"])
    }

    func testEachStreamReplaysIndependently() {
        // A shared trigger would drain the log backlog while JavaScript had no
        // log listener attached yet, losing those events.
        hub.recordValidation(validationEvent("v.example.com"))
        hub.recordLog([TrustPinEventKey.message: "buffered"])
        attach()

        hub.flushValidation()
        hub.syncForTesting()
        XCTAssertEqual(validation.count, 1)
        XCTAssertTrue(logs.isEmpty, "the log stream must wait for its own trigger")

        hub.flushLog()
        hub.syncForTesting()
        XCTAssertEqual(messages(logs), ["buffered"])
    }

    func testFlushReplaysAtMostOncePerProcess() {
        attach()
        hub.recordValidation(validationEvent("once.example.com"))

        hub.flushValidation()
        hub.flushLog()
        hub.flushValidation()
        hub.flushLog()
        hub.syncForTesting()

        XCTAssertEqual(validation.count, 1, "a second flush must not replay the buffer again")
    }

    func testBufferDropsOldestEventsBeyondCapacity() {
        for i in 0..<40 { hub.recordValidation(validationEvent("host-\(i)")) }
        attach()
        hub.flushValidation()
        hub.flushLog()
        hub.syncForTesting()

        XCTAssertEqual(validation.count, 32)
        XCTAssertEqual(validation.first?[TrustPinEventKey.domain] as? String, "host-8", "oldest events drop first")
        XCTAssertEqual(validation.last?[TrustPinEventKey.domain] as? String, "host-39")
    }
}
