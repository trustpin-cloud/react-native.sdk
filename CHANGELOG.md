# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [7.1.0] - 2026-11-02

### Added

- App attestation, with the new companion package
  `@trustpin/react-native-attest`. Once it is set up, React Native's `fetch`,
  `XMLHttpRequest` and axios requests to the attested hosts carry the
  `TrustPin-Attestation` header, added natively; a header the request already
  carries is kept, and a redirect carries only the header for its own URL.
  Without `@trustpin/react-native-attest`, nothing changes.

### Changed

- Updated iOS native SDK to 7.1.0 and Android native SDK to 7.1.0. Native
  dependencies now accept patch updates within 7.1.x only (CocoaPods `~>`,
  Gradle `strictly("[7.1.0, 7.2.0)")`).
- Android: React Native's OkHttp client is now configured through the native
  SDK's OkHttp adapter (`cloud.trustpin:trustpin-okhttp` 7.1.x): the same
  in-handshake pinning, plus the attestation interceptor.

### Fixed

- Expo config plugin: the iOS `import TrustPinReactNative` is no longer
  skipped when another line already starts with that text.

## [6.4.0] - 2026-10-03

### Changed

- Updated iOS native SDK to 6.4.0 and Android native SDK to 6.4.0 (no API
  changes; the bridge and config plugin are unaffected).
- `configurationUrl` must now point at a public host: the native SDK rejects
  loopback and private addresses.

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
