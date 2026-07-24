#import <TrustPinReactNativeSpec/TrustPinReactNativeSpec.h>

NS_ASSUME_NONNULL_BEGIN

/// Thin ObjC++ TurboModule adapter: conforms to the codegen-generated
/// spec and delegates every method to the Swift core. Registered under the
/// name `TrustPinReactNative`.
@interface TrustPinReactNativeModule : NativeTrustPinReactNativeSpecBase <NativeTrustPinReactNativeSpec>
@end

NS_ASSUME_NONNULL_END
