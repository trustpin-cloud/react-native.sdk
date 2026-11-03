# TrustPin App Attestation for React Native

[![npm](https://img.shields.io/npm/v/@trustpin/react-native-attest.svg)](https://www.npmjs.com/package/@trustpin/react-native-attest)

Proves to your API that a request comes from **your genuine app on a genuine
device** that meets your policy. The device attests once per device key to
**your own** TrustPin verifier (Apple App Attest, Android Key Attestation or
Play Integrity), then renews a short-lived token cheaply. The token travels in
the `TrustPin-Attestation` header, and your API or gateway verifies it.

This package is a thin wrapper of the native attestation modules,
`TrustPinAttestKit` and `cloud.trustpin:kotlin-attest` 7.1.x. It is separate
from [`@trustpin/react-native`](https://www.npmjs.com/package/@trustpin/react-native),
the pinning package, which it requires: the SDK pins its calls to your
verifier, and adds the header to your app's requests.

Attestation is not runtime protection: it doesn't detect hooking, debugging,
tampering, root or jailbreak. Setup, the policy, deploying the verifier and
verifying tokens are covered at [docs.trustpin.cloud](https://docs.trustpin.cloud).

## Requirements

| | Minimum |
|---|---|
| React Native | **0.85** (New Architecture only) |
| `@trustpin/react-native` | the same version, **7.1.x** |
| iOS | 15.0+ |
| Android | minSdk 25 (Android 7.1), **Kotlin 2.3.0** |
| Verifier | contract version 2 or newer (verifier 1.0.0 or later) |

## Installation

```bash
npm install @trustpin/react-native @trustpin/react-native-attest
```

Both packages must be on the same version.

## Before you write code

- **The policy:** in the TrustPin console, list your app (Team ID and bundle
  ID, or package name and signing-certificate digests) and publish the policy.
- **Your verifier:** deployed and reachable from the app, and its host
  registered as a domain of your TrustPin project, because verifier calls are
  pinned. In strict mode an unregistered verifier host fails every call
  (`VERIFIER_UNAVAILABLE`) and no header is sent. An older verifier is refused
  (`VERIFIER_INCOMPATIBLE`).
- **iOS:** the **App Attest** capability, which adds the entitlement
  `com.apple.developer.devicecheck.appattest-environment`: `development` for
  builds run from Xcode, `production` for TestFlight and the App Store.
- **Android with Play Integrity:** the number of the Google Cloud project
  linked to the app in Play Console.

## Setup — Expo

List this plugin with the pinning one:

```json
{
  "expo": {
    "plugins": [
      ["@trustpin/react-native", { "organizationId": "…", "projectId": "…", "publicKey": "…" }],
      ["@trustpin/react-native-attest", {
        "verifierUrl": "https://attest.example.com",
        "attestedHosts": ["api.example.com"],
        "appAttestEnvironment": "development"
      }]
    ]
  }
}
```

`npx expo prebuild` adds the attestation keys to the configuration files the
pinning plugin writes, adds the App Attest entitlement, and starts attestation
right after pinning on both platforms. Expo Go cannot run it: use a
development build.

| Prop | Type | Notes |
|------|------|-------|
| `verifierUrl` | string | Your verifier, `https://` on a host name, without credentials, query or fragment. Set it with `attestedHosts`, or neither when your pinning `configFile`s already carry the keys. |
| `attestedHosts` | string[] | The hosts that receive the header: exact names, or `*.example.com` for exactly one label. No other host ever receives it. |
| `googleCloudProjectNumber` | string | Android, when the policy uses Play Integrity. |
| `appAttestEnvironment` | `development` \| `production` | The iOS entitlement's value. Defaults to `production`. |
| `logLevel` | `none` \| `error` \| `warning` \| `info` \| `debug` | Passed to the native init helper. |

## Setup — bare React Native

### 1. Add the attestation keys

To the files the pinning setup reads.

**iOS**, `TrustPin-Info.plist`:

```xml
<key>AttestVerifierURL</key>
<string>https://attest.example.com</string>
<key>AttestedHosts</key>
<array>
  <string>api.example.com</string>
</array>
```

**Android**, `assets/trustpin.json`:

```json
"attest_verifier_url": "https://attest.example.com",
"attested_hosts": ["api.example.com"],
"google_cloud_project_number": "123456789012"
```

Leave `google_cloud_project_number` out unless the policy uses Play
Integrity: with a number, the app contacts Google Play services from setup on.

### 2. Start attestation after pinning

**iOS**, `AppDelegate.swift`:

```swift
import TrustPinReactNative
import TrustPinReactNativeAttest

TrustPinReactNative.start()
TrustPinReactNativeAttest.start()       // or: .start(logLevel: .debug)
```

**Android**, `MainApplication.kt`:

```kotlin
import cloud.trustpin.reactnative.TrustPinReactNative
import cloud.trustpin.reactnative.attest.TrustPinReactNativeAttest

override fun onCreate() {
  TrustPinReactNative.start(this)
  TrustPinReactNativeAttest.start(this)  // or: .start(this, TrustPinAttestLogLevel.DEBUG)
  super.onCreate()
  loadReactNative(this)
}
```

Then `cd ios && pod install`, and rebuild. Setup makes no verifier call: it
validates the configuration and loads a device key from an earlier launch. A
failure never crashes the app; it shows in the log and the state, and requests
go out without the header.

## Send the header

**Nothing to change.** React Native's networking (`fetch`,
`XMLHttpRequest`, axios) carries the header to the attested hosts, added
natively:

- Requests are never failed by the SDK: when no token is ready in a short,
  bounded time, the request goes out **without** the header, and your API
  decides.
- A header the request already carries is kept.
- A redirect never carries the header to another host: each redirect gets the
  header for its own URL only.

For transports React Native's networking doesn't carry (gRPC, some WebSocket
clients), send `await TrustPinAttest.getToken()` in the `TrustPin-Attestation`
header. For other HTTP clients, `TrustPinAttest.attestationHeaders(url, { headers })`
returns the headers to add.

## Bind tokens to the user's session

```ts
import TrustPinAttest from '@trustpin/react-native-attest';

await TrustPinAttest.bindToHeader('Authorization');
TrustPinAttest.prefetch();
```

Each token is then bound to the request's `Authorization` value: only its
SHA-256 travels, and a token taken from one session is useless with another.
`setTokenBinding(value)` binds to a fixed value instead; each mode clears the
other. `setTokenBinding(null)` removes the fixed binding only;
`bindToHeader(null)` stops header binding and also clears a fixed binding. A
new binding renews the token with the same device key.

## Sensitive operations: assertions

For an operation that must come from this device, such as a payment, send an
assertion next to the token. It binds the device's attested key to a SHA-256
digest of your choice, typically the request body:

```ts
const body = JSON.stringify({ amount: '1.00', to: 'demo' });
const headers = { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' };
// With header binding, ask for this request's token first, so it is bound to
// this Authorization value; then add the assertion.
Object.assign(headers, await TrustPinAttest.attestationHeaders(url, { method: 'POST', headers }));
Object.assign(headers, await TrustPinAttest.assertionHeaders(sha256(body))); // 32 bytes
await fetch(url, { method: 'POST', headers, body });
```

- `assertionHeaders` takes the digest as 32 bytes (`Uint8Array` or
  `ArrayBuffer`) or 64 hex characters, and returns both headers: the token and
  `TrustPin-Assertion`. Each call produces a new assertion: one per operation.
- Your backend passes both headers and its own digest of what it received to
  your verifier.
- It rejects with `INVALID_DIGEST` for a digest that isn't 32 bytes, and with
  the usual codes when no token is available.

React Native has no built-in digest API; use your crypto library of choice.

## Simulators, emulators and debug tokens

Simulators and emulators can't produce real evidence. Pass a debug token from
the build, never from a file:

- **iOS simulator:** set `TRUSTPIN_DEBUG_TOKEN` in the Xcode scheme's
  environment, or pass `TrustPinReactNativeAttest.start(debugToken:)` from a
  debug-only build setting. Ignored on devices.
- **Android:** pass `TrustPinReactNativeAttest.start(this, level, debugToken)`
  from a debug-only `BuildConfig` field. Used only in debuggable builds. A
  debug token identifies the app by the package name it runs under, so a
  debug build with an `applicationIdSuffix` must be listed in the policy as
  its own package.

Your policy (**Allow debug tokens**) and your verifier must both allow debug
tokens. Their tokens carry `tp.env` `debug`, which production APIs refuse.

## State, events, errors and logging

```ts
const subscription = TrustPinAttest.onStateChange(state => {
  switch (state.status) {
    case 'unavailable': return console.log('No token yet');
    case 'attesting':   return console.log('Attesting…');
    case 'ready':       return console.log('Token ready until', new Date(state.expiresAtMs));
    case 'failed':      return console.log('Failed:', state.error.code, state.retryAtMs ?? 'after restart');
  }
});
```

- `onStateChange` delivers the current state first, then every change.
- After a failure no timer runs: nothing is tried before `retryAtMs`, and the
  next request, `getToken()` or `prefetch()` after it starts a new attempt. A
  `null` `retryAtMs` means no new attempt in this launch, until `reset()` or a
  restart, except `BINDING_REQUIRED`, which resumes once a binding is set.
- `onEvent` reports what the SDK did, for your monitoring: keys generated or
  replaced, attestations and renewals with their durations, refusals and waits
  with their end, unsupported devices, an unreachable verifier, and
  assertions. Events never contain a token, a key or a device identifier, and
  those from before JavaScript was running replay to the first subscriber.
  New event types can appear in a minor release: keep a default case.
- Errors are `TrustPinAttestError` with a stable `code`:

| Code | Meaning |
|---|---|
| `INVALID_CONFIGURATION` | A configuration value was rejected, or the file is missing |
| `ALREADY_INITIALIZED` | Setup ran twice |
| `NOT_SET_UP` | The native init helper never ran |
| `UNSUPPORTED_DEVICE` | This device can't attest the app, or new keys keep failing on it |
| `EVIDENCE_UNAVAILABLE` | The device can't produce the evidence the policy requires |
| `BINDING_REQUIRED` | The policy requires a binding and none is set yet |
| `ATTESTATION_FAILED` | The verifier refused; see `reasons` |
| `VERIFIER_UNAVAILABLE` | The verifier couldn't be reached, including when strict pinning refuses its host |
| `VERIFIER_INCOMPATIBLE` | The verifier is too old for this SDK; update it |
| `INVALID_DIGEST` | `assertionHeaders` got a digest that isn't 32 bytes |

  New codes can appear in a minor release: handle unknown ones.

- Logging is off by default: `setLogLevel('debug')` in development, and
  `onLogEvent` to route messages. Logs never contain tokens, key
  certificates, bound values or debug tokens.
- `reset()` discards the device key, so the token's `sub` changes. It's for
  support flows, not routine use, and does nothing before setup.

## Backups and privacy

- Device keys and key certificates are never backed up or synced: a restored
  app attests again.
- Evidence and tokens go only to your verifier, nothing to TrustPin.
- iOS: the native framework ships a privacy manifest (no tracking, no
  collected data).
- Android: with a Google Cloud project number configured, the app uses the
  Play Integrity API; declare it in Play Console's Data safety form.

## Example apps

The repository's [`example/`](https://github.com/trustpin-cloud/react-native.sdk/tree/main/example)
and [`example-expo/`](https://github.com/trustpin-cloud/react-native.sdk/tree/main/example-expo)
have an **Attestation** tab, next to the **Pinning** one: a protected call
with a token bound to the `Authorization` header, a sensitive call with an
assertion, sign-out and reset, with the SDK's state, events and logs in the
tab's own log.

## License

See [LICENSE](LICENSE).
