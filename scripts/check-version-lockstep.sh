#!/usr/bin/env bash
# Asserts that every place carrying a version or floor agrees.
#
# Three independent locksteps, each of which can ship a broken SDK silently:
#   1. The native SDK line (plugin 6.2.x <-> native 6.2.x)
#   2. The Kotlin toolchain floor, required by the native SDK's metadata
#   3. The Android minSdk floor
#
# Run on every pull request, not only at release: drift is cheapest to fix in
# the change that introduces it.
set -euo pipefail

cd "$(dirname "$0")/.."

failures=0

fail() {
  echo "✗ $*" >&2
  failures=$((failures + 1))
}

pass() {
  echo "✓ $*"
}

extract() {
  # extract <file> <sed-expression> — prints the first capture or nothing
  sed -n -E "$2" "$1" | head -1
}

# ---------------------------------------------------------------- native line

PKG_VERSION=$(node -p "require('./package.json').version")
PKG_LINE=${PKG_VERSION%%-*}                      # drop any -dev suffix
PKG_MINOR=${PKG_LINE%.*}                         # 6.2.0 -> 6.2

POD_DEP=$(extract TrustPinReactNative.podspec 's/.*s\.dependency "TrustPinKit", "~> ([0-9]+\.[0-9]+\.[0-9]+)".*/\1/p')
GRADLE_LOWER=$(extract android/build.gradle 's/.*strictly\("\[([0-9]+\.[0-9]+\.[0-9]+), *([0-9]+\.[0-9]+\.[0-9]+)\)"\).*/\1/p')
GRADLE_UPPER=$(extract android/build.gradle 's/.*strictly\("\[([0-9]+\.[0-9]+\.[0-9]+), *([0-9]+\.[0-9]+\.[0-9]+)\)"\).*/\2/p')
PODFILE_LOCK=$(extract example/ios/Podfile.lock 's/.*- TrustPinKit \(([0-9]+\.[0-9]+\.[0-9]+)\).*/\1/p')

echo "native SDK line"
echo "  package.json          ${PKG_VERSION} (line ${PKG_MINOR})"
echo "  podspec dependency    ${POD_DEP:-<none>}"
echo "  gradle strictly       [${GRADLE_LOWER:-?}, ${GRADLE_UPPER:-?})"
echo "  example Podfile.lock  ${PODFILE_LOCK:-<none>}"

[ -n "$POD_DEP" ] || fail "podspec: no 'TrustPinKit, \"~> X.Y.Z\"' dependency found"
[ -n "$GRADLE_LOWER" ] || fail "android/build.gradle: no strictly(\"[X.Y.Z, X.Y.Z)\") range found"

if [ -n "$POD_DEP" ]; then
  [ "${POD_DEP%.*}" = "$PKG_MINOR" ] ||
    fail "podspec depends on TrustPinKit ${POD_DEP}, but package.json is on the ${PKG_MINOR} line"
  # A patch other than .0 would silently narrow the range below the whole minor.
  [ "${POD_DEP##*.}" = "0" ] ||
    fail "podspec should depend on '~> ${POD_DEP%.*}.0', not '~> ${POD_DEP}'"
fi

if [ -n "$GRADLE_LOWER" ]; then
  [ "${GRADLE_LOWER%.*}" = "$PKG_MINOR" ] ||
    fail "gradle range starts at ${GRADLE_LOWER}, but package.json is on the ${PKG_MINOR} line"
  expected_upper="${PKG_MINOR%.*}.$(( ${PKG_MINOR#*.} + 1 )).0"
  [ "$GRADLE_UPPER" = "$expected_upper" ] ||
    fail "gradle range ends at ${GRADLE_UPPER}, expected ${expected_upper} (the next minor)"
fi

if [ -n "$PODFILE_LOCK" ]; then
  [ "${PODFILE_LOCK%.*}" = "$PKG_MINOR" ] ||
    fail "example/ios/Podfile.lock pins TrustPinKit ${PODFILE_LOCK}; run pod update after bumping the line"
fi

# The package version must live in exactly one file.
grep -q 's\.version *= *package\["version"\]' TrustPinReactNative.podspec ||
  fail "podspec no longer derives s.version from package.json"

[ "$failures" -eq 0 ] && pass "native SDK line agrees everywhere"

# -------------------------------------------------------------- Kotlin floor

before=$failures
KOTLIN_LIB=$(extract android/build.gradle 's/.*def requiredKotlinVersion = "([0-9.]+)".*/\1/p')
KOTLIN_PLUGIN=$(extract plugin/src/types.ts "s/.*REQUIRED_KOTLIN_VERSION = '([0-9.]+)'.*/\1/p")
KOTLIN_EXAMPLE=$(extract example/android/build.gradle 's/.*kotlin-gradle-plugin:([0-9.]+)".*/\1/p')

echo
echo "Kotlin toolchain floor"
echo "  android/build.gradle       ${KOTLIN_LIB:-<none>}"
echo "  plugin/src/types.ts        ${KOTLIN_PLUGIN:-<none>}"
echo "  example/android/build.gradle ${KOTLIN_EXAMPLE:-<none>}"

[ -n "$KOTLIN_LIB" ] || fail "android/build.gradle: no requiredKotlinVersion found"
[ "$KOTLIN_PLUGIN" = "$KOTLIN_LIB" ] ||
  fail "config plugin pins Kotlin ${KOTLIN_PLUGIN}, library requires ${KOTLIN_LIB}"
[ "$KOTLIN_EXAMPLE" = "$KOTLIN_LIB" ] ||
  fail "bare example pins Kotlin ${KOTLIN_EXAMPLE}, library requires ${KOTLIN_LIB}"

# The version quoted in the error message must match, or users are told to set
# a version that still fails.
if [ -n "$KOTLIN_LIB" ]; then
  grep -q "kotlin-gradle-plugin:\${requiredKotlinVersion}" android/build.gradle ||
    fail "the Kotlin guard's error message hardcodes a version instead of interpolating requiredKotlinVersion"
fi

[ "$failures" -eq "$before" ] && pass "Kotlin floor agrees everywhere"

# -------------------------------------------------------------- minSdk floor

before=$failures
MINSDK_LIB=$(extract android/build.gradle 's/.*minSdk = ([0-9]+).*/\1/p')
MINSDK_PLUGIN=$(extract plugin/src/types.ts 's/.*MIN_SDK_VERSION = ([0-9]+).*/\1/p')
MINSDK_EXAMPLE=$(extract example/android/build.gradle 's/.*minSdkVersion = ([0-9]+).*/\1/p')

echo
echo "Android minSdk floor"
echo "  android/build.gradle         ${MINSDK_LIB:-<none>}"
echo "  plugin/src/types.ts          ${MINSDK_PLUGIN:-<none>}"
echo "  example/android/build.gradle ${MINSDK_EXAMPLE:-<none>}"

[ -n "$MINSDK_LIB" ] || fail "android/build.gradle: no minSdk found"
[ "$MINSDK_PLUGIN" = "$MINSDK_LIB" ] ||
  fail "config plugin raises minSdk to ${MINSDK_PLUGIN}, library requires ${MINSDK_LIB}"
[ "$MINSDK_EXAMPLE" = "$MINSDK_LIB" ] ||
  fail "bare example sets minSdk ${MINSDK_EXAMPLE}, library requires ${MINSDK_LIB}"

[ "$failures" -eq "$before" ] && pass "minSdk floor agrees everywhere"

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures lockstep problem(s) found" >&2
  exit 1
fi
echo "all version locksteps agree"
