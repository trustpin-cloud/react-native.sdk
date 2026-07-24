#import "TrustPinURLRequestHandler.h"

#import <React/RCTURLRequestDelegate.h>

#if __has_include(<TrustPinReactNative/TrustPinReactNative-Swift.h>)
#import <TrustPinReactNative/TrustPinReactNative-Swift.h>
#else
#import "TrustPinReactNative-Swift.h"
#endif

/// Adapts one request's `RCTURLRequestDelegate` (+ its task token) to the
/// Swift coordinator's per-task sink protocol.
@interface TrustPinDelegateSink : NSObject <TrustPinRequestSink>
- (instancetype)initWithDelegate:(id<RCTURLRequestDelegate>)delegate
                           token:(NSURLSessionDataTask *)token;
@end

@implementation TrustPinDelegateSink {
  id<RCTURLRequestDelegate> _delegate;
  NSURLSessionDataTask *_token;
}

- (instancetype)initWithDelegate:(id<RCTURLRequestDelegate>)delegate
                           token:(NSURLSessionDataTask *)token
{
  if (self = [super init]) {
    _delegate = delegate;
    _token = token;
  }
  return self;
}

- (void)didSendDataWithTotalBytesSent:(int64_t)totalBytesSent
{
  [_delegate URLRequest:_token didSendDataWithProgress:totalBytesSent];
}

- (void)didReceiveResponse:(NSURLResponse *)response
{
  [_delegate URLRequest:_token didReceiveResponse:response];
}

- (void)didReceiveData:(NSData *)data
{
  [_delegate URLRequest:_token didReceiveData:data];
}

- (void)didCompleteWithError:(NSError *)error
{
  [_delegate URLRequest:_token didCompleteWithError:error];
}

@end

@implementation TrustPinURLRequestHandler

// Module name must match the string declared in package.json
// codegenConfig.ios.modulesConformingToProtocol.RCTURLRequestHandler. The
// generated dependency provider resolves it via moduleForName.
RCT_EXPORT_MODULE(TrustPinURLRequestHandler)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (float)handlerPriority
{
  // Built-in handlers implement no priority (0). Any value > 0 wins
  // deterministically for https; distinct priority also avoids the
  // debug-mode equal-priority conflict error.
  return 1000;
}

- (BOOL)canHandleRequest:(NSURLRequest *)request
{
  return [TrustPinSessionCoordinator.shared canHandle:request];
}

- (id)sendRequest:(NSURLRequest *)request withDelegate:(id<RCTURLRequestDelegate>)delegate
{
  // Two-phase: the sink owns the token before the task can produce callbacks.
  NSURLSessionDataTask *task = [TrustPinSessionCoordinator.shared makeTask:request];
  TrustPinDelegateSink *sink = [[TrustPinDelegateSink alloc] initWithDelegate:delegate token:task];
  [TrustPinSessionCoordinator.shared start:task sink:sink];
  return task;
}

- (void)cancelRequest:(NSURLSessionDataTask *)token
{
  [TrustPinSessionCoordinator.shared cancel:token];
}

@end
