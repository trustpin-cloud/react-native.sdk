import { addAttestKeys as addAndroidKeys, addStartCall as addAndroidStartCall } from '../android';
import { addAttestKeys as addIosKeys, addStartCall as addIosStartCall } from '../ios';
import { resolveProps, TrustPinAttestPluginError } from '../types';
import { addStartCall as addPinningIosStartCall } from '../../../../plugin/src/ios';
import { addStartCall as addPinningAndroidStartCall, buildAssetJson } from '../../../../plugin/src/android';
import { buildPlist } from '../../../../plugin/src/ios';

const ATTEST = {
  verifierUrl: 'https://attest.example.com',
  attestedHosts: ['api.example.com', '*.example.org'],
};

const CREDENTIALS = { organizationId: 'org-1', projectId: 'proj-1', publicKey: 'BASE64KEY==' };

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

describe('prop validation', () => {
  it('accepts the verifier URL and hosts, or neither', () => {
    expect(() => resolveProps(ATTEST)).not.toThrow();
    expect(() => resolveProps(undefined)).not.toThrow();
  });

  it('rejects one without the other', () => {
    expect(() => resolveProps({ verifierUrl: ATTEST.verifierUrl })).toThrow(TrustPinAttestPluginError);
    expect(() => resolveProps({ attestedHosts: ATTEST.attestedHosts })).toThrow(TrustPinAttestPluginError);
  });

  it('rejects a non-https verifier, empty hosts and a malformed project number', () => {
    expect(() => resolveProps({ ...ATTEST, verifierUrl: 'http://attest.example.com' })).toThrow(
      TrustPinAttestPluginError,
    );
    expect(() => resolveProps({ ...ATTEST, attestedHosts: [] })).toThrow(TrustPinAttestPluginError);
    expect(() => resolveProps({ ...ATTEST, googleCloudProjectNumber: '12ab' })).toThrow(
      TrustPinAttestPluginError,
    );
  });
});

describe('iOS', () => {
  it('adds the attestation keys to the plist the pinning plugin wrote', () => {
    const plist = addIosKeys(buildPlist(CREDENTIALS), ATTEST);

    expect(plist).toContain('<key>OrganizationId</key>');
    expect(plist).toContain('<key>AttestVerifierURL</key>\n\t<string>https://attest.example.com</string>');
    expect(plist).toContain(
      '<key>AttestedHosts</key>\n\t<array>\n\t\t<string>api.example.com</string>\n\t\t<string>*.example.org</string>\n\t</array>',
    );
    expect(plist.trimEnd().endsWith('</plist>')).toBe(true);
  });

  it('leaves keys that are already there', () => {
    const once = addIosKeys(buildPlist(CREDENTIALS), ATTEST);
    expect(addIosKeys(once, { ...ATTEST, verifierUrl: 'https://other.example.com' })).toBe(once);
  });

  it('starts attestation right after pinning, whichever plugin runs first', () => {
    const pinningFirst = addIosStartCall(addPinningIosStartCall(APP_DELEGATE));
    const attestFirst = addPinningIosStartCall(addIosStartCall(APP_DELEGATE));

    for (const contents of [pinningFirst, attestFirst]) {
      expect(contents).toMatch(/^import TrustPinReactNative$/m);
      expect(contents).toMatch(/^import TrustPinReactNativeAttest$/m);
      expect(contents.indexOf('TrustPinReactNative.start()')).toBeLessThan(
        contents.indexOf('TrustPinReactNativeAttest.start()'),
      );
      expect(contents.indexOf('TrustPinReactNativeAttest.start()')).toBeLessThan(
        contents.indexOf('let delegate = ReactNativeDelegate()'),
      );
    }
  });

  it('is idempotent and passes the log level', () => {
    const once = addIosStartCall(APP_DELEGATE, 'debug');
    expect(addIosStartCall(once, 'debug')).toBe(once);
    expect(once).toContain('TrustPinReactNativeAttest.start(logLevel: .debug)');
  });
});

describe('Android', () => {
  it('adds the attestation keys to the asset the pinning plugin wrote', () => {
    const json = JSON.parse(
      addAndroidKeys(buildAssetJson(CREDENTIALS), { ...ATTEST, googleCloudProjectNumber: '123456789012' }),
    );

    expect(json).toEqual({
      organization_id: 'org-1',
      project_id: 'proj-1',
      public_key: 'BASE64KEY==',
      attest_verifier_url: 'https://attest.example.com',
      attested_hosts: ['api.example.com', '*.example.org'],
      google_cloud_project_number: '123456789012',
    });
  });

  it('leaves keys that are already there', () => {
    const once = addAndroidKeys(buildAssetJson(CREDENTIALS), ATTEST);
    expect(addAndroidKeys(once, { ...ATTEST, verifierUrl: 'https://other.example.com' })).toBe(once);
  });

  it('starts attestation right after pinning, whichever plugin runs first', () => {
    const pinningFirst = addAndroidStartCall(addPinningAndroidStartCall(MAIN_APPLICATION));
    const attestFirst = addPinningAndroidStartCall(addAndroidStartCall(MAIN_APPLICATION));

    for (const contents of [pinningFirst, attestFirst]) {
      expect(contents).toContain('import cloud.trustpin.reactnative.attest.TrustPinReactNativeAttest');
      expect(contents.indexOf('TrustPinReactNative.start(this)')).toBeLessThan(
        contents.indexOf('TrustPinReactNativeAttest.start(this)'),
      );
      expect(contents.indexOf('TrustPinReactNativeAttest.start(this)')).toBeLessThan(
        contents.indexOf('super.onCreate()'),
      );
    }
  });

  it('is idempotent and passes the log level', () => {
    const once = addAndroidStartCall(MAIN_APPLICATION, 'info');
    expect(addAndroidStartCall(once, 'info')).toBe(once);
    expect(once).toContain('TrustPinReactNativeAttest.start(this, "info", null)');
  });
});
