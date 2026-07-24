#!/usr/bin/env bash
# Runs the native iOS unit tests (ios/Tests/**) — the counterpart to
# `cd android && ./gradlew test`.
#
# First-time setup (only needed once, or after the target/Podfile changes):
#   ruby scripts/gen-ios-test-target.rb
#   (cd example/ios && pod install)
#
# Usage:
#   scripts/test-ios.sh                 # auto-selects a booted/available iPhone sim
#   scripts/test-ios.sh "iPhone 17"     # pick a simulator by name
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$REPO/example/ios"

if [[ -n "${1:-}" ]]; then
  DEST="platform=iOS Simulator,name=$1"
else
  UDID="$(xcrun simctl list devices available | grep -oE 'iPhone[^(]*\(([0-9A-F-]+)\)' | grep -oE '[0-9A-F-]{36}' | head -1)"
  [[ -n "$UDID" ]] || { echo "No available iOS Simulator found" >&2; exit 1; }
  DEST="platform=iOS Simulator,id=$UDID"
fi

echo "→ Testing on: $DEST"
cd "$IOS_DIR"
exec xcodebuild test \
  -workspace TrustPinExample.xcworkspace \
  -scheme TrustPinExample \
  -destination "$DEST" \
  -only-testing:TrustPinExampleTests \
  CODE_SIGNING_ALLOWED=NO
