#!/usr/bin/env ruby
# frozen_string_literal: true

# Adds (idempotently) an app-hosted `TrustPinExampleTests` XCTest bundle to the
# example iOS project so the native Swift logic can be unit-tested — the iOS
# counterpart to `android/src/test/`.
#
# The bundle compiles the library's pure-logic sources directly (no @testable
# import, no pod-module testability needed) alongside the ported test files in
# `ios/Tests/`. TrustPinKit is resolved through the host app, which already
# links it; the nested Podfile target (see example/ios/Podfile) supplies the
# framework search paths so `import TrustPinKit` compiles.
#
# Run from anywhere:  ruby scripts/gen-ios-test-target.rb
# Then:               (cd example/ios && pod install)
#                     (cd example/ios && xcodebuild test -workspace TrustPinExample.xcworkspace \
#                        -scheme TrustPinExample -destination 'platform=iOS Simulator,name=iPhone 16')

require "xcodeproj"

REPO       = File.expand_path("..", __dir__)
PROJECT    = File.join(REPO, "example/ios/TrustPinExample.xcodeproj")
APP_TARGET = "TrustPinExample"
TEST_TARGET = "TrustPinExampleTests"

# Paths are relative to the .xcodeproj (example/ios); the library lives two up.
SOURCES_UNDER_TEST = %w[
  ../../ios/TrustPinEventHub.swift
  ../../ios/TrustPinListeners.swift
  ../../ios/TrustPinErrorMapping.swift
].freeze

TEST_SOURCES = %w[
  ../../ios/Tests/TrustPinEventHubTests.swift
  ../../ios/Tests/TrustPinLogLevelTests.swift
].freeze

project = Xcodeproj::Project.open(PROJECT)
app = project.targets.find { |t| t.name == APP_TARGET } or abort("missing #{APP_TARGET} target")

if project.targets.any? { |t| t.name == TEST_TARGET }
  puts "→ #{TEST_TARGET} already exists; refreshing its sources only"
  test = project.targets.find { |t| t.name == TEST_TARGET }
  test.source_build_phase.clear
else
  puts "→ creating #{TEST_TARGET}"
  test = project.new_target(:unit_test_bundle, TEST_TARGET, :ios, "15.1", nil, :swift)
  test.add_dependency(app)
end

group = project.main_group.find_subpath("TrustPinExampleTests", true)
group.set_source_tree("SOURCE_ROOT")

(TEST_SOURCES + SOURCES_UNDER_TEST).each do |path|
  ref = group.files.find { |f| f.path == path } || group.new_file(path)
  test.source_build_phase.add_file_reference(ref, true)
end

test.build_configurations.each do |config|
  s = config.build_settings
  s["PRODUCT_NAME"] = "$(TARGET_NAME)"
  s["PRODUCT_BUNDLE_IDENTIFIER"] = "cloud.trustpin.reactnative.TrustPinExampleTests"
  s["IPHONEOS_DEPLOYMENT_TARGET"] = "15.1"
  s["SWIFT_VERSION"] = "5.0"
  s["GENERATE_INFOPLIST_FILE"] = "YES"
  s["CODE_SIGNING_ALLOWED"] = "NO"
  # App-hosted: symbols (incl. TrustPinKit) resolve from the host at runtime.
  s["TEST_HOST"] =
    "$(BUILT_PRODUCTS_DIR)/#{APP_TARGET}.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/#{APP_TARGET}"
  s["BUNDLE_LOADER"] = "$(TEST_HOST)"
  # resetForTesting()/syncForTesting() are #if DEBUG.
  s["SWIFT_ACTIVE_COMPILATION_CONDITIONS"] = "$(inherited) DEBUG"
end

project.save
puts "✓ wrote #{TEST_TARGET} into #{File.basename(PROJECT)}"

# Add the test bundle to the shared scheme so `xcodebuild test -scheme TrustPinExample` runs it.
scheme_path = File.join(PROJECT, "xcshareddata/xcschemes/#{APP_TARGET}.xcscheme")
if File.exist?(scheme_path)
  scheme = Xcodeproj::XCScheme.new(scheme_path)
  already = scheme.test_action.testables.any? do |t|
    t.buildable_references.any? { |r| r.target_name == TEST_TARGET }
  end
  unless already
    scheme.test_action.add_testable(Xcodeproj::XCScheme::TestAction::TestableReference.new(test))
    scheme.save!
    puts "✓ added #{TEST_TARGET} to #{APP_TARGET}.xcscheme test action"
  end
else
  warn "! shared scheme not found at #{scheme_path}; add the test target manually or run in Xcode"
end
