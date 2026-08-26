require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "TrustPinReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = { :type => "Commercial", :file => "LICENSE" }
  s.authors      = package["author"]
  s.source       = { :git => "https://github.com/trustpin-cloud/react-native.sdk.git", :tag => "v#{s.version}" }

  # macOS 13 follows when react-native-macos reaches the RN >= 0.85 floor
  # Darwin sources are kept macOS-compatible until then.
  s.platforms    = { :ios => "15.0" }
  s.swift_version = "6.2"

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  # ios/Tests/** are XCTest sources, hosted by the example app's
  # TrustPinExampleTests bundle. They must not compile into the pod library
  # target, which has no XCTest module ("No such module 'XCTest'").
  s.exclude_files = "ios/Tests/**/*"
  # The ObjC(+​+) adapter headers import the codegen spec (C++). Keeping them
  # out of the public umbrella lets Swift's underlying-module import compile
  # the pod's ObjC module as plain ObjC; nothing outside the pod needs these
  # classes — both are registered by module name (codegen provider / RCT).
  s.private_header_files = [
    "ios/TrustPinReactNativeModule.h",
    "ios/TrustPinURLRequestHandler.h",
  ]
  s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }

  # Native SDK, locked to the 6.3.x.
  s.dependency "TrustPinKit", "~> 6.3.0"

  # React Native core + New Architecture (TurboModule codegen) dependencies.
  install_modules_dependencies(s)
end
