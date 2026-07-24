package cloud.trustpin.reactnative

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Autolinking entry point for the observe-only TurboModule. */
class TrustPinReactNativePackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == TrustPinReactNativeModule.NAME) {
            TrustPinReactNativeModule(reactContext)
        } else {
            null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        mapOf(
            TrustPinReactNativeModule.NAME to ReactModuleInfo(
                TrustPinReactNativeModule.NAME,
                TrustPinReactNativeModule::class.java.name,
                false, // canOverrideExistingModule
                false, // needsEagerInit
                false, // isCxxModule
                true, // isTurboModule
            )
        )
    }
}
