#import "TrustPinReactNativeModule.h"

#if __has_include(<TrustPinReactNative/TrustPinReactNative-Swift.h>)
#import <TrustPinReactNative/TrustPinReactNative-Swift.h>
#else
#import "TrustPinReactNative-Swift.h"
#endif

@implementation TrustPinReactNativeModule

RCT_EXPORT_MODULE(TrustPinReactNative)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    // Route hub events through this instance's codegen emitters. Weak: the
    // hub outlives host reloads; a gone module simply drops the event.
    __weak TrustPinReactNativeModule *weakSelf = self;
    [TrustPinBridge attachEmittersWithValidation:^(NSDictionary *event) {
      [weakSelf emitOnValidationEvent:event];
    } log:^(NSDictionary *event) {
      [weakSelf emitOnLogEvent:event];
    }];
  }
  return self;
}

- (void)awaitConfiguration:(NSNumber *)timeoutMs
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinBridge awaitConfiguration:timeoutMs
                             resolve:resolve
                              reject:^(NSString *code, NSString *message) {
                                reject(code, message, nil);
                              }];
}

- (void)isConfigurationLoaded:(RCTPromiseResolveBlock)resolve
                       reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinBridge isConfigurationLoadedWithResolve:resolve
                                            reject:^(NSString *code, NSString *message) {
                                              reject(code, message, nil);
                                            }];
}

- (void)validateConnection:(NSString *)host
                      port:(double)port
                 timeoutMs:(NSNumber *)timeoutMs
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinBridge validateConnection:host
                                port:(NSInteger)port
                           timeoutMs:timeoutMs
                             resolve:resolve
                              reject:^(NSString *code, NSString *message) {
                                reject(code, message, nil);
                              }];
}

- (void)setLogLevel:(NSString *)level
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  [TrustPinBridge setLogLevel:level
                      resolve:resolve
                       reject:^(NSString *code, NSString *message) {
                         reject(code, message, nil);
                       }];
}

- (void)flushEarlyValidationEvents
{
  [TrustPinBridge flushEarlyValidationEvents];
}

- (void)flushEarlyLogEvents
{
  [TrustPinBridge flushEarlyLogEvents];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeTrustPinReactNativeSpecJSI>(params);
}

@end
