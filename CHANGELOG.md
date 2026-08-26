# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.3.0] - 2026-08-26

### Added

- Embedded configuration: a signed configuration bundled with the app, used
  only when no online source and no previously fetched configuration is
  available, typically the app's very first start during an outage. Expo apps
  set the config-plugin prop `embeddedConfigurationFile`, which copies the file
  into both native projects and writes `EmbeddedConfigurationFile` /
  `embedded_configuration_asset` into the generated config files; bare apps
  ship the file and add the key themselves. Intended only for apps whose
  bundled resources are protected by RASP; see "Embedded configuration" in the
  README.

### Changed

- Updated iOS native SDK to 6.3.0 and Android native SDK to 6.3.0.
- A configuration the SDK has fetched and validated is now retained on the
  device and remains usable after a process restart when every configuration
  source is unreachable.

## [6.2.0] - 2026-07-24

### Changed

- Updated iOS/macOS native SDK to 6.2.0 and Android native SDK to 6.2.0.
  Native dependencies now accept patch updates within 6.2.x instead of an
  exact pin (SwiftPM `upToNextMinor`, CocoaPods `~>`, Gradle
  `strictly("[6.2.0, 6.3.0)")`).
