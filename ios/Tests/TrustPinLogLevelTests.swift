import XCTest
import TrustPinKit

/// Swift port of `TrustPinLogLevelTest.kt`. Covers the wire-name mapping used to
/// keep the native log level in sync with the JavaScript `TrustPinLogLevel`
/// union, and the case-insensitive / fallback parsing of incoming strings.
///
/// Parsed levels are compared by round-tripping back through `wireName(for:)`
/// rather than asserting on the enum directly, so the tests do not depend on
/// `TrustPinLogLevel` being `Equatable`. The mapping is bijective over
/// none/error/info/debug, so the wire name uniquely identifies the case.
final class TrustPinLogLevelTests: XCTestCase {

    func testWireNamesMatchTheJavaScriptUnion() {
        XCTAssertEqual(wireName(for: .none), "none")
        XCTAssertEqual(wireName(for: .error), "error")
        XCTAssertEqual(wireName(for: .info), "info")
        XCTAssertEqual(wireName(for: .debug), "debug")
    }

    func testKnownLevelStringsParseCaseInsensitively() {
        XCTAssertEqual(wireName(for: TrustPinLogLevel(wireName: "none")), "none")
        XCTAssertEqual(wireName(for: TrustPinLogLevel(wireName: "INFO")), "info")
        XCTAssertEqual(wireName(for: TrustPinLogLevel(wireName: "Debug")), "debug")
        XCTAssertEqual(wireName(for: TrustPinLogLevel(wireName: "error")), "error")
    }

    func testUnknownAndAbsentLevelsFallBackToError() {
        XCTAssertEqual(wireName(for: TrustPinLogLevel(wireName: "verbose")), "error")
        XCTAssertEqual(wireName(for: TrustPinLogLevel(wireName: "")), "error")
        XCTAssertEqual(wireName(for: TrustPinLogLevel(wireName: nil)), "error")
    }

    func testRoundTripIsStableForLevelsThatReachASink() {
        // `none` never reaches a sink (it only filters), so it is excluded here,
        // matching the Kotlin round-trip coverage.
        for name in ["error", "info", "debug"] {
            XCTAssertEqual(wireName(for: TrustPinLogLevel(wireName: name)), name)
        }
    }
}
