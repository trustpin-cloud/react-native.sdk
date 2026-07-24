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
    assert_contains "$delegate" 'import TrustPinReactNative' "import injected"

    # Pinning has to start before React Native builds anything.
    start_line=$(grep -n 'TrustPinReactNative.start(' "$delegate" | head -1 | cut -d: -f1)
    factory_line=$(grep -n 'ReactNativeFactory(' "$delegate" | head -1 | cut -d: -f1 || true)
    if [ -n "$factory_line" ] && [ "$start_line" -ge "$factory_line" ]; then
      fail "init call is at line $start_line, after the React factory at line $factory_line"
    fi
    pass "init call precedes the React Native factory"
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
