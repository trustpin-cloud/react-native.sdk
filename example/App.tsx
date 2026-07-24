/**
 * TrustPin React Native SDK — example app.
 *
 * A single-screen sample whose look and feel mirrors the Flutter SDK's
 * `sample_app`: a teal-green themed, card-based layout with a configuration
 * card, a connection-testing card, and a scrolling log feed.
 *
 * The React Native SDK is observe-only — pinning is configured natively at
 * build time, so this screen cannot enter credentials the way the Flutter
 * sample does. Instead the configuration card drives the fail-closed readiness
 * gate (`awaitConfiguration`) and reports whether a validated configuration is
 * loaded. Everything else — the pinned request, the manual certificate check,
 * the SDK log/validation event streams — feeds the same in-app log feed.
 *
 * @format
 */

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
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import TrustPin, {
  TrustPinError,
  type TrustPinLogEvent,
  type TrustPinValidationEvent,
} from '@trustpin/react-native';

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
};

const DASHBOARD_URL = 'https://app.trustpin.cloud';
const DEFAULT_TEST_URL = 'https://api.trustpin.cloud/health';
const USER_AGENT = 'TrustPin-ReactNative-Sample/1.0.0';

const monospace = Platform.select({ ios: 'Menlo', default: 'monospace' });

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

function describeError(error: unknown): string {
  if (error instanceof TrustPinError) {
    return `${error.code}: ${error.message}`;
  }
  // Native rejections arrive as plain errors carrying the same stable code.
  const withCode = error as { code?: string; message?: string };
  return withCode?.code ? `${withCode.code}: ${withCode.message}` : String(error);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
}

function MainScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();

  const [lines, setLines] = useState<LogLine[]>([]);
  const [testUrl, setTestUrl] = useState(DEFAULT_TEST_URL);
  const [configured, setConfigured] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<Status>('notConfigured');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const logScroll = useRef<ScrollView>(null);
  const started = useRef(false);

  const appendLog = useCallback((level: LogLevel, message: string) => {
    setLines(current =>
      [...current, { id: nextLineId++, timestamp: timestamp(), level, message }].slice(-200),
    );
  }, []);

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

  const clearLog = useCallback(() => setLines([]), []);

  const canVerify = !configured && !working;
  const canTest = configured && !working;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>TrustPin Sample</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        {/* Log card ---------------------------------------------------------- */}
        <View style={styles.card}>
          <View style={styles.logHeader}>
            <Text style={styles.cardTitle}>Log Output</Text>
            <TouchableOpacity onPress={clearLog} hitSlop={8}>
              <Text style={styles.clearButton}>Clear</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.logBox}>
            {lines.length === 0 ? (
              <View style={styles.logEmpty}>
                <Text style={styles.logEmptyText}>
                  Welcome to TrustPin React Native Sample{'\n'}
                  Verify configuration and test connections…
                </Text>
              </View>
            ) : (
              <ScrollView
                ref={logScroll}
                onContentSizeChange={() => logScroll.current?.scrollToEnd({ animated: true })}>
                {lines.map(line => (
                  <Text key={line.id} style={styles.logLine}>
                    [{line.timestamp}] {LOG_ICON[line.level]} {line.message}
                  </Text>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </ScrollView>

      <Toast toast={toast} onHide={hideToast} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

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
}): React.JSX.Element {
  return (
    <View>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={[styles.input, !props.editable && styles.inputDisabled]}
        value={props.value}
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
  screen: { flex: 1, backgroundColor: colors.screenBg },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  content: { padding: 16 },

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

export default App;
