require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "TrustPinReactNativeAttest"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = { :type => "Commercial", :file => "LICENSE" }
  s.authors      = package["author"]
  s.source       = { :git => "https://github.com/trustpin-cloud/react-native.sdk.git", :tag => "v#{s.version}" }

  s.platforms    = { :ios => "15.0" }
  s.swift_version = "6.2"

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.exclude_files = "ios/Tests/**/*"
  # The ObjC++ adapter header imports the codegen spec (C++); keeping it out of
  # the public umbrella lets Swift's underlying-module import compile the pod's
  # ObjC module as plain ObjC.
  s.private_header_files = ["ios/TrustPinReactNativeAttestModule.h"]
  s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }

  # Native attestation module, locked to the 7.1.x line, the same line as
  # @trustpin/react-native: it registers itself on the pinning SDK's default
  # instance, so both resolve one TrustPinKit.
  s.dependency "TrustPinAttestKit", "~> 7.1.0"
  s.dependency "TrustPinKit", "~> 7.1.0"

  # React Native core + New Architecture (TurboModule codegen) dependencies.
  install_modules_dependencies(s)
end
