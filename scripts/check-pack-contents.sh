#!/usr/bin/env bash
# Asserts the npm tarball carries everything a consumer needs and nothing that
# should never leave this repository.
#
#   scripts/check-pack-contents.sh [pack.json]
#
# With no argument it runs `npm pack --dry-run --json` itself. The `files`
# allowlist in package.json already aims for this; the point here is that the
# guarantee is asserted rather than assumed, because a slip publishes
# credentials from a public repository.
set -euo pipefail

cd "$(dirname "$0")/.."

PACK_JSON="${1:-}"
if [ -z "$PACK_JSON" ]; then
  PACK_JSON=$(mktemp)
  npm pack --dry-run --json > "$PACK_JSON" 2>/dev/null
fi

FILES=$(node -e "
  const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  console.log(d[0].files.map(f => f.path).join('\n'));
" "$PACK_JSON")

failures=0

require() {
  if grep -qxF -- "$1" <<< "$FILES"; then
    echo "✓ ships $1"
  else
    echo "✗ missing from the tarball: $1" >&2
    failures=$((failures + 1))
  fi
}

forbid() {
  local pattern="$1" why="$2"
  local hits
  hits=$(grep -E -- "$pattern" <<< "$FILES" || true)
  if [ -n "$hits" ]; then
    echo "✗ tarball contains $why:" >&2
    sed 's/^/    /' <<< "$hits" >&2
    failures=$((failures + 1))
  else
    echo "✓ no $why"
  fi
}

echo "$(wc -l <<< "$FILES" | tr -d ' ') files in the tarball"
echo

# Required — a consumer cannot build without these.
require "package.json"
require "TrustPinReactNative.podspec"
require "app.plugin.js"
require "LICENSE"
require "README.md"
require "lib/index.js"
require "lib/index.d.ts"
# Codegen reads the spec source from the installed package at build time.
require "src/index.ts"
require "src/NativeTrustPinReactNative.ts"
require "android/build.gradle"
require "android/src/main/AndroidManifest.xml"
require "android/src/main/kotlin/cloud/trustpin/reactnative/TrustPinReactNativeModule.kt"
require "android/src/main/kotlin/cloud/trustpin/reactnative/TrustPinReactNative.kt"
require "ios/TrustPinReactNative.swift"
require "ios/TrustPinReactNativeModule.mm"
require "ios/TrustPinURLRequestHandler.mm"
require "ios/TrustPinSessionCoordinator.swift"
require "plugin/build/index.js"

echo

# Forbidden — build output, test scaffolding, and anything project-specific.
forbid '^example' "example apps"
forbid '__tests__' "JavaScript tests"
forbid '^android/src/test' "Kotlin tests"
# plugin/build is the compiled config plugin and belongs in the tarball; the
# native build directories are Gradle and Xcode output and do not.
forbid '^(android|ios)/build/' "native build output"
forbid '\.gradle/' "Gradle caches"
forbid 'local\.properties' "local Android SDK paths"
forbid '\.(keystore|jks|p12|mobileprovision)$' "signing material"
forbid '(^|/)TrustPin-Info\.plist$' "iOS credentials"
forbid '(^|/)trustpin\.json$' "Android credentials"
forbid 'node_modules' "vendored dependencies"
forbid '\.gitkeep$' "placeholder files"

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures packaging problem(s) found" >&2
  exit 1
fi
echo "tarball contents look correct"
