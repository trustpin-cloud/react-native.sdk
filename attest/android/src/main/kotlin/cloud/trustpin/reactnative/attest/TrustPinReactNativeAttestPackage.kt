package cloud.trustpin.reactnative.attest

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Autolinking entry point for the attestation TurboModule. */
class TrustPinReactNativeAttestPackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == TrustPinReactNativeAttestModule.NAME) {
            TrustPinReactNativeAttestModule(reactContext)
        } else {
            null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        mapOf(
            TrustPinReactNativeAttestModule.NAME to ReactModuleInfo(
                TrustPinReactNativeAttestModule.NAME,
                TrustPinReactNativeAttestModule::class.java.name,
                false, // canOverrideExistingModule
                false, // needsEagerInit
                false, // isCxxModule
                true, // isTurboModule
            )
        )
    }
}
