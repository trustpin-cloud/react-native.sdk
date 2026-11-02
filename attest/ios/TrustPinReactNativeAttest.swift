import Foundation
import TrustPinAttestKit

/// The native init helper of app attestation, called right after
/// `TrustPinReactNative.start()` in
/// `AppDelegate.application(_:didFinishLaunchingWithOptions:)`:
///
/// ```swift
/// TrustPinReactNative.start()
/// TrustPinReactNativeAttest.start()
/// // or: TrustPinReactNativeAttest.start(logLevel: .debug)
/// ```
///
/// It reads `AttestVerifierURL` and `AttestedHosts` from the bundled
/// `TrustPin-Info.plist`, the file pinning reads, through the native SDK's own
/// loader, and sets up `TrustPinAttest.default`, which registers itself on the
/// pinning SDK's default instance. From then on React Native's HTTPS requests
/// to the attested hosts carry the `TrustPin-Attestation` header.
///
/// Setup failures never crash the host app: they surface through the log
/// stream and the state, and requests go out without the header.
@objc public final class TrustPinReactNativeAttest: NSObject {

    private static let installOnce: Void = {
        TrustPinAttest.setLogSink(TrustPinAttestLogForwarder())
        TrustPinAttest.default.setStateListener { state in
            TrustPinAttestEventHub.shared.recordState(state.wireMap)
        }
        TrustPinAttest.default.setEventListener { event in
            TrustPinAttestEventHub.shared.recordEvent(event.wireMap)
        }
    }()

    /// Swift entry point (the Expo config plugin injects this line).
    ///
    /// - Parameter debugToken: a debug token for the iOS simulator, from a
    ///   debug-only build setting; never from a bundled file. The native SDK
    ///   uses it only in its simulator build, and only when your policy and
    ///   your verifier allow debug tokens. A `TRUSTPIN_DEBUG_TOKEN` set in the
    ///   Xcode scheme wins.
    public static func start(logLevel: TrustPinAttestLogLevel = .error, debugToken: String? = nil) {
        _ = installOnce
        TrustPinAttest.default.set(logLevel: logLevel)
        exposeDebugToken(debugToken)

        Task {
            do {
                let configuration = try TrustPinAttestConfiguration.fromPlist()
                try await TrustPinAttest.default.setup(configuration)
            } catch {
                let rejection = attestRejection(from: error)
                TrustPinAttestEventHub.shared.recordLog([
                    AttestKey.level: "error",
                    AttestKey.message: "TrustPin attestation native init failed [\(rejection.code)]: \(rejection.message)",
                    AttestKey.timestampMs: attestNowMs(),
                ])
            }
        }
    }

    /// Objective-C entry point:
    /// `[TrustPinReactNativeAttest startWithLogLevelName:nil debugToken:nil]`.
    @objc public static func start(logLevelName: String?, debugToken: String?) {
        if let logLevelName, !logLevelName.isEmpty {
            start(logLevel: TrustPinAttestLogLevel(wireName: logLevelName), debugToken: debugToken)
        } else {
            start(debugToken: debugToken)
        }
    }
}

/// TrustPinAttestKit reads `TRUSTPIN_DEBUG_TOKEN` from the process environment,
/// and only in its simulator build. `react-native run-ios` doesn't apply Xcode
/// scheme variables, so the init helper can set it. Device builds don't
/// contain this code; a token already set in the scheme wins.
private func exposeDebugToken(_ token: String?) {
    #if targetEnvironment(simulator)
    guard let token, !token.isEmpty else { return }
    setenv("TRUSTPIN_DEBUG_TOKEN", token, 0)
    #endif
}

/// Forwards the module's log output into the event hub.
private final class TrustPinAttestLogForwarder: TrustPinAttestLogSink, @unchecked Sendable {
    func log(level: TrustPinAttestLogLevel, instanceId: String, message: String) {
        TrustPinAttestEventHub.shared.recordLog([
            AttestKey.level: level.wireName,
            AttestKey.message: message,
            AttestKey.timestampMs: attestNowMs(),
        ])
    }
}
