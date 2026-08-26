import { addStartCall as addAndroidStartCall, buildAssetJson, patchProjectBuildGradle } from '../android';
import { addStartCall as addIosStartCall, buildPlist } from '../ios';
import { resolveProps, TrustPinPluginError } from '../types';

const CREDENTIALS = {
  organizationId: 'org-1',
  projectId: 'proj-1',
  publicKey: 'BASE64KEY==',
};

// Verbatim from the React Native 0.85 templates, so the mods are tested
// against the files they actually edit.
const APP_DELEGATE = `import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    return true
  }
}
`;

const MAIN_APPLICATION = `package com.example

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`;

const PROJECT_BUILD_GRADLE = `buildscript {
    ext {
        buildToolsVersion = "36.0.0"
        minSdkVersion = 24
        compileSdkVersion = 36
        kotlinVersion = "2.1.20"
    }
    dependencies {
        classpath("com.android.tools.build:gradle")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")
    }
}
`;

describe('prop validation', () => {
  it('accepts inline credentials', () => {
    expect(() => resolveProps(CREDENTIALS)).not.toThrow();
  });

  it('accepts per-platform config files instead of credentials', () => {
    expect(() =>
      resolveProps({
        ios: { configFile: './TrustPin-Info.plist' },
        android: { configFile: './trustpin.json' },
      }),
    ).not.toThrow();
  });

  it('rejects credentials and a configFile together rather than silently picking one', () => {
    expect(() => resolveProps({ ...CREDENTIALS, ios: { configFile: './x.plist' } })).toThrow(
      TrustPinPluginError,
    );
  });

  it('rejects partial credentials, naming what is missing', () => {
    expect(() => resolveProps({ organizationId: 'org-1', projectId: 'p' })).toThrow(/publicKey/);
  });

  it('rejects when a platform has neither credentials nor a file', () => {
    expect(() => resolveProps({ ios: { configFile: './x.plist' } })).toThrow(/android/);
    expect(() => resolveProps(undefined)).toThrow(TrustPinPluginError);
  });

  it('rejects an embedded configuration alongside a user-supplied config file', () => {
    expect(() =>
      resolveProps({
        embeddedConfigurationFile: './trustpin-seed.b64',
        ios: { configFile: './TrustPin-Info.plist' },
        android: { configFile: './trustpin.json' },
      }),
    ).toThrow(TrustPinPluginError);
  });

  it('accepts an embedded configuration alongside inline credentials', () => {
    expect(() =>
      resolveProps({ ...CREDENTIALS, embeddedConfigurationFile: './trustpin-seed.b64' }),
    ).not.toThrow();
  });

  it('rejects invalid enum values and non-https configuration URLs', () => {
    expect(() => resolveProps({ ...CREDENTIALS, mode: 'loose' as 'strict' })).toThrow(/mode/);
    expect(() => resolveProps({ ...CREDENTIALS, logLevel: 'verbose' as 'debug' })).toThrow(
      /logLevel/,
    );
    expect(() =>
      resolveProps({ ...CREDENTIALS, configurationUrl: 'http://cdn.example.com' }),
    ).toThrow(/https/);
  });
});

describe('generated config files', () => {
  it('writes the plist keys the native loader reads', () => {
    const plist = buildPlist({ ...CREDENTIALS, mode: 'strict' });
    expect(plist).toContain('<key>OrganizationId</key>');
    expect(plist).toContain('<string>org-1</string>');
    expect(plist).toContain('<key>PublicKey</key>');
    expect(plist).toContain('<key>Mode</key>');
    expect(plist).not.toContain('ConfigurationURL');
  });

  it('escapes XML in plist values', () => {
    const plist = buildPlist({ ...CREDENTIALS, organizationId: 'a&b<c>' });
    expect(plist).toContain('a&amp;b&lt;c&gt;');
  });

  it('points the plist at the embedded configuration by file name only', () => {
    const plist = buildPlist({
      ...CREDENTIALS,
      embeddedConfigurationFile: './config/trustpin-seed.b64',
    });
    expect(plist).toContain('<key>EmbeddedConfigurationFile</key>');
    // The native loader resolves a resource name in the bundle, not a path.
    expect(plist).toContain('<string>trustpin-seed.b64</string>');
    expect(plist).not.toContain('config/trustpin-seed.b64');
  });

  it('omits the embedded key when no file is configured', () => {
    expect(buildPlist({ ...CREDENTIALS })).not.toContain('EmbeddedConfigurationFile');
    expect(buildAssetJson({ ...CREDENTIALS })).not.toContain('embedded_configuration_asset');
  });

  it('points the Android asset JSON at the embedded configuration by file name only', () => {
    const json = JSON.parse(
      buildAssetJson({ ...CREDENTIALS, embeddedConfigurationFile: './config/trustpin-seed.b64' }),
    );
    expect(json.embedded_configuration_asset).toBe('trustpin-seed.b64');
  });

  it('writes snake_case JSON keys for Android', () => {
    const json = JSON.parse(
      buildAssetJson({ ...CREDENTIALS, configurationUrl: 'https://cdn.example.com' }),
    );
    expect(json).toEqual({
      organization_id: 'org-1',
      project_id: 'proj-1',
      public_key: 'BASE64KEY==',
      configuration_url: 'https://cdn.example.com',
    });
  });
});

describe('iOS AppDelegate injection', () => {
  it('starts pinning as the first statement of didFinishLaunchingWithOptions', () => {
    const patched = addIosStartCall(APP_DELEGATE);
    expect(patched).toContain('import TrustPinReactNative');

    const callIndex = patched.indexOf('TrustPinReactNative.start()');
    const factoryIndex = patched.indexOf('let delegate = ReactNativeDelegate()');
    expect(callIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeLessThan(factoryIndex);
  });

  it('passes the log level when configured', () => {
    expect(addIosStartCall(APP_DELEGATE, 'debug')).toContain(
      'TrustPinReactNative.start(logLevel: .debug)',
    );
  });

  it('is idempotent across prebuilds', () => {
    const once = addIosStartCall(APP_DELEGATE);
    expect(addIosStartCall(once)).toBe(once);
  });

  it('fails loudly when the launch method is missing', () => {
    expect(() => addIosStartCall('import UIKit\nclass AppDelegate {}\n')).toThrow(
      TrustPinPluginError,
    );
  });
});

describe('Android MainApplication injection', () => {
  it('starts pinning before loadReactNative', () => {
    const patched = addAndroidStartCall(MAIN_APPLICATION);
    expect(patched).toContain('import cloud.trustpin.reactnative.TrustPinReactNative');

    const callIndex = patched.indexOf('TrustPinReactNative.start(this)');
    const loadIndex = patched.indexOf('loadReactNative(this)');
    expect(callIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeLessThan(loadIndex);
  });

  it('passes the log level as the wire name', () => {
    expect(addAndroidStartCall(MAIN_APPLICATION, 'info')).toContain(
      'TrustPinReactNative.start(this, "info")',
    );
  });

  it('is idempotent across prebuilds', () => {
    const once = addAndroidStartCall(MAIN_APPLICATION);
    expect(addAndroidStartCall(once)).toBe(once);
  });
});

const EXPO_BUILD_GRADLE = `// Top-level build file
buildscript {
  repositories {
    google()
  }
  dependencies {
    classpath('com.android.tools.build:gradle')
    classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")
  }
}

apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
`;

describe('Android toolchain pins', () => {
  it('raises minSdk to the SDK floor', () => {
    expect(patchProjectBuildGradle(PROJECT_BUILD_GRADLE)).toContain('minSdkVersion = 25');
  });

  it('leaves a higher minSdk alone', () => {
    const higher = PROJECT_BUILD_GRADLE.replace('minSdkVersion = 24', 'minSdkVersion = 26');
    expect(patchProjectBuildGradle(higher)).toContain('minSdkVersion = 26');
  });

  it('pins the Kotlin plugin on the classpath, not just ext.kotlinVersion', () => {
    const patched = patchProjectBuildGradle(PROJECT_BUILD_GRADLE);
    // ext alone has no effect: React Native's included Gradle build pins the
    // Kotlin plugin version for the whole project.
    expect(patched).toContain('kotlinVersion = "2.3.0"');
    expect(patched).toContain('classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0")');
  });

  it('replaces an existing pinned Kotlin version', () => {
    const pinned = PROJECT_BUILD_GRADLE.replace(
      'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")',
      'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.0")',
    );
    const patched = patchProjectBuildGradle(pinned);
    expect(patched).toContain('kotlin-gradle-plugin:2.3.0');
    expect(patched).not.toContain('kotlin-gradle-plugin:2.0.0');
  });

  it('is idempotent across prebuilds', () => {
    const once = patchProjectBuildGradle(PROJECT_BUILD_GRADLE);
    expect(patchProjectBuildGradle(once)).toBe(once);
  });

  describe('Expo template, which has no ext block', () => {
    it('declares the floor before expo-root-project fills in its default', () => {
      const patched = patchProjectBuildGradle(EXPO_BUILD_GRADLE);
      const extIndex = patched.indexOf('minSdkVersion = 25');
      const pluginIndex = patched.indexOf('apply plugin: "expo-root-project"');
      expect(extIndex).toBeGreaterThan(-1);
      expect(extIndex).toBeLessThan(pluginIndex);
    });

    it('pins the Kotlin plugin on the classpath', () => {
      expect(patchProjectBuildGradle(EXPO_BUILD_GRADLE)).toContain(
        'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0")',
      );
    });

    it('is idempotent across prebuilds', () => {
      const once = patchProjectBuildGradle(EXPO_BUILD_GRADLE);
      expect(patchProjectBuildGradle(once)).toBe(once);
    });
  });
});
