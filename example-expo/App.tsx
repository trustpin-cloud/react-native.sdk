/**
 * TrustPin React Native SDK — Expo dev-client example.
 *
 * A two-tab sample whose look and feel mirrors the Flutter SDK's `sample_app`
 * and the native samples: a Pinning tab and an Attestation tab, each with its
 * own log.
 *
 * Everything native here was wired by the config plugin at prebuild time: the
 * credential files, both init calls, and the Android toolchain pins. This app
 * only observes — it cannot configure, weaken, or disable pinning. The
 * configuration card therefore drives the fail-closed readiness gate
 * (`awaitConfiguration`) instead of entering credentials.
 *
 * The Attestation tab uses @trustpin/react-native-attest, wired by its
 * config plugin next to pinning: a protected call through plain `fetch` (the
 * header is added natively), a sensitive call with an assertion over the
 * request body, sign-out and reset, with the module's state, events and logs
 * in the tab's own log.
 */

import Constants from 'expo-constants';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import TrustPin, {
  TrustPinError,
  type TrustPinLogEvent,
  type TrustPinValidationEvent,
} from '@trustpin/react-native';
import TrustPinAttest, {
  type TrustPinAttestEvent,
  type TrustPinAttestLogEvent,
  type TrustPinAttestState,
} from '@trustpin/react-native-attest';

import { asciiBytes, sha256 } from './sha256';

// ---------------------------------------------------------------------------
// Theme — the TrustPin green palette, matching the Flutter sample.
// ---------------------------------------------------------------------------

const colors = {
  primary: '#429488',
  testGreen: '#4CAF50',
  statusRed: '#F44336',
  statusGreen: '#4CAF50',
  statusOrange: '#FF9800',
  screenBg: '#F4F7F6',
  cardBg: '#FFFFFF',
  logBg: '#F5F5F5',
  logBorder: '#E0E0E0',
  fieldBorder: '#BDBDBD',
  label: '#616161',
  body: '#1A1A1A',
  muted: '#9E9E9E',
  disabled: '#C4C4C4',
  toastBg: '#323232',
  warnBg: '#FFE8E6',
  warnBorder: '#E0857D',
  warnText: '#8A1C12',
};

const DASHBOARD_URL = 'https://app.trustpin.cloud';
const DEFAULT_TEST_URL = 'https://api.trustpin.cloud/health';
const USER_AGENT = 'TrustPin-ReactNative-Sample/1.0.0';

const monospace = Platform.select({ ios: 'Menlo', default: 'monospace' });
const usingPlaceholders = Constants.expoConfig?.extra?.trustPinUsesPlaceholders === true;

// ---------------------------------------------------------------------------
// Log feed model
// ---------------------------------------------------------------------------

type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

const LOG_ICON: Record<LogLevel, string> = {
  info: '⚙️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
  debug: '🐛',
};

type LogLine = { id: number; timestamp: string; level: LogLevel; message: string };

type Status = 'notConfigured' | 'configured' | 'testing';

let nextLineId = 0;
let nextToastId = 0;

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function describeState(state: TrustPinAttestState): string {
  switch (state.status) {
    case 'unavailable':
      return 'No token yet';
    case 'attesting':
      return 'Attesting…';
    case 'ready':
      return `Token ready until ${new Date(state.expiresAtMs).toLocaleTimeString()}`;
    case 'failed':
      return `Failed: ${state.error.code}${
        state.error.reasons.length ? ` [${state.error.reasons.join(', ')}]` : ''
      }, next attempt ${state.retryAtMs ? `after ${new Date(state.retryAtMs).toLocaleTimeString()}` : 'after restart'}`;
  }
}

/** `"<platform>/<env> <result>[, bound]"` from the sample API's echo of the verified token. */
function describeVerdict(body: string): string | null {
  try {
    const json = JSON.parse(body);
    if (json?.attestation) {
      const a = json.attestation;
      return `${a.platform}/${a.env} ${a.result}${a.bound ? ', bound' : ''}${a.assertion ? `, assertion ${a.assertion}` : ''}`;
    }
    const reason = json?.reason ?? json?.error;
    return reason ? `rejected: ${reason}` : null;
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  if (error instanceof TrustPinError) {
    return `${error.code}: ${error.message}`;
  }
  const withCode = error as { code?: string; message?: string };
  return withCode?.code ? `${withCode.code}: ${withCode.message}` : String(error);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
}

function MainScreen(): React.JSX.Element {
  // Safe-area insets rather than the status bar height, which reads 0 under
  // the UIScene life cycle.
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('pinning');
  const pinningLog = useLogFeed();
  const attestationLog = useLogFeed();
  const appendLog = pinningLog.append;
  const appendAttest = attestationLog.append;
  const [testUrl, setTestUrl] = useState(DEFAULT_TEST_URL);
  const [configured, setConfigured] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<Status>('notConfigured');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const [apiUrl, setApiUrl] = useState('');
  const [apiUser, setApiUser] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [attestState, setAttestState] = useState<TrustPinAttestState>({ status: 'unavailable' });
  const session = useRef<string | null>(null);

  const started = useRef(false);

  const showToast = useCallback((text: string) => {
    setToast({ id: nextToastId++, text });
  }, []);

  const hideToast = useCallback(() => setToast(null), []);

  // Startup: set log verbosity and wire the two native event streams into the
  // same feed the sample writes its own narrative to.
  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    TrustPin.setLogLevel('info').catch(() => {});
    appendLog('info', 'TrustPin React Native Sample started');
    appendLog('info', 'TrustPin configured for info-level logging');

    // Subscribing replays anything the native side buffered before JavaScript
    // was alive, so a cold-start pin failure is still visible here.
    const validation = TrustPin.onValidationEvent((event: TrustPinValidationEvent) => {
      if (event.code === null) {
        appendLog('success', `Pin validation succeeded for ${event.domain}`);
      } else {
        appendLog('warning', `Pin validation FAILED for ${event.domain}: ${event.code}`);
      }
    });
    const logs = TrustPin.onLogEvent((event: TrustPinLogEvent) => {
      const message = `[SDK] ${event.message}`;
      if (event.level === 'error') {
        appendLog('error', message);
      } else if (event.level === 'debug') {
        appendLog('debug', message);
      } else {
        appendLog('info', message);
      }
    });

    return () => {
      validation.remove();
      logs.remove();
    };
  }, [appendLog]);

  // Attestation was set up natively at launch, next to pinning. Tokens are
  // bound to each request's Authorization header, and a token is fetched ahead
  // of the first call.
  useEffect(() => {
    TrustPinAttest.setLogLevel('debug').catch(() => {});
    appendAttest('info', 'TrustPinAttest started natively with the app, from the same configuration file');
    TrustPinAttest.bindToHeader('Authorization').catch(() => {});
    TrustPinAttest.prefetch();
    const attestStates = TrustPinAttest.onStateChange((state: TrustPinAttestState) => {
      setAttestState(state);
      appendAttest('info', `Attestation state: ${describeState(state)}`);
    });
    const attestEvents = TrustPinAttest.onEvent((event: TrustPinAttestEvent) => {
      appendAttest('info', `[Event] ${JSON.stringify(event)}`);
    });
    const attestLogs = TrustPinAttest.onLogEvent((event: TrustPinAttestLogEvent) => {
      const level = event.level === 'warning' ? 'warning' : event.level === 'error' ? 'error' : 'debug';
      appendAttest(level, `[TrustPinAttest] ${event.message}`);
    });

    return () => {
      attestStates.remove();
      attestEvents.remove();
      attestLogs.remove();
    };
  }, [appendAttest]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const verifyConfiguration = useCallback(async () => {
    setWorking(true);
    appendLog('info', 'Verifying TrustPin configuration…');
    appendLog('debug', 'Awaiting the signed pinning configuration (fail-closed gate)');
    try {
      await TrustPin.awaitConfiguration(30_000);
      setConfigured(true);
      setStatus('configured');
      appendLog('success', 'TrustPin configuration ready');
      showToast('TrustPin configured successfully!');
    } catch (error) {
      appendLog('error', `Configuration failed: ${describeError(error)}`);
      showToast(`Configuration failed: ${describeError(error)}`);
    } finally {
      setWorking(false);
    }
  }, [appendLog, showToast]);

  const checkLoaded = useCallback(async () => {
    appendLog('info', 'Checking whether a validated configuration is loaded…');
    try {
      const loaded = await TrustPin.isConfigurationLoaded();
      appendLog(loaded ? 'success' : 'warning', `Configuration loaded: ${loaded}`);
      showToast(`Configuration loaded: ${loaded}`);
    } catch (error) {
      appendLog('error', `isConfigurationLoaded failed: ${describeError(error)}`);
      showToast(`Check failed: ${describeError(error)}`);
    }
  }, [appendLog, showToast]);

  const testConnection = useCallback(async () => {
    const url = testUrl.trim();
    if (!url) {
      appendLog('warning', 'Test connection failed: No URL provided');
      showToast('No URL provided');
      return;
    }

    setWorking(true);
    setStatus('testing');
    appendLog('info', `Testing connection to: ${url}`);
    appendLog('info', 'Using TrustPin SSL certificate validation');
    appendLog('debug', 'Method: GET');
    appendLog('debug', `URL: ${url}`);
    appendLog('debug', `User-Agent: ${USER_AGENT}`);

    try {
      // Ordinary fetch: enforcement happens inside the pinned TLS handshake.
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      const body = await response.text();
      appendLog('success', 'Connection test successful!');
      appendLog('debug', `Status: ${response.status}`);
      appendLog('debug', `Response length: ${body.length} bytes`);
      setStatus('configured');
      showToast('Connection test successful!');
    } catch (error) {
      appendLog('error', `Connection failed: ${describeError(error)}`);
      setStatus(configured ? 'configured' : 'notConfigured');
      showToast(`Connection failed: ${describeError(error)}`);
    } finally {
      setWorking(false);
    }
  }, [testUrl, configured, appendLog, showToast]);

  // Signs in to the sample API once (POST /login) and keeps the session.
  const signIn = useCallback(async (): Promise<string> => {
    if (session.current) return session.current;
    const response = await fetch(`${apiUrl.trim().replace(/\/+$/, '')}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: apiUser, password: apiPassword }),
    });
    if (response.status !== 200) throw new Error(`Sign-in failed: HTTP ${response.status}`);
    const token = (await response.json())?.token;
    if (typeof token !== 'string' || !token) throw new Error('Sign-in answered without a token');
    session.current = token;
    return token;
  }, [apiUrl, apiUser, apiPassword]);

  const report = useCallback(
    async (label: string, response: Response) => {
      if (response.status === 401) session.current = null;
      const body = await response.text();
      const verdict = describeVerdict(body);
      appendAttest(response.ok ? 'success' : 'warning', `${label} answered HTTP ${response.status}`);
      if (verdict) appendAttest('info', `   API attestation: ${verdict}`);
      showToast(`${label}: HTTP ${response.status}`);
    },
    [appendAttest, showToast],
  );

  const callProtected = useCallback(async () => {
    setWorking(true);
    appendAttest('info', 'Calling the protected sample endpoint (GET /home)…');
    try {
      const token = await signIn();
      // Plain fetch: the TrustPin-Attestation header is added natively, bound
      // to this Authorization value.
      const response = await fetch(`${apiUrl.trim().replace(/\/+$/, '')}/home`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await report('Protected call', response);
    } catch (error) {
      appendAttest('error', `Protected call failed: ${describeError(error)}`);
    } finally {
      setWorking(false);
    }
  }, [apiUrl, signIn, report, appendAttest]);

  const callSensitive = useCallback(async () => {
    setWorking(true);
    appendAttest('info', 'Sensitive call: token + assertion over the body (POST /transfer)…');
    try {
      const token = await signIn();
      const url = `${apiUrl.trim().replace(/\/+$/, '')}/transfer`;
      const body = JSON.stringify({ amount: '1.00', to: 'demo' });
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      // The token first, so the header binding sees this request's session
      // value; then both headers for the operation, with an assertion over the
      // body's SHA-256, which the sample API checks with the verifier.
      Object.assign(headers, await TrustPinAttest.attestationHeaders(url, { method: 'POST', headers }));
      Object.assign(headers, await TrustPinAttest.assertionHeaders(sha256(asciiBytes(body))));
      const response = await fetch(url, { method: 'POST', headers, body });
      await report('Sensitive call', response);
    } catch (error) {
      appendAttest('error', `Sensitive call failed: ${describeError(error)}`);
    } finally {
      setWorking(false);
    }
  }, [apiUrl, signIn, report, appendAttest]);

  const signOut = useCallback(() => {
    session.current = null;
    appendAttest(
      'info',
      'Session discarded: the next call signs in again; the new session value re-binds the token (a renewal, not a new key)',
    );
  }, [appendAttest]);

  const resetAttestation = useCallback(async () => {
    try {
      await TrustPinAttest.reset();
      appendAttest('info', 'Attestation reset: the next call attests a new key');
    } catch (error) {
      appendAttest('error', `Attestation reset failed: ${describeError(error)}`);
    }
  }, [appendAttest]);


  const canVerify = !configured && !working;
  const canTest = configured && !working;
  const canAttest = configured && !working && apiUrl.trim().startsWith('https://');

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>TrustPin Sample</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {usingPlaceholders ? (
          <View style={styles.warnBanner}>
            <Text style={styles.warnText}>
              Placeholder credentials — this app is NOT pinned to a real project. Every HTTPS
              request fails closed. Set the TRUSTPIN_* environment variables and run prebuild
              again.
            </Text>
          </View>
        ) : null}

        {tab === 'pinning' ? (
          <>
        {/* Configuration card ------------------------------------------------ */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>TrustPin Configuration</Text>

          <DashboardBanner />

          <Text style={styles.note}>
            The React Native SDK is observe-only: pinning is configured natively at build
            time. Verify the fail-closed readiness gate below.
          </Text>

          <PrimaryButton
            title={configured ? 'TrustPin Configured' : 'Verify Configuration'}
            color={colors.primary}
            disabled={!canVerify}
            working={working && status !== 'testing'}
            onPress={verifyConfiguration}
          />
          <View style={styles.buttonGap} />
          <OutlinedButton title="Check if loaded" disabled={working} onPress={checkLoaded} />
        </View>

        {/* Connection card --------------------------------------------------- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connection Testing</Text>

          <LabeledField
            label="Test URL"
            value={testUrl}
            onChangeText={setTestUrl}
            placeholder="https://api.example.com"
            editable={!working}
          />
          <View style={styles.fieldGap} />

          <PrimaryButton
            title="Test Connection"
            color={colors.testGreen}
            disabled={!canTest}
            working={working && status === 'testing'}
            onPress={testConnection}
          />

          <View style={styles.fieldGap} />
          <StatusBanner status={status} />
        </View>

            <LogPanel
              title="Pinning Log"
              lines={pinningLog.lines}
              onClear={pinningLog.clear}
              emptyText={'Verify configuration and test connections…'}
            />
          </>
        ) : (
          <>
        {/* Attestation card -------------------------------------------------- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>App Attestation</Text>
          <Text style={styles.note}>{describeState(attestState)}</Text>

          <LabeledField
            label="Sample API URL"
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="https://api.example.com"
            editable={!working}
          />
          <View style={styles.fieldGap} />
          <LabeledField
            label="Username"
            value={apiUser}
            onChangeText={setApiUser}
            placeholder="demo"
            editable={!working}
          />
          <View style={styles.fieldGap} />
          <LabeledField
            label="Password"
            value={apiPassword}
            onChangeText={setApiPassword}
            placeholder="password"
            editable={!working}
            secure
          />
          <View style={styles.fieldGap} />

          <PrimaryButton
            title="Call Protected Endpoint"
            color={colors.primary}
            disabled={!canAttest}
            working={false}
            onPress={callProtected}
          />
          <View style={styles.buttonGap} />
          <PrimaryButton
            title="Sensitive Call (Token + Assertion)"
            color={colors.primary}
            disabled={!canAttest}
            working={false}
            onPress={callSensitive}
          />
          <View style={styles.buttonGap} />
          <OutlinedButton title="Sign Out (New Session)" disabled={!canAttest} onPress={signOut} />
          <View style={styles.buttonGap} />
          <OutlinedButton title="Reset Attestation" disabled={working} onPress={resetAttestation} />

          <Text style={styles.note}>
            Requires the App Attest entitlement (iOS) and a policy that lists this app. Verify the
            pinning configuration first: verifier calls are pinned.
          </Text>
        </View>

            <LogPanel
              title="Attestation Log"
              lines={attestationLog.lines}
              onClear={attestationLog.clear}
              emptyText={'Attestation state, events and protected calls appear here…'}
            />
          </>
        )}
      </ScrollView>

      <TabBar tab={tab} onSelect={setTab} bottomInset={insets.bottom} />
      <Toast toast={toast} onHide={hideToast} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

type Tab = 'pinning' | 'attestation';

/** One log feed: its lines, an append and a clear. */
function useLogFeed() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const append = useCallback((level: LogLevel, message: string) => {
    setLines(current =>
      [...current, { id: nextLineId++, timestamp: timestamp(), level, message }].slice(-200),
    );
  }, []);
  const clear = useCallback(() => setLines([]), []);
  return { lines, append, clear };
}

function LogPanel(props: {
  title: string;
  lines: LogLine[];
  onClear: () => void;
  emptyText: string;
}): React.JSX.Element {
  const scroll = useRef<ScrollView>(null);
  return (
    <View style={styles.card}>
      <View style={styles.logHeader}>
        <Text style={styles.cardTitle}>{props.title}</Text>
        <TouchableOpacity onPress={props.onClear} hitSlop={8}>
          <Text style={styles.clearButton}>Clear</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.logBox}>
        {props.lines.length === 0 ? (
          <View style={styles.logEmpty}>
            <Text style={styles.logEmptyText}>{props.emptyText}</Text>
          </View>
        ) : (
          <ScrollView
            ref={scroll}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
            {props.lines.map(line => (
              <Text key={line.id} style={styles.logLine}>
                [{line.timestamp}] {LOG_ICON[line.level]} {line.message}
              </Text>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

/** Pinning and Attestation, as in the native and Flutter samples. */
function TabBar(props: {
  tab: Tab;
  onSelect: (tab: Tab) => void;
  bottomInset: number;
}): React.JSX.Element {
  const item = (tab: Tab, icon: string, label: string) => (
    <TouchableOpacity
      key={tab}
      style={styles.tabItem}
      onPress={() => props.onSelect(tab)}
      accessibilityRole="tab"
      accessibilityState={{ selected: props.tab === tab }}>
      <Text style={[styles.tabIcon, props.tab === tab && styles.tabSelected]}>{icon}</Text>
      <Text style={[styles.tabLabel, props.tab === tab && styles.tabSelected]}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={[styles.tabBar, { paddingBottom: props.bottomInset + 6 }]}>
      {item('pinning', '🛡', 'Pinning')}
      {item('attestation', '✅', 'Attestation')}
    </View>
  );
}

function DashboardBanner(): React.JSX.Element {
  return (
    <View style={styles.dashboard}>
      <Text style={styles.dashboardTitle}>Need credentials?</Text>
      <Text style={styles.dashboardBody}>
        Sign in to the TrustPin dashboard to fetch your organization id, project id, and
        public key, then wire them into the native build.
      </Text>
      <TouchableOpacity onPress={() => Linking.openURL(DASHBOARD_URL)} hitSlop={6}>
        <Text style={styles.dashboardLink}>app.trustpin.cloud (tap to open)</Text>
      </TouchableOpacity>
    </View>
  );
}

function LabeledField(props: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  editable: boolean;
  secure?: boolean;
}): React.JSX.Element {
  return (
    <View>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={[styles.input, !props.editable && styles.inputDisabled]}
        value={props.value}
        secureTextEntry={props.secure}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        editable={props.editable}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function PrimaryButton(props: {
  title: string;
  color: string;
  disabled: boolean;
  working?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.primaryButton,
        { backgroundColor: props.disabled ? colors.disabled : props.color },
      ]}>
      {props.working ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.primaryButtonText}>{props.title}</Text>
      )}
    </TouchableOpacity>
  );
}

function OutlinedButton(props: {
  title: string;
  disabled: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const tint = props.disabled ? colors.disabled : colors.primary;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.outlinedButton, { borderColor: tint }]}>
      <Text style={[styles.outlinedButtonText, { color: tint }]}>{props.title}</Text>
    </TouchableOpacity>
  );
}

function StatusBanner({ status }: { status: Status }): React.JSX.Element {
  const [color, label] =
    status === 'configured'
      ? [colors.statusGreen, 'TrustPin configured']
      : status === 'testing'
        ? [colors.statusOrange, 'Testing connection...']
        : [colors.statusRed, 'TrustPin not configured'];
  return (
    <View style={[styles.statusBanner, { backgroundColor: color }]}>
      <Text style={styles.statusBannerText}>Status: {label}</Text>
    </View>
  );
}

function Toast({
  toast,
  onHide,
}: {
  toast: { id: number; text: string } | null;
  onHide: () => void;
}): React.JSX.Element | null {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) {
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) {
            onHide();
          }
        },
      );
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast, opacity, onHide]);

  if (!toast) {
    return null;
  }
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
      <Text style={styles.toastText}>{toast.text}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C8D3CF',
    backgroundColor: '#FFFFFF',
    paddingTop: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabIcon: { fontSize: 20, opacity: 0.5 },
  tabLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tabSelected: { opacity: 1, color: colors.primary, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.screenBg },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  content: { padding: 16 },

  warnBanner: {
    backgroundColor: colors.warnBg,
    borderWidth: 1,
    borderColor: colors.warnBorder,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warnText: { color: colors.warnText, fontSize: 13, lineHeight: 18 },

  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '600', color: colors.body, marginBottom: 12 },
  note: { fontSize: 12, color: colors.label, marginTop: 12, marginBottom: 16, lineHeight: 18 },

  dashboard: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    padding: 12,
  },
  dashboardTitle: { fontWeight: '600', color: colors.body },
  dashboardBody: { fontSize: 12, color: colors.body, marginTop: 4, lineHeight: 18 },
  dashboardLink: {
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: 8,
    paddingVertical: 4,
  },

  fieldLabel: { fontSize: 12, color: colors.label, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.body,
  },
  inputDisabled: { backgroundColor: '#EEEEEE', color: colors.muted },
  fieldGap: { height: 16 },
  buttonGap: { height: 8 },

  primaryButton: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  outlinedButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedButtonText: { fontSize: 16, fontWeight: '600' },

  statusBanner: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusBannerText: { color: '#FFFFFF', fontSize: 12 },

  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  clearButton: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  logBox: {
    height: 300,
    backgroundColor: colors.logBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.logBorder,
    padding: 12,
  },
  logEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logEmptyText: {
    fontFamily: monospace,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  logLine: { fontFamily: monospace, fontSize: 12, color: colors.body, paddingVertical: 1 },

  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: colors.toastBg,
    borderRadius: 8,
    padding: 14,
  },
  toastText: { color: '#FFFFFF', fontSize: 14 },
});
