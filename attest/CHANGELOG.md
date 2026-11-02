# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [7.1.0] - 2026-11-02

### Added

- First release: TrustPin app attestation for React Native on iOS and
  Android, a thin wrapper of the native attestation modules 7.1.x
  (`TrustPinAttestKit`, `cloud.trustpin:kotlin-attest`). Requires
  `@trustpin/react-native` 7.1.x, React Native 0.85 (New Architecture), and a
  verifier at contract version 2 or newer (verifier 0.2.2 or later).
- The native init helper `TrustPinReactNativeAttest.start(...)`, called right
  after `TrustPinReactNative.start(...)`: it sets attestation up from the same
  `TrustPin-Info.plist` / `trustpin.json` as pinning. From then on React
  Native's `fetch`, `XMLHttpRequest` and axios requests to the attested hosts
  carry the `TrustPin-Attestation` header, added natively.
- `TrustPinAttest`: `prefetch`, `getToken`, `attestationHeaders`,
  `assertionHeaders`, `bindToHeader`, `setTokenBinding`, `getState`,
  `onStateChange`, `onEvent`, `onLogEvent`, `reset`, `setLogLevel`, and the
  header names `headerName` and `assertionHeaderName`.
- An Expo config plugin: adds the attestation keys to the configuration
  files, the App Attest entitlement, and the native init call.
- Debug tokens from the build, never from a file: on the iOS simulator and in
  debuggable Android builds.
