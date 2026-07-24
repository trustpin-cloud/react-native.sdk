import Foundation
import TrustPinKit

/// The one-line native init helper, called from
/// `AppDelegate.application(_:didFinishLaunchingWithOptions:)` before the
/// React Native factory is created:
///
/// ```swift
/// TrustPinReactNative.start()
/// // or: TrustPinReactNative.start(logLevel: .debug)
/// ```
///
/// The helper is zero-argument plus an optional log level: it loads the
/// bundled `TrustPin-Info.plist` via the native SDK's own loader, launches
/// the non-blocking `setup`, and installs the global validation listener +
/// log sink feeding the early-event buffer. The scoped request handler is
/// registered statically through codegen and needs no runtime step.
///
/// Setup failures never crash the host app: they surface through the log
/// event stream and native logs, and enforcement stays fail-closed.
@objc public final class TrustPinReactNative: NSObject {

    private static let installOnce: Void = {
        TrustPin.setValidationListener(validationForwarder)
        TrustPin.setLogSink(logForwarder)
    }()

    private static let validationForwarder = TrustPinValidationForwarder()
    private static let logForwarder = TrustPinLogForwarder()

    /// Swift entry point (Expo config plugin injects this line).
    public static func start(logLevel: TrustPinLogLevel = .error) {
        _ = installOnce
        TrustPin.default.set(logLevel: logLevel)

        Task {
            do {
                let configuration = try TrustPinConfiguration.fromPlist()
                try await TrustPin.default.setup(configuration)
            } catch {
                // ALREADY_INITIALIZED (JS reload cannot reach here but a
                // double native call can), config load and setup errors: log
                // and remain fail-closed; never crash the host app.
                let (code, message) = trustPinRejection(
                    from: error,
                    defaultCode: TrustPinErrorCode.invalidProjectConfig
                )
                TrustPinEventHub.shared.recordLog([
                    TrustPinEventKey.level: "error",
                    TrustPinEventKey.message: "TrustPin native init failed [\(code)]: \(message)",
                    TrustPinEventKey.timestampMs: trustPinNowMs(),
                ])
            }
        }
    }

    /// Objective-C entry point:
    /// `[TrustPinReactNative startWithLogLevelName:@"error"]` or
    /// `[TrustPinReactNative startWithLogLevelName:nil]`.
    ///
    /// Named `start` rather than `initialize` on purpose: a static
    /// `initialize()` on an NSObject subclass is shadowed by the Objective-C
    /// runtime's own `+initialize` hook, so `TrustPinReactNative.initialize()`
    /// compiles and silently does nothing — leaving the app unpinned.
    @objc public static func start(logLevelName: String?) {
        if let logLevelName, !logLevelName.isEmpty {
            start(logLevel: TrustPinLogLevel(wireName: logLevelName))
        } else {
            start()
        }
    }
}
