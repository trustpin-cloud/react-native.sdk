# TrustPin React Native SDK — bare example app

A stock React Native 0.85 app consuming both packages from source (`file:..`,
`file:../attest`).
It exercises the whole JavaScript surface: the readiness gate, configuration
state, manual validation, log verbosity, and both event streams — plus an
ordinary `fetch` that is pinned without any per-request opt-in.

## Setup

1. Install dependencies:

   ```sh
   npm install          # in the repository root
   cd example && npm install
   ```

2. Add credentials from https://app.trustpin.cloud. The real files are
   gitignored, so copy the templates:

   ```sh
   cp ios/TrustPinExample/TrustPin-Info.plist.example \
      ios/TrustPinExample/TrustPin-Info.plist
   cp android/app/src/main/assets/trustpin.json.example \
      android/app/src/main/assets/trustpin.json
   ```

   Fill in the organization id, project id and base64 public key. On iOS,
   add `TrustPin-Info.plist` to the app target's **Copy Bundle Resources**
   phase in Xcode; the native loader reads it from the app bundle. Android
   picks up `assets/trustpin.json` automatically.

   Without credentials the app still runs: setup fails, the failure appears in
   the log stream, and every HTTPS request is refused — enforcement is
   fail-closed by design.

   For app attestation, also fill in the attestation keys of the templates:
   your verifier's URL and the hosts that receive the header (and, on
   Android with Play Integrity, the Google Cloud project number).

3. For attestation on devices, the app uses the native samples' identifiers,
   which the sample policy lists: bundle ID `cloud.trustpin.swift.testapp`
   (team `Z24JQDN8PT`, App Attest entitlement `development`) and application
   id `cloud.trustpin.android.sample`, signed with the machine's
   `~/.android/debug.keystore` when there is one. It replaces the native
   samples on a device. On simulators and emulators, use a debug token:
   `TRUSTPIN_DEBUG_TOKEN` in the Xcode scheme's environment, or
   `-PtrustpinDebugToken=<token>` for Gradle.

4. Run it:

   ```sh
   npm run ios
   npm run android
   ```

## What to look for

- **Cold-start events.** The app subscribes on mount; anything the native side
  recorded before JavaScript was alive is replayed into the log view.
- **`fetch` is pinned.** The fetch button uses plain `fetch()`. Pinning runs
  inside the TLS handshake, so a mismatched pin fails the request itself.
- **Two tabs.** **Pinning** and **Attestation**, each with its own log, as
  in the native and Flutter samples.
- **Attestation is native too.** The **Attestation** tab's protected
  call is a plain `fetch`: the `TrustPin-Attestation` header is added natively
  for the attested hosts. Enter your sample API's URL and demo credentials in
  the card. The sensitive call adds `TrustPinAttest.assertionHeaders(...)`
  over the body's SHA-256 (`POST /transfer`); events show as `[Event]` lines
  in the Attestation Log.
- **JavaScript cannot weaken pinning.** There is no setup call, no enforcement
  toggle, and no certificate material in the API. Editing this app's JS — or
  shipping an OTA update — cannot turn pinning off.

## Native bootstrap notes

The app starts TrustPin during native startup and keeps the JS surface
observe-only. The example is intentionally minimal so it stays focused on
post-startup behavior and event handling.
