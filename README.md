# TrustPin SDK for React Native

[![npm](https://img.shields.io/npm/v/@trustpin/react-native.svg)](https://www.npmjs.com/package/@trustpin/react-native)
[![platform](https://img.shields.io/badge/platform-react--native-blue)](https://reactnative.dev)
[![platform](https://img.shields.io/badge/platform-ios%20%7C%20android-blue)](https://reactnative.dev)

SSL/TLS certificate pinning for **[TrustPin](https://trustpin.cloud)**, enforced
**inside the TLS handshake** by the native TrustPin SDKs. It protects your app's
React Native networking against man-in-the-middle attacks by validating server
certificates against cryptographically signed, remotely managed public-key pins.

> Get started at [TrustPin.cloud](https://trustpin.cloud) | Manage your projects in the [Cloud Console](https://app.trustpin.cloud)

Pinning is configured and activated in **native code, before any JavaScript
runs**, so it cannot be weakened from JS — including from over-the-air JS
updates. The JavaScript API is observe-only: it reports readiness and events but
holds no lever that disables or reconfigures pinning.

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Setup — Expo](#setup--expo)
- [Setup — bare React Native](#setup--bare-react-native)
- [Using the SDK](#using-the-sdk)
- [API reference](#api-reference)
- [Error handling](#error-handling)
- [Coverage and boundaries](#coverage-and-boundaries)
- [Example apps](#example-apps)
- [License](#license)

## Requirements

| | Minimum |
|---|---|
| React Native | **0.85** (New Architecture only) |
| iOS | 15.0+ |
| Android | minSdk 25 (Android 7.1), **Kotlin 2.3.0** |
| Node | 22.11+ |

This package targets the current React Native app model and is intended for
application integrations rather than multi-tenant library consumption. macOS
support will follow once react-native-macos reaches the RN 0.85 line.

## Installation

```bash
npm install @trustpin/react-native
# or
yarn add @trustpin/react-native
```

Then follow the setup for your project type below. Get your credentials by
creating a project in the [TrustPin Cloud Console](https://app.trustpin.cloud):
an **Organization ID**, a **Project ID**, and a base64 **Public Key**.

## Setup — Expo

Add the config plugin to `app.json` / `app.config.js` with your credentials:

```json
{
  "expo": {
    "plugins": [
      ["@trustpin/react-native", {
        "organizationId": "your-org-id",
        "projectId": "your-project-id",
        "publicKey": "LS0tLS1CRUdJTi...",
        "mode": "strict"
      }]
    ]
  }
}
```

Then generate the native projects:

```bash
npx expo prebuild
npx expo run:ios      # or: npx expo run:android
```

The plugin writes the native config files, wires the native init call on both
platforms, and applies the Android toolchain requirements (Kotlin 2.3.0, minSdk
25). Expo Go cannot run pinning — it is native code — so use a development build.

Credentials are not secret, but they identify your project; keep them out of
public source with `app.config.js` and environment variables.

The config plugin accepts these props:

| Prop | Type | Notes |
|------|------|-------|
| `organizationId` | string | Required unless using `configFile`. |
| `projectId` | string | Required unless using `configFile`. |
| `publicKey` | string | Base64 verification key. Required unless using `configFile`. |
| `mode` | `strict` \| `permissive` | Defaults to `strict`. |
| `configurationUrl` | string | Optional. HTTPS endpoint for a self-hosted signed config. |
| `logLevel` | `none` \| `error` \| `info` \| `debug` | Passed to the native init helper, so it also covers startup logging. |
| `ios.configFile` | string | Path to an existing `TrustPin-Info.plist` instead of generating one. |
| `android.configFile` | string | Path to an existing `trustpin.json` instead of generating one. |
| `android.allowNonOemImages` | boolean | Default `false`. Allows release builds on non-OEM device OS images (real devices only, not emulators). |

Inline credentials and a `configFile` for the same platform are rejected rather
than silently resolved, and partial credentials are rejected too, naming what
is missing.

## Setup — bare React Native

Bare apps ship the native config files and add one native init call per
platform.

### 1. Ship the configuration files

**iOS** — add `ios/<YourApp>/TrustPin-Info.plist` and add it to the app target's
**Copy Bundle Resources** phase in Xcode:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>OrganizationId</key>
  <string>your-org-id</string>
  <key>ProjectId</key>
  <string>your-project-id</string>
  <key>PublicKey</key>
  <string>LS0tLS1CRUdJTi...</string>
  <key>Mode</key>
  <string>strict</string>
</dict>
</plist>
```

**Android** — add `android/app/src/main/assets/trustpin.json` (Gradle bundles it
automatically):

```json
{
  "organization_id": "your-org-id",
  "project_id": "your-project-id",
  "public_key": "LS0tLS1CRUdJTi...",
  "mode": "strict"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| organization ID | yes | non-empty string |
| project ID | yes | non-empty string |
| public key | yes | base64-encoded verification key |
| mode | no | `strict` (default, production) or `permissive` |
| configuration URL | no | HTTPS URL for a self-hosted signed config |

### 2. Call the native init helper

TrustPin is bootstrapped during native app startup, before the JavaScript
runtime does any networking.

**iOS** — in your native app bootstrap, such as `AppDelegate.swift`:

```swift
import TrustPinReactNative

func application(
  _ application: UIApplication,
  didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
) -> Bool {
  TrustPinReactNative.start()          // or: .start(logLevel: .debug)
  // ...existing React Native setup...
}
```

**Android** — in your native app bootstrap, such as `MainApplication.kt`:

```kotlin
import cloud.trustpin.reactnative.TrustPinReactNative

override fun onCreate() {
  TrustPinReactNative.start(this)      // or: .start(this, TrustPinLogLevel.DEBUG)
  super.onCreate()
  loadReactNative(this)
}
```

### 3. Android — align the Kotlin toolchain

The native runtime requires an Android Kotlin toolchain version compatible with
its shipped metadata. In your Android Gradle setup, align the Kotlin plugin
version used by the app build with the runtime requirement.

```groovy
buildscript {
    ext {
        kotlinVersion = "2.3.0"
        minSdkVersion = 25   // TrustPin requires 25; RN's default is 24
    }
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0")
    }
}
```

Then `cd ios && pod install`, and rebuild the app.

## Using the SDK

Pinning is already active — ordinary requests are validated with no extra code:

```ts
// This request is pinned inside the TLS handshake. A pin mismatch fails it.
const response = await fetch('https://api.example.com/data');
```

The JavaScript API is for **observing** that enforcement. A common pattern is to
hold first requests until the signed configuration is verified, and to log
validation events:

```ts
import TrustPin from '@trustpin/react-native';

// Fail-closed readiness gate: resolves once the configuration is verified.
try {
  await TrustPin.awaitConfiguration(10_000);
} catch (error) {
  // Do NOT fall through to an unpinned client — treat this as a hard stop.
  console.error('TrustPin configuration unavailable', error);
}

// Definitive pin verdicts (domain + code + timestamp; no certificate material).
const subscription = TrustPin.onValidationEvent(event => {
  if (event.code) {
    console.warn(`Pinning rejected ${event.domain}: ${event.code}`);
  }
});
// subscription.remove() when you are done.
```

## API reference

Import the default export, or named members:

```ts
import TrustPin, { TrustPinError, TrustPinErrorCodes } from '@trustpin/react-native';
```

| Method | Description |
|--------|-------------|
| `awaitConfiguration(timeoutMs?)` | Fail-closed readiness gate. Resolves once the signed configuration is fetched, verified, and active. Rejects `FETCH_CERTIFICATE_TIMEOUT` on timeout. The native side clamps the timeout to 10–120 s. |
| `isConfigurationLoaded()` | `Promise<boolean>` — whether a validated configuration is currently loaded. |
| `validateConnection(host, port?, timeoutMs?)` | Manually validates the TLS certificate of `host:port` against the pins (`port` defaults to 443). Resolves on success, rejects with a stable code otherwise. |
| `setLogLevel(level)` | Sets native log verbosity: `'none' \| 'error' \| 'info' \| 'debug'`. |
| `onValidationEvent(listener)` | Subscribes to definitive pin verdicts. Returns `{ remove() }`. |
| `onLogEvent(listener)` | Subscribes to native TrustPin log output. Returns `{ remove() }`. |

Events buffered before JavaScript is alive (cold-start pin failures) are
replayed to the first subscriber of each stream.

```ts
interface TrustPinValidationEvent {
  domain: string;
  code: string | null;   // null = success; else a failure code (see below)
  timestampMs: number;
}

interface TrustPinLogEvent {
  level: 'error' | 'info' | 'debug';
  message: string;
  timestampMs: number;
}
```

The full generated API reference is published at
[trustpin-cloud.github.io/react-native.sdk](https://trustpin-cloud.github.io/react-native.sdk/modules.html).

## Error handling

Every rejection carries a stable string `code`. JS-side failures are a
`TrustPinError`; native rejections carry the same `{ code, message }` shape, so
`error.code` works uniformly:

```ts
import { TrustPinErrorCodes } from '@trustpin/react-native';

try {
  await TrustPin.validateConnection('api.example.com');
} catch (error) {
  switch (error.code) {
    case TrustPinErrorCodes.PINS_MISMATCH:        // certificate matched no pin — possible MITM
    case TrustPinErrorCodes.DOMAIN_NOT_REGISTERED: // strict mode: domain not in your config
    case TrustPinErrorCodes.ALL_PINS_EXPIRED:      // every pin for the domain has expired
    default:
      console.error(error.code, error.message);
  }
}
```

Common codes: `PINS_MISMATCH`, `ALL_PINS_EXPIRED`, `DOMAIN_NOT_REGISTERED`,
`INVALID_SERVER_CERT`, `FETCH_CERTIFICATE_TIMEOUT`, `INVALID_PROJECT_CONFIG`
(also raised if the native init helper was never wired), and `INVALID_ARGUMENTS`.
Android additionally surfaces `UNSUPPORTED_DEVICE`, `SETUP_IN_PROGRESS`,
`LOCK_TIMEOUT`, and `SSL_CONTEXT_SETUP_FAILED`.

## Example apps

Two runnable samples live in this repository:

- [`example/`](example) — bare React Native.
- [`example-expo/`](example-expo) — Expo dev-client, which doubles as the config
  plugin's living test.

## License

TrustPin Binary License Agreement — see [LICENSE](LICENSE).
