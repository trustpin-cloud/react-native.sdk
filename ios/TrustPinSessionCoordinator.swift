import Foundation
import TrustPinKit

/// Per-task callbacks routed back to React Native's `RCTURLRequestDelegate`.
/// Implemented by the ObjC shim (`TrustPinURLRequestHandler.mm`); the Swift
/// side never sees React types.
@objc public protocol TrustPinRequestSink {
    func didSendData(totalBytesSent: Int64)
    func didReceiveResponse(_ response: URLResponse)
    func didReceiveData(_ data: Data)
    func didComplete(error: Error?)
}

/// The scoped enforcement core: owns the one
/// `URLSession` that carries all React Native `https` traffic, with a session
/// delegate composed through `TrustPin.makeURLSessionDelegate(forwardingTo:)`
/// so pin validation runs inside the TLS handshake. Everything else mirrors
/// `RCTHTTPRequestHandler` behavior:
/// cookies, wifi-only override, upload progress as total bytes sent, redirect
/// cookie rebuild, completion-order bookkeeping.
@objc public final class TrustPinSessionCoordinator: NSObject, @unchecked Sendable {

    @objc public static let shared = TrustPinSessionCoordinator()

    private let lock = NSLock()
    private var sinksByTaskIdentifier: [Int: TrustPinRequestSink] = [:]
    private var session: URLSession?
    private let forwardingDelegate = ForwardingDelegate()

    override private init() {
        super.init()
        forwardingDelegate.coordinator = self
    }

    /// `https` only: cleartext `http` stays on RN's default path, matching the
    /// SDK's scope boundary and avoiding any claim over schemes the
    /// TrustPin delegate cannot protect.
    @objc public func canHandle(_ request: URLRequest) -> Bool {
        request.url?.scheme?.lowercased() == "https"
    }

    /// Two-phase start so the shim can hand the token to its sink before any
    /// delegate callback can fire.
    @objc public func makeTask(_ request: URLRequest) -> URLSessionDataTask {
        ensureSession().dataTask(with: request)
    }

    @objc public func start(_ task: URLSessionDataTask, sink: TrustPinRequestSink) {
        lock.lock()
        sinksByTaskIdentifier[task.taskIdentifier] = sink
        lock.unlock()
        task.resume()
    }

    @objc public func cancel(_ task: URLSessionDataTask) {
        lock.lock()
        sinksByTaskIdentifier.removeValue(forKey: task.taskIdentifier)
        lock.unlock()
        task.cancel()
    }

    // MARK: Internals

    fileprivate func sink(for task: URLSessionTask) -> TrustPinRequestSink? {
        lock.lock()
        defer { lock.unlock() }
        return sinksByTaskIdentifier[task.taskIdentifier]
    }

    fileprivate func removeSink(for task: URLSessionTask) -> TrustPinRequestSink? {
        lock.lock()
        defer { lock.unlock() }
        return sinksByTaskIdentifier.removeValue(forKey: task.taskIdentifier)
    }

    private func ensureSession() -> URLSession {
        lock.lock()
        defer { lock.unlock() }
        if let session {
            return session
        }

        // Mirrors RCTHTTPRequestHandler's session setup, including the
        // documented `ReactNetworkForceWifiOnly` Info.plist override.
        let configuration = URLSessionConfiguration.default
        if let useWifiOnly = Bundle.main.object(forInfoDictionaryKey: "ReactNetworkForceWifiOnly") as? NSNumber {
            configuration.allowsCellularAccess = !useWifiOnly.boolValue
        }
        configuration.httpShouldSetCookies = true
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpCookieStorage = HTTPCookieStorage.shared

        // In-handshake pinning: TrustPin's delegate handles the TLS challenge
        // (fail-closed, inherited from the native SDK) and forwards every
        // other callback to ours.
        let delegate = TrustPin.makeURLSessionDelegate(forwardingTo: forwardingDelegate)

        let callbackQueue = OperationQueue()
        callbackQueue.maxConcurrentOperationCount = 1
        callbackQueue.name = "cloud.trustpin.reactnative.session"

        let created = URLSession(
            configuration: configuration,
            delegate: delegate,
            delegateQueue: callbackQueue
        )
        session = created
        return created
    }
}

/// The coordinator's own session delegate. The `forwardingTo:` target of the
/// TrustPin composition.
private final class ForwardingDelegate: NSObject, URLSessionDataDelegate, @unchecked Sendable {

    weak var coordinator: TrustPinSessionCoordinator?

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        // RCTHTTPRequestHandler forwards the running total, not the delta.
        coordinator?.sink(for: task)?.didSendData(totalBytesSent: totalBytesSent)
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        // Reset cookies on redirect, exactly as RCTHTTPRequestHandler does,
        // cookies are delegate-managed, so the next request rebuilds its
        // Cookie header from shared storage.
        var nextRequest = request
        if let url = request.url {
            let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
            nextRequest.allHTTPHeaderFields = HTTPCookie.requestHeaderFields(with: cookies)
        }
        completionHandler(nextRequest)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        coordinator?.sink(for: dataTask)?.didReceiveResponse(response)
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        coordinator?.sink(for: dataTask)?.didReceiveData(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        coordinator?.removeSink(for: task)?.didComplete(error: error)
    }
}
