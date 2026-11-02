#import "TrustPinReactNativeAttestModule.h"

#if __has_include(<TrustPinReactNativeAttest/TrustPinReactNativeAttest-Swift.h>)
#import <TrustPinReactNativeAttest/TrustPinReactNativeAttest-Swift.h>
#else
#import "TrustPinReactNativeAttest-Swift.h"
#endif

/// Rejects with the stable code; an attestation failure's reasons travel in
/// the error's userInfo, which React Native exposes as `error.userInfo`.
static void TrustPinAttestReject(RCTPromiseRejectBlock reject, NSString *code, NSString *message, NSArray<NSString *> *reasons)
{
  NSError *error = [NSError errorWithDomain:@"cloud.trustpin.reactnative.attest"
                                       code:0
                                   userInfo:@{ @"reasons" : reasons ?: @[] }];
  reject(code, message, error);
}

#define TP_REJECT ^(NSString *code, NSString *message, NSArray<NSString *> *reasons) { \
  TrustPinAttestReject(reject, code, message, reasons);                               \
}

@implementation TrustPinReactNativeAttestModule

RCT_EXPORT_MODULE(TrustPinReactNativeAttest)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    // Route hub events through this instance's codegen emitters. Weak: the
    // hub outlives host reloads; a gone module simply drops the event.
    __weak TrustPinReactNativeAttestModule *weakSelf = self;
    [TrustPinAttestBridge attachEmittersWithState:^(NSDictionary *value) {
      [weakSelf emitOnStateChange:value];
    } event:^(NSDictionary *value) {
      [weakSelf emitOnEvent:value];
    } log:^(NSDictionary *value) {
      [weakSelf emitOnLogEvent:value];
    }];
  }
  return self;
}

- (void)prefetch:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinAttestBridge prefetchWithResolve:resolve reject:TP_REJECT];
}

- (void)getToken:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinAttestBridge getTokenWithResolve:resolve reject:TP_REJECT];
}

- (void)attestationHeaders:(NSString *)url
                    method:(NSString *)method
                   headers:(NSDictionary *)headers
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinAttestBridge attestationHeaders:url method:method headers:headers resolve:resolve reject:TP_REJECT];
}

- (void)assertionHeaders:(NSString *)payloadDigestHex
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinAttestBridge assertionHeaders:payloadDigestHex resolve:resolve reject:TP_REJECT];
}

- (void)setTokenBinding:(NSString *_Nullable)value
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinAttestBridge setTokenBinding:value resolve:resolve reject:TP_REJECT];
}

- (void)bindToHeader:(NSString *_Nullable)name
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinAttestBridge bindToHeader:name resolve:resolve reject:TP_REJECT];
}

- (void)getState:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinAttestBridge getStateWithResolve:resolve reject:TP_REJECT];
}

- (void)reset:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinAttestBridge resetWithResolve:resolve reject:TP_REJECT];
}

- (void)setLogLevel:(NSString *)level
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinAttestBridge setLogLevel:level resolve:resolve reject:TP_REJECT];
}

- (void)flushEarlyEvents
{
  [TrustPinAttestBridge flushEarlyEvents];
}

- (void)flushEarlyLogEvents
{
  [TrustPinAttestBridge flushEarlyLogEvents];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeTrustPinReactNativeAttestSpecJSI>(params);
}

@end
