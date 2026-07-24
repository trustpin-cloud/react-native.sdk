/**
 * Expo app config for the TrustPin example.
 *
 * Credentials come from the environment so this file can stay committed:
 *
 *   TRUSTPIN_ORGANIZATION_ID=... TRUSTPIN_PROJECT_ID=... \
 *   TRUSTPIN_PUBLIC_KEY=... npx expo prebuild --clean
 *
 * Without them the app still prebuilds and compiles, using obviously fake
 * placeholders — pinning then fails closed at runtime with
 * INVALID_PROJECT_CONFIG, which is what makes the example useful in CI where
 * no TrustPin project exists.
 *
 * If you would rather manage the native config files yourself, drop the inline
 * props and point the plugin at them instead:
 *
 *   ios:     { configFile: './trustpin/TrustPin-Info.plist' }
 *   android: { configFile: './trustpin/trustpin.json' }
 */

const PLACEHOLDER_PREFIX = 'PLACEHOLDER_';

const credentials = {
  organizationId: process.env.TRUSTPIN_ORGANIZATION_ID ?? `${PLACEHOLDER_PREFIX}ORGANIZATION_ID`,
  projectId: process.env.TRUSTPIN_PROJECT_ID ?? `${PLACEHOLDER_PREFIX}PROJECT_ID`,
  publicKey:
    process.env.TRUSTPIN_PUBLIC_KEY ??
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEPLACEHOLDERPLACEHOLDERPLACEHOLDER==',
};

const usingPlaceholders = credentials.organizationId.startsWith(PLACEHOLDER_PREFIX);

if (usingPlaceholders) {
  console.warn(
    '\n[TrustPin example] Building with PLACEHOLDER credentials.\n' +
      '  Pinning will fail closed at runtime: every HTTPS request is refused and\n' +
      '  awaitConfiguration rejects with INVALID_PROJECT_CONFIG.\n' +
      '  Set TRUSTPIN_ORGANIZATION_ID, TRUSTPIN_PROJECT_ID and TRUSTPIN_PUBLIC_KEY\n' +
      '  from https://app.trustpin.cloud to exercise the real path.\n',
  );
}

module.exports = {
  expo: {
    name: 'TrustPin Expo Example',
    slug: 'trustpin-example-expo',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    ios: {
      bundleIdentifier: 'cloud.trustpin.example.expo',
      supportsTablet: true,
    },
    android: {
      package: 'cloud.trustpin.example.expo',
    },
    extra: {
      trustPinUsesPlaceholders: usingPlaceholders,
    },
    plugins: [
      'expo-dev-client',
      [
        '@trustpin/react-native',
        {
          ...credentials,
          mode: 'strict',
          logLevel: 'debug',
        },
      ],
    ],
  },
};
