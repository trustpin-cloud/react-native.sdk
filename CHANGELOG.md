# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.2.0] - 2026-07-24

### Changed

- Updated iOS/macOS native SDK to 6.2.0 and Android native SDK to 6.2.0.
  Native dependencies now accept patch updates within 6.2.x instead of an
  exact pin (SwiftPM `upToNextMinor`, CocoaPods `~>`, Gradle
  `strictly("[6.2.0, 6.3.0)")`).
