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

/// The request token handed to React Native for one request. The data task
/// exists only once the request's attestation headers are known, so React
/// Native holds this token instead of the task.
@objc public final class TrustPinRequestToken: NSObject, @unchecked Sendable {
    fileprivate var task: URLSessionDataTask?
    fileprivate var cancelled = false
}

/// The scoped enforcement core: owns the one
/// `URLSession` that carries all React Native `https` traffic, with a session
/// delegate composed through `TrustPin.makeURLSessionDelegate(forwardingTo:)`
/// so pin validation runs inside the TLS handshake. Everything else mirrors
/// `RCTHTTPRequestHandler` behavior:
/// cookies, wifi-only override, upload progress as total bytes sent, redirect
/// cookie rebuild, completion-order bookkeeping.
///
/// Each request also carries the headers of the attestation provider
/// registered on `TrustPin.default` (none without one), and the TrustPin
/// delegate gives every redirect the headers for its own URL.
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
    @objc public func makeToken() -> TrustPinRequestToken {
        TrustPinRequestToken()
    }

    /// Asks the attestation provider for the request's headers, then starts
    /// its data task. A header the request already carries is kept.
    @objc public func start(
        _ request: URLRequest,
        token: TrustPinRequestToken,
        sink: TrustPinRequestSink
    ) {
        let pending = PendingRequest(request: request, token: token, sink: sink)
        Task {
            var attested = pending.request
            for (name, value) in await TrustPin.default.attestationHeaders(for: pending.request)
            where attested.value(forHTTPHeaderField: name) == nil {
                attested.setValue(value, forHTTPHeaderField: name)
            }
            self.resume(attested, token: pending.token, sink: pending.sink)
        }
    }

    @objc public func cancel(_ token: TrustPinRequestToken) {
        lock.lock()
        token.cancelled = true
        let task = token.task
        if let task {
            sinksByTaskIdentifier.removeValue(forKey: task.taskIdentifier)
        }
        lock.unlock()
        task?.cancel()
    }

    private func resume(_ request: URLRequest, token: TrustPinRequestToken, sink: TrustPinRequestSink) {
        let task = ensureSession().dataTask(with: request)
        lock.lock()
        guard !token.cancelled else {
            lock.unlock()
            return
        }
        token.task = task
        sinksByTaskIdentifier[task.taskIdentifier] = sink
        lock.unlock()
        task.resume()
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

/// One request between `start` and its data task. `@unchecked Sendable`: the
/// sink is only used once the task exists, from the session's serial queue.
private struct PendingRequest: @unchecked Sendable {
    let request: URLRequest
    let token: TrustPinRequestToken
    let sink: TrustPinRequestSink
}

/// The header TrustPin app attestation adds. The pinning SDK strips it from
/// every redirect and adds the one for the new URL.
private let attestationHeaderName = "TrustPin-Attestation"

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
        // Cookie header from shared storage. The TrustPin delegate ran first
        // and gave `request` the attestation header for its own URL, if any:
        // keep it.
        var nextRequest = request
        if let url = request.url {
            let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
            nextRequest.allHTTPHeaderFields = HTTPCookie.requestHeaderFields(with: cookies)
            if let attestation = request.value(forHTTPHeaderField: attestationHeaderName) {
                nextRequest.setValue(attestation, forHTTPHeaderField: attestationHeaderName)
            }
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
