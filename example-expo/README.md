# TrustPin React Native SDK — Expo dev-client example

An Expo app that gets its pinning entirely from the config plugin. Nothing
native is hand-written here: `expo prebuild` generates the credential files,
injects both native init calls, and pins the Android toolchain. This example is
the plugin's living test.

Expo Go cannot run it — pinning is native code — so use a development build.

## Run it

```sh
npm install                 # in the repository root
npm run build               # builds plugin/build, which app.plugin.js requires
cd example-expo && npm install

TRUSTPIN_ORGANIZATION_ID=... \
TRUSTPIN_PROJECT_ID=... \
TRUSTPIN_PUBLIC_KEY=... \
  npx expo prebuild --clean

npx expo run:ios      # or: npx expo run:android
```

## Credentials

`app.config.js` reads the three values from the environment. Without them it
falls back to obvious `PLACEHOLDER_*` values so that prebuild and both native
builds still work — which is what lets CI compile-check the plugin with no
TrustPin project attached.

Placeholders are not a working configuration: pinning fails closed, every HTTPS
request is refused, and `awaitConfiguration` rejects with
`INVALID_PROJECT_CONFIG`. The app says so in a banner, and prebuild prints a
warning, because an app that looks fine while pinning nothing is the failure
worth shouting about.

To manage the native config files yourself instead, drop the inline props and
point the plugin at your files:

```js
['@trustpin/react-native', {
  ios: { configFile: './trustpin/TrustPin-Info.plist' },
  android: { configFile: './trustpin/trustpin.json' },
}]
```

Keep real credential files out of git — the repository's `.gitignore` already
blocks `TrustPin-Info.plist` and `trustpin.json` anywhere in the tree.

## What prebuild produces

`ios/` and `android/` are generated and gitignored. CI does not build this app —
pinning is verified by hand — so after a prebuild, check the plugin's work
yourself:

```sh
../scripts/assert-prebuild-output.sh ios .
../scripts/assert-prebuild-output.sh android .
```

That asserts the generated plist is registered in the Xcode target, the
generated `trustpin.json` exists, and the expected native startup/configuration
hooks are present. See the [Expo setup section in the root README](../README.md#setup--expo)
for the full list of config-plugin props.
