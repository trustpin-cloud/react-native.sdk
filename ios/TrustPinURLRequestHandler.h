#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTURLRequestHandler.h>

NS_ASSUME_NONNULL_BEGIN

/// The scoped request handler: registered through
/// codegen (`codegenConfig.ios.modulesConformingToProtocol`) so bridgeless
/// React Native appends it to the RCTNetworking handler list, no swizzling,
/// no app code. Claims `https` only, at a priority that deterministically
/// outranks the built-in RCTHTTPRequestHandler (priority 0); all session work
/// is delegated to the Swift enforcement core.
@interface TrustPinURLRequestHandler : NSObject <RCTBridgeModule, RCTURLRequestHandler>
@end

NS_ASSUME_NONNULL_END
