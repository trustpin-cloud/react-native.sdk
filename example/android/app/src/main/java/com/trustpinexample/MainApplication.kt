package com.trustpinexample

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import cloud.trustpin.kotlin.sdk.TrustPinLogLevel
import cloud.trustpin.reactnative.TrustPinReactNative

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    // Must run before loadReactNative: the OkHttp factory has to be installed
    // before React Native creates its networking client. Credentials come from
    // the bundled assets/trustpin.json.
    // Debug logging so the example surfaces pinning activity in Logcat.
    TrustPinReactNative.start(this, TrustPinLogLevel.DEBUG)

    super.onCreate()
    loadReactNative(this)
  }
}
