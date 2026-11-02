#!/usr/bin/env bash
# Asserts that the Expo config plugin did its job in a prebuilt app.
#
#   scripts/assert-prebuild-output.sh <ios|android> <app-dir>
#
# Used by CI and runnable locally after `expo prebuild`. Checks behaviour the
# unit tests cannot: that the mods produced the right result against the real
# Expo template, in the real project layout.
set -euo pipefail

PLATFORM="${1:?usage: assert-prebuild-output.sh <ios|android> <app-dir>}"
APP_DIR="${2:?usage: assert-prebuild-output.sh <ios|android> <app-dir>}"

cd "$APP_DIR"

fail() {
  echo "✗ $*" >&2
  exit 1
}

pass() {
  echo "✓ $*"
}

assert_contains() {
  local file="$1" needle="$2" what="$3"
  [ -f "$file" ] || fail "$what: $file does not exist"
  grep -qF -- "$needle" "$file" || fail "$what: $file does not contain '$needle'"
  pass "$what"
}

case "$PLATFORM" in
  ios)
    plist=$(find ios -maxdepth 2 -name 'TrustPin-Info.plist' -print -quit)
    [ -n "$plist" ] || fail "no TrustPin-Info.plist was generated under ios/"
    grep -q '<key>OrganizationId</key>' "$plist" || fail "generated plist has no OrganizationId"
    pass "credentials written to $plist"

    # The native loader reads the plist from the app bundle, so writing the
    # file is not enough — it has to be a resource of the app target.
    pbxproj=$(find ios -maxdepth 2 -name 'project.pbxproj' -print -quit)
    [ -n "$pbxproj" ] || fail "no project.pbxproj found"
    grep -q 'TrustPin-Info.plist' "$pbxproj" || fail "plist is not referenced by the Xcode project"
    pass "plist registered in the Xcode project"

    delegate=$(find ios -maxdepth 2 -name 'AppDelegate.swift' -print -quit)
    [ -n "$delegate" ] || fail "no AppDelegate.swift found"
    assert_contains "$delegate" 'TrustPinReactNative.start(' "init call injected"
    grep -qx 'import TrustPinReactNative' "$delegate" || fail "import injected: no 'import TrustPinReactNative' line"
    pass "import injected"

    # Pinning has to start before React Native builds anything.
    start_line=$(grep -n 'TrustPinReactNative.start(' "$delegate" | head -1 | cut -d: -f1)
    factory_line=$(grep -n 'ReactNativeFactory(' "$delegate" | head -1 | cut -d: -f1 || true)
    if [ -n "$factory_line" ] && [ "$start_line" -ge "$factory_line" ]; then
      fail "init call is at line $start_line, after the React factory at line $factory_line"
    fi
    pass "init call precedes the React Native factory"

    # @trustpin/react-native-attest, when the app lists its plugin.
    if grep -q 'TrustPinReactNativeAttest.start(' "$delegate"; then
      attest_line=$(grep -n 'TrustPinReactNativeAttest.start(' "$delegate" | head -1 | cut -d: -f1)
      [ "$start_line" -lt "$attest_line" ] ||
        fail "attestation starts at line $attest_line, before pinning at line $start_line"
      pass "attestation starts right after pinning"
      grep -qx 'import TrustPinReactNativeAttest' "$delegate" || fail "no 'import TrustPinReactNativeAttest' line"
      pass "attestation import injected"
      entitlements=$(find ios -maxdepth 2 -name '*.entitlements' -print -quit)
      assert_contains "$entitlements" 'com.apple.developer.devicecheck.appattest-environment' "App Attest entitlement"
      if grep -q '<key>AttestVerifierURL</key>' "$plist"; then
        assert_contains "$plist" '<key>AttestedHosts</key>' "attestation keys written to the plist"
      fi
    fi
    ;;

  android)
    asset='android/app/src/main/assets/trustpin.json'
    [ -f "$asset" ] || fail "no $asset was generated"
    grep -q '"organization_id"' "$asset" || fail "generated asset has no organization_id"
    pass "credentials written to $asset"

    main_app=$(find android/app/src/main -name 'MainApplication.kt' -print -quit)
    [ -n "$main_app" ] || fail "no MainApplication.kt found"
    assert_contains "$main_app" 'TrustPinReactNative.start(' "init call injected"
    assert_contains "$main_app" 'import cloud.trustpin.reactnative.TrustPinReactNative' "import injected"

    # The OkHttp factory must be installed before React Native creates its
    # networking client, which loadReactNative triggers.
    start_line=$(grep -n 'TrustPinReactNative.start(' "$main_app" | head -1 | cut -d: -f1)
    load_line=$(grep -n 'loadReactNative(' "$main_app" | head -1 | cut -d: -f1)
    [ "$start_line" -lt "$load_line" ] ||
      fail "init call is at line $start_line, not before loadReactNative at line $load_line"
    pass "init call precedes loadReactNative"

    # @trustpin/react-native-attest, when the app lists its plugin.
    if grep -q 'TrustPinReactNativeAttest.start(' "$main_app"; then
      attest_line=$(grep -n 'TrustPinReactNativeAttest.start(' "$main_app" | head -1 | cut -d: -f1)
      [ "$start_line" -lt "$attest_line" ] && [ "$attest_line" -lt "$load_line" ] ||
        fail "attestation starts at line $attest_line, not between pinning ($start_line) and loadReactNative ($load_line)"
      pass "attestation starts right after pinning"
      assert_contains "$main_app" 'import cloud.trustpin.reactnative.attest.TrustPinReactNativeAttest' \
        "attestation import injected"
      if grep -q '"attest_verifier_url"' "$asset"; then
        assert_contains "$asset" '"attested_hosts"' "attestation keys written to the asset"
      fi
    fi

    assert_contains android/build.gradle \
      'org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0' "Kotlin plugin pinned on the classpath"
    grep -qE 'minSdkVersion *= *(2[5-9]|[3-9][0-9])' android/build.gradle ||
      fail "minSdkVersion is not pinned to 25 or higher in android/build.gradle"
    pass "minSdkVersion pinned to the SDK floor"
    ;;

  *)
    fail "unknown platform '$PLATFORM' (expected ios or android)"
    ;;
esac

echo "prebuild output looks correct for $PLATFORM"
