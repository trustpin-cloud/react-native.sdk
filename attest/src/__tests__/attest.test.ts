type Listener<T> = (payload: T) => void;

function makeNativeMock() {
  const listeners: Record<string, Listener<Record<string, unknown>>[]> = {
    state: [],
    event: [],
    log: [],
  };
  const emitter = (key: string) =>
    jest.fn((listener: Listener<Record<string, unknown>>) => {
      listeners[key]!.push(listener);
      return { remove: jest.fn() };
    });
  return {
    prefetch: jest.fn().mockResolvedValue(undefined),
    getToken: jest.fn().mockResolvedValue('token'),
    attestationHeaders: jest.fn().mockResolvedValue({ 'TrustPin-Attestation': 'token' }),
    assertionHeaders: jest
      .fn()
      .mockResolvedValue({ 'TrustPin-Attestation': 'token', 'TrustPin-Assertion': 'assertion' }),
    setTokenBinding: jest.fn().mockResolvedValue(undefined),
    bindToHeader: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue({ state: 'unavailable' }),
    reset: jest.fn().mockResolvedValue(undefined),
    setLogLevel: jest.fn().mockResolvedValue(undefined),
    flushEarlyEvents: jest.fn(),
    flushEarlyLogEvents: jest.fn(),
    onStateChange: emitter('state'),
    onEvent: emitter('event'),
    onLogEvent: emitter('log'),
    emit(key: 'state' | 'event' | 'log', payload: Record<string, unknown>) {
      listeners[key]!.forEach(listener => listener(payload));
    },
  };
}

// The wrapper resolves the native module at import time, so each scenario
// re-imports it against a freshly mocked 'react-native'.
async function importAttest(nativeModule: unknown) {
  jest.resetModules();
  jest.doMock('react-native', () => ({
    TurboModuleRegistry: { get: jest.fn(() => nativeModule) },
  }));
  return import('../index');
}

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('native module missing', () => {
  it('rejects calls with NOT_SET_UP naming the init step', async () => {
    const { TrustPinAttest } = await importAttest(null);
    await expect(TrustPinAttest.getToken()).rejects.toMatchObject({
      name: 'TrustPinAttestError',
      code: 'NOT_SET_UP',
      message: expect.stringContaining('TrustPinReactNativeAttest.start('),
    });
  });

  it('keeps the never-rejecting calls quiet', async () => {
    const { TrustPinAttest } = await importAttest(null);
    await expect(TrustPinAttest.prefetch()).resolves.toBeUndefined();
    await expect(TrustPinAttest.attestationHeaders('https://api.example.com/')).resolves.toEqual({});
  });
});

describe('calls forward to the native module', () => {
  it('passes attestationHeaders arguments and never rejects', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);

    const headers = await TrustPinAttest.attestationHeaders('https://api.example.com/', {
      method: 'POST',
      headers: { Authorization: 'Bearer abc' },
    });
    expect(native.attestationHeaders).toHaveBeenCalledWith('https://api.example.com/', 'POST', {
      Authorization: 'Bearer abc',
    });
    expect(headers).toEqual({ 'TrustPin-Attestation': 'token' });

    native.attestationHeaders.mockRejectedValueOnce({ code: 'ATTEST_ERROR' });
    await expect(TrustPinAttest.attestationHeaders('https://api.example.com/')).resolves.toEqual({});
  });

  it('maps native rejections, reasons included', async () => {
    const native = makeNativeMock();
    native.getToken.mockRejectedValueOnce({
      code: 'ATTESTATION_FAILED',
      message: 'AttestationFailed',
      userInfo: { reasons: ['app_not_allowed'] },
    });
    const { TrustPinAttest } = await importAttest(native);

    await expect(TrustPinAttest.getToken()).rejects.toMatchObject({
      name: 'TrustPinAttestError',
      code: 'ATTESTATION_FAILED',
      reasons: ['app_not_allowed'],
    });
  });

  it('passes bindings through, null included', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);

    await TrustPinAttest.bindToHeader('Authorization');
    await TrustPinAttest.setTokenBinding(null);
    expect(native.bindToHeader).toHaveBeenCalledWith('Authorization');
    expect(native.setTokenBinding).toHaveBeenCalledWith(null);
  });
});

describe('assertionHeaders', () => {
  it('sends a 32-byte digest as lowercase hex', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);
    const digest = new Uint8Array(32).map((_, index) => index);

    const headers = await TrustPinAttest.assertionHeaders(digest);

    expect(native.assertionHeaders).toHaveBeenCalledWith(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    );
    expect(Object.keys(headers)).toEqual([
      TrustPinAttest.headerName,
      TrustPinAttest.assertionHeaderName,
    ]);
  });

  it('accepts an ArrayBuffer and a hex string', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);

    await TrustPinAttest.assertionHeaders(new ArrayBuffer(32));
    await TrustPinAttest.assertionHeaders('AB'.repeat(32));
    expect(native.assertionHeaders).toHaveBeenNthCalledWith(1, '00'.repeat(32));
    expect(native.assertionHeaders).toHaveBeenNthCalledWith(2, 'ab'.repeat(32));
  });

  it('rejects any other digest with INVALID_DIGEST before the native call', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);

    await expect(TrustPinAttest.assertionHeaders(new Uint8Array(3))).rejects.toMatchObject({
      code: 'INVALID_DIGEST',
    });
    await expect(TrustPinAttest.assertionHeaders('abc')).rejects.toMatchObject({ code: 'INVALID_DIGEST' });
    expect(native.assertionHeaders).not.toHaveBeenCalled();
  });
});

describe('state', () => {
  it('decodes a failed state with reasons and no retry time', async () => {
    const native = makeNativeMock();
    native.getState.mockResolvedValueOnce({
      state: 'failed',
      code: 'ATTESTATION_FAILED',
      message: 'AttestationFailed',
      reasons: ['dev_environment'],
    });
    const { TrustPinAttest } = await importAttest(native);

    const state = await TrustPinAttest.getState();

    expect(state.status).toBe('failed');
    if (state.status !== 'failed') throw new Error('expected failed');
    expect(state.error.code).toBe('ATTESTATION_FAILED');
    expect(state.error.reasons).toEqual(['dev_environment']);
    expect(state.retryAtMs).toBeNull();
  });

  it('onStateChange emits the current state, then changes', async () => {
    const native = makeNativeMock();
    native.getState.mockResolvedValueOnce({ state: 'ready', expiresAtMs: 1000 });
    const { TrustPinAttest } = await importAttest(native);
    const states: unknown[] = [];

    const subscription = TrustPinAttest.onStateChange(state => states.push(state));
    await flush();
    native.emit('state', { state: 'attesting' });
    subscription.remove();

    expect(states).toEqual([{ status: 'ready', expiresAtMs: 1000 }, { status: 'attesting' }]);
  });

  it('onStateChange skips the read when a change arrived first', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);
    const states: unknown[] = [];

    TrustPinAttest.onStateChange(state => states.push(state));
    native.emit('state', { state: 'attesting' });
    await flush();

    expect(states).toEqual([{ status: 'attesting' }]);
  });
});

describe('events and logs', () => {
  it('decodes events, skips unknown ones and flushes early events once', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);
    const events: unknown[] = [];

    TrustPinAttest.onEvent(event => events.push(event));
    TrustPinAttest.onEvent(() => undefined);
    native.emit('event', { event: 'keyGenerated' });
    native.emit('event', { event: 'somethingNew' });
    native.emit('event', { event: 'attestationSucceeded', durationMs: 850 });
    native.emit('event', { event: 'attestationFailed', reasons: ['app_not_allowed'] });
    native.emit('event', { event: 'refused', retryAtMs: 5000 });
    native.emit('event', { event: 'waitEntered', untilMs: 7000 });

    expect(native.flushEarlyEvents).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      { type: 'keyGenerated' },
      { type: 'attestationSucceeded', durationMs: 850 },
      { type: 'attestationFailed', reasons: ['app_not_allowed'], retryAtMs: null },
      { type: 'refused', retryAtMs: 5000 },
      { type: 'waitEntered', untilMs: 7000 },
    ]);
  });

  it('carries the error of failure events', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);
    const events: Array<{ type: string; error?: { code: string } }> = [];

    TrustPinAttest.onEvent(event => events.push(event as never));
    native.emit('event', { event: 'refreshFailed', code: 'VERIFIER_INCOMPATIBLE', message: 'VerifierIncompatible' });

    expect(events[0]?.type).toBe('refreshFailed');
    expect(events[0]?.error?.code).toBe('VERIFIER_INCOMPATIBLE');
  });

  it('delivers logs with their level and flushes early logs once', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);
    const logs: unknown[] = [];

    TrustPinAttest.onLogEvent(log => logs.push(log));
    native.emit('log', { level: 'warning', message: 'slow', timestampMs: 1 });

    expect(native.flushEarlyLogEvents).toHaveBeenCalledTimes(1);
    expect(logs).toEqual([{ level: 'warning', message: 'slow', timestampMs: 1 }]);
  });

  it('rejects an unknown log level without calling native', async () => {
    const native = makeNativeMock();
    const { TrustPinAttest } = await importAttest(native);

    await expect(TrustPinAttest.setLogLevel('verbose' as never)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENTS',
    });
    await TrustPinAttest.setLogLevel('warning');
    expect(native.setLogLevel).toHaveBeenCalledWith('warning');
  });
});
